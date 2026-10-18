import { describe, expect, it } from "vitest";
import {
  ERROR_TEXT,
  consentText,
  isValidEmail,
  isValidName,
  normalizeIndianMobile,
  validateLead,
} from "../../src/lib/validation";

describe("normalizeIndianMobile", () => {
  it.each([
    ["+91 98765-43210", "9876543210"],
    ["098765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["9876543210", "9876543210"],
    ["(+91) 98765 43210", "9876543210"],
    ["6000000000", "6000000000"],
  ])("accepts %s", (raw, expected) => {
    expect(normalizeIndianMobile(raw)).toBe(expected);
  });

  it.each(["5876543210", "98765", "+1 9876543210", "98765432101", "9876a43210", ""])(
    "rejects %s",
    (raw) => {
      expect(normalizeIndianMobile(raw)).toBeNull();
    },
  );
});

describe("name and email", () => {
  it("accepts real names and rejects junk", () => {
    expect(isValidName("Gaurav Sharma")).toBe(true);
    expect(isValidName("A. D'Souza")).toBe(true);
    expect(isValidName("  Ravi   Kumar ")).toBe(true);
    expect(isValidName("R")).toBe(false);
    expect(isValidName("12345")).toBe(false);
    expect(isValidName("x".repeat(61))).toBe(false);
  });

  it("treats email as optional but validates when filled", () => {
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("name@example.in")).toBe(true);
    expect(isValidEmail("name@example")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@x.in`)).toBe(false);
  });
});

describe("validateLead", () => {
  it("returns all three required errors for an empty form", () => {
    const r = validateLead({ name: "", phone: "", email: "", consent: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["consent", "name", "phone"]);
      expect(r.errors.phone).toBe(ERROR_TEXT.phone);
    }
  });

  it("normalizes a valid lead", () => {
    const r = validateLead({
      name: " Ravi  Kumar ",
      phone: "098765 43210",
      email: " R@Example.IN ",
      consent: true,
    });
    expect(r).toEqual({
      ok: true,
      value: { name: "Ravi Kumar", phoneE164: "+919876543210", email: "r@example.in" },
    });
  });

  it("omits an empty email", () => {
    const r = validateLead({ name: "Ravi", phone: "9876543210", email: "", consent: true });
    expect(r.ok && "email" in r.value).toBe(false);
  });

  it("uses the exact consent wording", () => {
    expect(consentText("Gurgaon Properties")).toBe(
      "I agree to be contacted by Gurgaon Properties by call, SMS, WhatsApp or email about this project. I have read the Privacy Policy.",
    );
  });
});
