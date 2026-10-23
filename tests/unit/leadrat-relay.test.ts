import { describe, expect, it, vi } from "vitest";
import {
  istStamp,
  relayLead,
  toLeadratPayload,
  validateLead,
} from "../../scripts/leadrat-relay.mjs";

const projects = {
  "m3m-franck-muller-sector-43-gurgaon": {
    name: "M3M Franck Muller, Sector 43, Gurgaon",
    location: "Sector 43",
    city: "Gurugram",
    state: "Haryana",
  },
};
const body = {
  project_slug: "m3m-franck-muller-sector-43-gurgaon",
  intent: "floor-plan",
  name: "  Gaurav   Sharma ",
  phone: "+919917014709",
  email: "gaurav@example.com",
  page_path: "/m3m-franck-muller-sector-43-gurgaon/",
  idempotency_key: "abc-123",
  consent_version: "2026-10-v2",
  consent_at: "2026-10-22T10:00:00.000Z",
  utm_campaign: "fm-launch",
};

describe("validateLead", () => {
  it("cleans a good lead and keeps only the 10-digit mobile", () => {
    const v = validateLead(body, projects);
    expect(v.lead?.name).toBe("Gaurav Sharma");
    expect(v.lead?.mobile).toBe("9917014709");
    expect(v.lead?.project.name).toBe("M3M Franck Muller, Sector 43, Gurgaon");
  });
  it("rejects unknown projects, bad phones, bad emails and filled honeypots", () => {
    expect(validateLead({ ...body, project_slug: "nope" }, projects).error).toBe("project");
    expect(validateLead({ ...body, phone: "12345" }, projects).error).toBe("phone");
    expect(validateLead({ ...body, email: "not-an-email" }, projects).error).toBe("email");
    expect(validateLead({ ...body, company_website: "x" }, projects).error).toBe("spam");
  });
});

describe("toLeadratPayload", () => {
  it("names the project on every lead, in Leadrat's Website format", () => {
    const lead = validateLead(body, projects).lead!;
    const [p] = toLeadratPayload(lead, new Date("2026-10-22T04:30:05Z"));
    expect(p).toMatchObject({
      name: "Gaurav Sharma",
      countryCode: "91",
      mobile: "9917014709",
      email: "gaurav@example.com",
      project: "M3M Franck Muller Sector 43 Gurgaon",
      location: "Sector 43",
      submittedDate: "22-10-26",
      submittedTime: "10:00:05",
      subSource: "Landing page: m3m-franck-muller-sector-43-gurgaon",
      CampaignName: "fm-launch",
    });
    expect(p!.notes).toContain("Floor plan / master plan request");
    expect(p!.additionalProperties).toMatchObject({
      WebsiteLeadId: "abc-123",
      utm_campaign: "fm-launch",
    });
  });
  it("formats India time", () => {
    expect(istStamp(new Date("2026-01-01T20:00:00Z"))).toEqual({
      date: "02-01-26",
      time: "01:30:00",
    });
  });
});

describe("assignment", () => {
  it("adds primaryUser only when one is configured", () => {
    const lead = validateLead(body, projects).lead!;
    expect(toLeadratPayload(lead, new Date(), "Gaurav Sharma")[0]).toMatchObject({
      primaryUser: "Gaurav Sharma",
    });
    expect(toLeadratPayload(lead)[0]).not.toHaveProperty("primaryUser");
  });
});

describe("relayLead", () => {
  it("sends the key only in the header and reports success", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const out = await relayLead(body, { apiKey: "secret", projects, fetchImpl });
    expect(out).toEqual({ status: 200, json: { ok: true, id: "abc-123" } });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["API-Key"]).toBe("secret");
    expect(String(init.body)).not.toContain("secret");
  });
  it("reports a CRM rejection and a missing key", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    expect((await relayLead(body, { apiKey: "k", projects, fetchImpl })).status).toBe(502);
    expect((await relayLead(body, { apiKey: "", projects })).json).toMatchObject({
      error: "not_configured",
    });
  });
});
