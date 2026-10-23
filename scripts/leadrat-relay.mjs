// @ts-check
/**
 * Leadrat relay: shared logic for the local dev relay (astro.config.mjs) and a
 * mirror of public/api/lead.php (the relay that runs on Hostinger).
 *
 * The browser never sees the Leadrat API key. It posts the enquiry to the same
 * site at /api/lead.php; the relay validates it, looks the project up in the
 * build's allowlist (api/lead-projects.json), shapes it for Leadrat's Website
 * integration and forwards it with the key from server-side config.
 *
 * Keep this file and public/api/lead.php in step.
 */

export const LEADRAT_DEFAULT_URL = "https://connect.leadrat.com/api/v1/integration/Website";

/** @typedef {{ name: string, location?: string, city?: string, state?: string }} ProjectInfo */
/** @typedef {Record<string, unknown>} Body */

const INTENT_LABEL = {
  hero: "Hero enquiry",
  pricing: "Pricing request",
  "floor-plan": "Floor plan / master plan request",
  gallery: "Gallery: official images",
  location: "Location / map",
  footer: "Footer enquiry",
  sticky: "Sticky bar enquiry",
  nav: "Header enquiry",
  amenities: "Amenities",
  "virtual-tour": "Virtual tour",
  general: "General enquiry",
};

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate the browser's body. Returns the clean lead or an error code.
 * @param {Body} body
 * @param {Record<string, ProjectInfo>} projects slug -> project info (the allowlist)
 */
export function validateLead(body, projects) {
  if (str(body.company_website)) return { error: "spam" }; // honeypot
  const name = str(body.name).replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80 || /[<>{}]/.test(name)) return { error: "name" };
  const digits = str(body.phone)
    .replace(/\D/g, "")
    .replace(/^(91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) return { error: "phone" };
  const email = str(body.email);
  if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)))
    return { error: "email" };
  const slug = str(body.project_slug);
  const project = projects[slug];
  if (!project) return { error: "project" };
  return {
    lead: {
      slug,
      project,
      name,
      mobile: digits,
      email,
      intent: str(body.intent) || "general",
      pagePath: str(body.page_path).slice(0, 200),
      idempotencyKey: str(body.idempotency_key).slice(0, 64),
      consentVersion: str(body.consent_version).slice(0, 40),
      consentAt: str(body.consent_at).slice(0, 40),
      utm: {
        source: str(body.utm_source).slice(0, 100),
        medium: str(body.utm_medium).slice(0, 100),
        campaign: str(body.utm_campaign).slice(0, 150),
        term: str(body.utm_term).slice(0, 150),
        content: str(body.utm_content).slice(0, 150),
        gclid: str(body.gclid).slice(0, 200),
      },
    },
  };
}

/** India time, as Leadrat's sample shows: "dd-mm-yy" and "HH:mm:ss". */
export function istStamp(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const p = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return {
    date: `${p(ist.getUTCDate())}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCFullYear() % 100)}`,
    time: `${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`,
  };
}

/**
 * Shape a validated lead for Leadrat's Website integration (an array of leads).
 * The project name goes in "project" so every lead is identified in the CRM.
 * @param {NonNullable<ReturnType<typeof validateLead>["lead"]>} lead
 * @param {Date} [now]
 * @param {string} [primaryUser] Leadrat user the lead is assigned to (full name).
 *   Unassigned leads do not show in "All / My Leads / Team's" in Leadrat.
 */
export function toLeadratPayload(lead, now = new Date(), primaryUser = "") {
  const { date, time } = istStamp(now);
  const intent =
    INTENT_LABEL[/** @type {keyof typeof INTENT_LABEL} */ (lead.intent)] ?? lead.intent;
  const notes = [
    `Website enquiry for ${lead.project.name}.`,
    `Form: ${intent}.`,
    lead.pagePath && `Page: ${lead.pagePath}.`,
    lead.consentVersion && `Consent ${lead.consentVersion} given at ${lead.consentAt}.`,
  ]
    .filter(Boolean)
    .join(" ");
  /** @type {Record<string, string>} */
  const extra = {
    EnquiredFor: "Buy",
    FormIntent: intent,
    LandingPage: lead.pagePath,
    ProjectSlug: lead.slug,
  };
  if (lead.idempotencyKey) extra.WebsiteLeadId = lead.idempotencyKey;
  for (const [k, v] of Object.entries(lead.utm)) if (v) extra[`utm_${k}`] = v;
  return [
    {
      name: lead.name,
      countryCode: "91",
      mobile: lead.mobile,
      email: lead.email,
      // Leadrat splits "project" on commas, so never send one.
      project: lead.project.name.replace(/\s*,\s*/g, " "),
      location: lead.project.location ?? "",
      city: lead.project.city ?? "Gurugram",
      state: lead.project.state ?? "Haryana",
      notes,
      submittedDate: date,
      submittedTime: time,
      subSource: `Landing page: ${lead.slug}`,
      CampaignName: lead.utm.campaign,
      additionalProperties: extra,
      ...(primaryUser ? { primaryUser } : {}),
    },
  ];
}

/**
 * Validate, shape and forward one lead. Returns the HTTP status and JSON body
 * the relay sends back to the browser.
 * @param {Body} body
 * @param {{ apiKey: string, url?: string, primaryUser?: string, projects: Record<string, ProjectInfo>, fetchImpl?: typeof fetch }} opts
 */
export async function relayLead(body, opts) {
  if (!opts.apiKey) return { status: 503, json: { ok: false, error: "not_configured" } };
  const v = validateLead(body, opts.projects);
  if (v.error === "spam") return { status: 200, json: { ok: true, id: "ok" } }; // silent drop
  if (!v.lead) return { status: 400, json: { ok: false, error: v.error } };
  const res = await (opts.fetchImpl ?? fetch)(opts.url || LEADRAT_DEFAULT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "API-Key": opts.apiKey },
    body: JSON.stringify(toLeadratPayload(v.lead, new Date(), opts.primaryUser ?? "")),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status < 200 || res.status >= 300) {
    return { status: 502, json: { ok: false, error: "crm_rejected", crmStatus: res.status } };
  }
  return { status: 200, json: { ok: true, id: v.lead.idempotencyKey || "ok" } };
}
