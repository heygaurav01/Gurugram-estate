import { describe, expect, it, vi } from "vitest";
import { type LeadSubmission, readCrmResponse, submitLead, toCrmBody } from "../../src/scripts/api";

const lead: LeadSubmission = {
  projectSlug: "l-and-t-sector-86-gurgaon",
  projectName: "L&T Sector 86, Gurgaon",
  intent: "pricing",
  name: "Ravi Kumar",
  phoneE164: "+919876543210",
  consent: true,
  consentVersion: "2026-10-v1",
  consentText: "I agree...",
  submittedAt: "2026-10-18T10:00:00.000Z",
  idempotencyKey: "11111111-2222-3333-4444-555555555555",
  pagePath: "/l-and-t-sector-86-gurgaon/",
  attribution: { utm_source: "google", gclid: "abc", landingPath: "/l-and-t-sector-86-gurgaon/" },
};

const ENDPOINT = "https://crm.example.test/lead";
const respond = (status: number, body?: unknown) =>
  vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );

describe("toCrmBody", () => {
  it("maps lead and attribution fields", () => {
    const body = toCrmBody(lead);
    expect(body).toMatchObject({
      project_slug: lead.projectSlug,
      intent: "pricing",
      phone: "+919876543210",
      consent: true,
      consent_version: "2026-10-v1",
      idempotency_key: lead.idempotencyKey,
      utm_source: "google",
      gclid: "abc",
    });
  });
});

describe("readCrmResponse", () => {
  it("uses the CRM record id when present", () => {
    expect(readCrmResponse(201, { id: "LEAD-42" }, lead)).toEqual({ ok: true, leadId: "LEAD-42" });
    expect(readCrmResponse(200, { data: { name: "CRM-LEAD-7" } }, lead)).toEqual({
      ok: true,
      leadId: "CRM-LEAD-7",
    });
  });

  it("falls back to the idempotency key", () => {
    expect(readCrmResponse(204, null, lead)).toEqual({ ok: true, leadId: lead.idempotencyKey });
  });

  it("treats explicit failures and non-2xx as errors", () => {
    expect(readCrmResponse(200, { ok: false }, lead)).toMatchObject({
      ok: false,
      error: "rejected",
    });
    expect(readCrmResponse(200, { success: false }, lead)).toMatchObject({
      ok: false,
      error: "rejected",
    });
    expect(readCrmResponse(500, {}, lead)).toMatchObject({
      ok: false,
      error: "http_error",
      status: 500,
    });
  });
});

describe("submitLead", () => {
  it("POSTs compact JSON to the endpoint", async () => {
    const fetchImpl = respond(200, { id: 9 });
    const res = await submitLead(lead, { endpoint: ENDPOINT, fetchImpl });
    expect(res).toEqual({ ok: true, leadId: "9" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    const sent = JSON.parse(init.body as string);
    expect(sent).not.toHaveProperty("email"); // undefined values dropped
    expect(sent.name).toBe("Ravi Kumar");
  });

  it("succeeds on an empty 2xx body", async () => {
    const res = await submitLead(lead, { endpoint: ENDPOINT, fetchImpl: respond(201) });
    expect(res).toEqual({ ok: true, leadId: lead.idempotencyKey });
  });

  it("reports http errors", async () => {
    expect(
      await submitLead(lead, { endpoint: ENDPOINT, fetchImpl: respond(500, {}) }),
    ).toMatchObject({
      ok: false,
      error: "http_error",
    });
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await submitLead(lead, { endpoint: ENDPOINT, fetchImpl })).toEqual({
      ok: false,
      error: "network",
    });
  });

  it("times out", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    expect(await submitLead(lead, { endpoint: ENDPOINT, fetchImpl, timeoutMs: 20 })).toEqual({
      ok: false,
      error: "timeout",
    });
  });
});
