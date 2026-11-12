/**
 * Inline hub enquiry form. Same validation, bot checks and CRM connector as the
 * project modal (enquiry.ts). No personal data is stored in the browser.
 * With a role field the form is a job application (careers page).
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
  const role = form.querySelector<HTMLSelectElement>('select[name="role"]');
  const roleError = form.querySelector<HTMLElement>('[data-error-for="role"]');
  const sendLabel = label.textContent ?? "Send";
  const thanksPath = form.dataset.thanksPath ?? "/thank-you/";

  const showRoleError = (msg: string) => {
    if (!role || !roleError) return;
    roleError.textContent = msg;
    if (msg) role.setAttribute("aria-invalid", "true");
    else role.removeAttribute("aria-invalid");
  };
  role?.addEventListener("change", () => showRoleError(""));

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
    label.textContent = on ? "Sending..." : sendLabel;
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
    const roleMissing = role !== null && role.value === "";
    showRoleError(roleMissing ? "Please choose a role." : "");
    if (!result.ok || roleMissing) {
      const bad = result.ok ? [] : FIELDS.filter((f) => result.errors[f]);
      if (!result.ok) {
        FIELDS.forEach((f) => {
          touched.add(f);
          showError(f, result.errors[f]);
        });
      }
      const count = bad.length + (roleMissing ? 1 : 0);
      live.textContent = `${count} ${count === 1 ? "field needs" : "fields need"} attention.`;
      if (roleMissing) role.focus();
      else input(bad[0]!).focus();
      return;
    }
    live.textContent = "";
    failure.hidden = true;
    form.classList.remove("is-failed");

    const thanks = (ref: string) => `${thanksPath}?ref=${encodeURIComponent(ref)}`;
    if (
      input("company_website").value !== "" ||
      !startedAt ||
      Date.now() - startedAt < MIN_FILL_MS
    ) {
      window.location.assign(thanks(`x${crypto.randomUUID().slice(0, 8)}`));
      return;
    }

    const message = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.value;
    const lead: LeadSubmission = {
      projectSlug: role ? `careers-${role.value}` : "general",
      projectName: role
        ? `Job application ${role.selectedOptions[0]?.text ?? ""}`
        : "General enquiry (hub)",
      intent: role ? "career" : "general",
      name: result.value.name,
      phoneE164: result.value.phoneE164,
      ...(result.value.email ? { email: result.value.email } : {}),
      ...(message?.trim() ? { message: message.trim() } : {}),
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
      // Job applications are not sales leads, so they never count as ad conversions.
      if (!role) {
        window.dispatchEvent(
          new CustomEvent("gp:generate_lead", {
            detail: {
              intent: "general",
              project: "general",
              projectName: "General enquiry",
              eventId: idempotencyKey,
            },
          }),
        );
      }
      window.location.assign(thanks(res.leadId));
      return;
    }
    setSubmitting(false);
    failure.hidden = false;
    form.classList.add("is-failed");
    failure.querySelector<HTMLButtonElement>("button")?.focus();
  });
}
