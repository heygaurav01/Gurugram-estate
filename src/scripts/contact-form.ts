/**
 * Inline hub enquiry form. Same validation, bot checks and CRM connector as the
 * project modal (enquiry.ts). No personal data is stored in the browser.
 */
import { type LeadField, type LeadInput, validateField, validateLead } from "~/lib/validation";
import { type LeadSubmission, submitLead } from "./api";
import { getAttribution } from "./attribution";

const MIN_FILL_MS = 3000;
const FIELDS: LeadField[] = ["name", "phone", "email"];

export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  if (!form) return;
  const live = form.querySelector<HTMLElement>("[data-cf-live]")!;
  const failure = form.querySelector<HTMLElement>("[data-cf-failure]")!;
  const label = form.querySelector<HTMLElement>("[data-cf-label]")!;
  const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));
  const input = (n: string) => form.elements.namedItem(n) as HTMLInputElement;

  // One key per page view; a retry reuses it so the CRM can drop duplicates.
  const idempotencyKey = crypto.randomUUID();
  let startedAt = 0;
  let submitting = false;
  const touched = new Set<LeadField>();

  form.addEventListener("focusin", () => {
    if (!startedAt) startedAt = Date.now();
  });

  const values = (): LeadInput => ({
    name: input("name").value,
    phone: input("phone").value,
    email: input("email").value,
  });
  const showError = (f: LeadField, msg: string | undefined) => {
    form.querySelector<HTMLElement>(`[data-error-for="${f}"]`)!.textContent = msg ?? "";
    if (msg) input(f).setAttribute("aria-invalid", "true");
    else input(f).removeAttribute("aria-invalid");
  };
  const setSubmitting = (on: boolean) => {
    submitting = on;
    form.setAttribute("aria-busy", String(on));
    buttons.forEach((b) => (b.disabled = on));
    label.textContent = on ? "Sending..." : "Send";
    FIELDS.forEach((f) => (input(f).readOnly = on));
  };

  for (const f of FIELDS) {
    input(f).addEventListener("blur", () => {
      if (input(f).value === "") return;
      touched.add(f);
      showError(f, validateField(f, values()));
    });
    input(f).addEventListener("input", () => {
      if (touched.has(f)) showError(f, validateField(f, values()));
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;
    const result = validateLead(values());
    if (!result.ok) {
      FIELDS.forEach((f) => {
        touched.add(f);
        showError(f, result.errors[f]);
      });
      const bad = FIELDS.filter((f) => result.errors[f]);
      live.textContent = `${bad.length} ${bad.length === 1 ? "field needs" : "fields need"} attention.`;
      input(bad[0]!).focus();
      return;
    }
    live.textContent = "";
    failure.hidden = true;
    form.classList.remove("is-failed");

    const thanks = (ref: string) => `/thank-you/?ref=${encodeURIComponent(ref)}`;
    if (
      input("company_website").value !== "" ||
      !startedAt ||
      Date.now() - startedAt < MIN_FILL_MS
    ) {
      window.location.assign(thanks(`x${crypto.randomUUID().slice(0, 8)}`));
      return;
    }

    const lead: LeadSubmission = {
      projectSlug: "general",
      projectName: "General enquiry (hub)",
      intent: "general",
      name: result.value.name,
      phoneE164: result.value.phoneE164,
      ...(result.value.email ? { email: result.value.email } : {}),
      consent: true,
      consentVersion: form.dataset.consentVersion ?? "",
      consentText: form.dataset.consentText ?? "",
      submittedAt: new Date().toISOString(),
      idempotencyKey,
      pagePath: window.location.pathname,
      attribution: getAttribution(),
    };

    setSubmitting(true);
    const res = await submitLead(lead);
    if (res.ok) {
      window.dispatchEvent(
        new CustomEvent("gp:generate_lead", {
          detail: { intent: "general", project: "general", eventId: idempotencyKey },
        }),
      );
      window.location.assign(thanks(res.leadId));
      return;
    }
    setSubmitting(false);
    failure.hidden = false;
    form.classList.add("is-failed");
    failure.querySelector<HTMLButtonElement>("button")?.focus();
  });
}
