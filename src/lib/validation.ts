/**
 * Enquiry form rules. Pure functions, used by the browser forms and unit tests.
 * If the CRM validates too, keep its rules in line with these.
 */

/**
 * Bump when the consent wording changes; stored with every lead.
 * v2: consent is given by pressing Send after a clear notice (no checkbox).
 */
export const CONSENT_VERSION = "2026-10-v2";

/** Exact consent notice shown above the Send button and stored with each lead. */
export function consentText(brand: string): string {
  return `By sending this form, you agree to be contacted by ${brand} by call, SMS, WhatsApp or email about this enquiry, and you confirm you have read the Privacy Policy.`;
}

export type LeadField = "name" | "phone" | "email";
export type FieldErrors = Partial<Record<LeadField, string>>;

export const ERROR_TEXT: Record<LeadField, string> = {
  name: "Please enter your name.",
  phone: "Please enter a valid 10-digit Indian mobile number.",
  email: "Please check your email address.",
};

const NAME_RE = /^[A-Za-z][A-Za-z .']{1,59}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trim and collapse internal whitespace. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Normalize an Indian mobile number to its 10 national digits.
 * Accepts spaces, dashes, dots and brackets, and a leading +91, 91 (12 digits) or 0.
 * Returns null when the result is not a valid Indian mobile.
 */
export function normalizeIndianMobile(raw: string): string | null {
  const trimmed = raw.trim();
  if (/[^\d\s\-().+]/.test(trimmed)) return null;
  let digits = trimmed.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+91")) return null;
    digits = digits.slice(3);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return MOBILE_RE.test(digits) ? digits : null;
}

export function isValidName(raw: string): boolean {
  return NAME_RE.test(normalizeName(raw));
}

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  return v === "" || (v.length <= 254 && EMAIL_RE.test(v));
}

export type LeadInput = { name: string; phone: string; email: string };
export type CleanLead = { name: string; phoneE164: string; email?: string };

export function validateField(field: LeadField, input: LeadInput): string | undefined {
  switch (field) {
    case "name":
      return isValidName(input.name) ? undefined : ERROR_TEXT.name;
    case "phone":
      return normalizeIndianMobile(input.phone) ? undefined : ERROR_TEXT.phone;
    case "email":
      return isValidEmail(input.email) ? undefined : ERROR_TEXT.email;
  }
}

export function validateLead(
  input: LeadInput,
): { ok: true; value: CleanLead } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  for (const f of ["name", "phone", "email"] as const) {
    const e = validateField(f, input);
    if (e) errors[f] = e;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const email = input.email.trim().toLowerCase();
  return {
    ok: true,
    value: {
      name: normalizeName(input.name),
      phoneE164: `+91${normalizeIndianMobile(input.phone)!}`,
      ...(email ? { email } : {}),
    },
  };
}
