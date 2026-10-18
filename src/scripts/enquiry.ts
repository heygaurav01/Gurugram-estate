/**
 * Enquiry modal behavior: open by intent, validate, submit to the CRM via
 * api.ts, redirect to thank-you only after a confirmed success.
 * No name, phone or email is ever written to storage, URLs or analytics.
 */
import type { FormIntent } from "~/lib/schemas";
import {
  type FieldErrors,
  type LeadField,
  type LeadInput,
  validateField,
  validateLead,
} from "~/lib/validation";
import { type LeadSubmission, submitLead } from "./api";
import { getAttribution } from "./attribution";

/** Submissions faster than this after opening are treated as bots. */
const MIN_FILL_MS = 3000;
const FIELDS: LeadField[] = ["name", "phone", "email", "consent"];

/** Fired for analytics (Phase 5). Payloads never contain personal data. */
function emit(name: string, detail: Record<string, string>): void {
  window.dispatchEvent(new CustomEvent(`gp:${name}`, { detail }));
}

export function initEnquiry(): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-enquiry]");
  if (!dialog) return;
  const form = dialog.querySelector<HTMLFormElement>("[data-enquiry-form]")!;
  const title = dialog.querySelector<HTMLElement>("[data-enquiry-title]")!;
  const live = dialog.querySelector<HTMLElement>("[data-enquiry-live]")!;
  const failure = dialog.querySelector<HTMLElement>("[data-enquiry-failure]")!;
  const success = dialog.querySelector<HTMLElement>("[data-enquiry-success]")!;
  const submitLabel = dialog.querySelector<HTMLElement>("[data-submit-label]")!;
  const submitButtons = Array.from(
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  );
  const headings = JSON.parse(dialog.dataset.headings ?? "{}") as Partial<
    Record<FormIntent, string>
  >;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

  let trigger: HTMLElement | null = null;
  let intent: FormIntent = "hero";
  let idempotencyKey = "";
  let openedAt = 0;
  let submitting = false;
  const touched = new Set<LeadField>();

  const values = (): LeadInput => ({
    name: input("name").value,
    phone: input("phone").value,
    email: input("email").value,
    consent: input("consent").checked,
  });

  const showError = (field: LeadField, message: string | undefined) => {
    const el = input(field);
    const slot = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`)!;
    slot.textContent = message ?? "";
    if (message) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  };

  const setSubmitting = (on: boolean) => {
    submitting = on;
    form.setAttribute("aria-busy", String(on));
    submitButtons.forEach((b) => (b.disabled = on));
    submitLabel.textContent = on ? "Sending..." : "Send";
    for (const f of ["name", "phone", "email"]) input(f).readOnly = on;
    input("consent").disabled = on;
  };

  const setFailed = (on: boolean) => {
    failure.hidden = !on;
    form.classList.toggle("is-failed", on);
  };

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Close with the exit animation; instant under reduced motion. */
  const closeAnimated = (): Promise<void> =>
    new Promise((resolve) => {
      if (!dialog.open) return resolve();
      if (reduceMotion()) {
        dialog.close();
        return resolve();
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        dialog.removeEventListener("animationend", onEnd);
        dialog.classList.remove("is-closing");
        dialog.close();
        resolve();
      };
      const onEnd = (e: AnimationEvent) => {
        if (e.target === dialog) finish();
      };
      dialog.addEventListener("animationend", onEnd);
      dialog.classList.add("is-closing");
      // Safety net in case the animation is skipped by the browser.
      window.setTimeout(finish, 450);
    });

  const open = (nextIntent: FormIntent, from: HTMLElement | null) => {
    form.hidden = false;
    success.hidden = true;
    dialog.classList.remove("is-closing");
    trigger = from;
    intent = nextIntent;
    title.textContent = headings[nextIntent] ?? headings.hero ?? title.textContent;
    // One key per open; a retry within the same open reuses it.
    idempotencyKey = crypto.randomUUID();
    openedAt = Date.now();
    touched.clear();
    FIELDS.forEach((f) => showError(f, undefined));
    setFailed(false);
    live.textContent = "";
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    input("name").focus();
    emit("form_open", { intent });
  };

  // Delegated so any trigger on the page works, including ones added later.
  document.addEventListener("click", (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>("[data-enquire]");
    if (!t) return;
    e.preventDefault();
    const i = (t.dataset.enquire ?? "hero") as FormIntent;
    emit("cta_click", { intent: i });
    open(i, t);
  });

  dialog
    .querySelector("[data-enquiry-close]")
    ?.addEventListener("click", () => void closeAnimated());
  // Backdrop click: the click lands on the dialog element itself, outside the panel.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) void closeAnimated();
  });
  // Esc: play the exit animation instead of closing abruptly.
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    void closeAnimated();
  });
  dialog.addEventListener("close", () => {
    document.documentElement.style.overflow = "";
    // A trigger inside the closed mobile menu is hidden; fall back to the menu button.
    const target =
      trigger && trigger.getClientRects().length > 0
        ? trigger
        : document.querySelector<HTMLElement>("[data-nav-open]");
    target?.focus();
  });

  // Validate on blur after the first interaction with a field.
  for (const f of FIELDS) {
    const el = input(f);
    el.addEventListener("blur", () => {
      if (f !== "consent" && el.value === "") return;
      touched.add(f);
      showError(f, validateField(f, values()));
    });
    el.addEventListener(f === "consent" ? "change" : "input", () => {
      if (touched.has(f)) showError(f, validateField(f, values()));
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;

    const result = validateLead(values());
    if (!result.ok) {
      const errors: FieldErrors = result.errors;
      FIELDS.forEach((f) => {
        touched.add(f);
        showError(f, errors[f]);
      });
      const bad = FIELDS.filter((f) => errors[f]);
      live.textContent = `${bad.length} ${bad.length === 1 ? "field needs" : "fields need"} attention.`;
      input(bad[0]!).focus();
      bad.forEach((f) => emit("form_error", { field: f }));
      return;
    }
    live.textContent = "";
    setFailed(false);

    const slug = dialog.dataset.slug!;
    const thanks = (ref: string) => `/${slug}/thank-you/?ref=${encodeURIComponent(ref)}`;

    // Bot checks: honeypot filled or impossibly fast. Pretend success, send nothing.
    if (input("company_website").value !== "" || Date.now() - openedAt < MIN_FILL_MS) {
      window.location.assign(thanks(`x${crypto.randomUUID().slice(0, 8)}`));
      return;
    }

    const lead: LeadSubmission = {
      projectSlug: slug,
      projectName: dialog.dataset.projectName ?? slug,
      intent,
      name: result.value.name,
      phoneE164: result.value.phoneE164,
      ...(result.value.email ? { email: result.value.email } : {}),
      consent: true,
      consentVersion: dialog.dataset.consentVersion ?? "",
      consentText: dialog.dataset.consentText ?? "",
      submittedAt: new Date().toISOString(),
      idempotencyKey,
      pagePath: window.location.pathname,
      attribution: getAttribution(),
    };

    setSubmitting(true);
    const res = await submitLead(lead);
    if (res.ok) {
      emit("generate_lead", { intent, project: slug, eventId: idempotencyKey });
      const next = thanks(res.leadId);
      if (!reduceMotion()) {
        // Confirm in place, close the form with its exit animation, then show the thank-you page.
        form.hidden = true;
        success.hidden = false;
        live.textContent = "Thank you. We have your details.";
        await new Promise((r) => window.setTimeout(r, 900));
        await closeAnimated();
      }
      window.location.assign(next);
      return; // stay in the submitting state while the browser navigates
    }
    setSubmitting(false);
    setFailed(true);
    failure.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  });
}
