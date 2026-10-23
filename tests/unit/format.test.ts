import { describe, expect, it } from "vitest";
import { formatDate, formatInr, formatSqftRange, waDigits } from "../../src/lib/format";

describe("format", () => {
  it("formats INR in lakh and crore", () => {
    expect(formatInr(32500000)).toBe("Rs 3.25 Cr");
    expect(formatInr(30000000)).toBe("Rs 3 Cr");
    expect(formatInr(8500000)).toBe("Rs 85 Lakh");
    expect(formatInr(45000)).toBe("Rs 45,000");
  });

  it("formats sq ft ranges", () => {
    expect(formatSqftRange(1850, 2400)).toBe("1,850 to 2,400 sq ft");
    expect(formatSqftRange(1850)).toBe("1,850 sq ft");
    expect(formatSqftRange()).toBeUndefined();
  });

  it("formats ISO dates", () => {
    expect(formatDate("2026-10-18")).toBe("18 Oct 2026");
  });

  it("strips E.164 to wa.me digits", () => {
    expect(waDigits("+919812345678")).toBe("919812345678");
  });
});
