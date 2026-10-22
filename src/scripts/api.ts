/**
 * CRM connector. The ONLY place the site talks to an external API.
 *
 * The pages are static. The enquiry form posts from the browser to the site's
 * own lead relay, configured at build time with
 *   PUBLIC_CRM_LEAD_URL=/api/lead.php   (see .env.example)
 * The relay (public/api/lead.php on Hostinger; scripts/leadrat-relay.mjs on the
 * local dev/preview server) validates the lead, attaches the project name and
 * forwards it to Leadrat with the secret API key, which never reaches the browser.
 *
 * SECURITY: everything in this file ships to the browser. Never put the Leadrat
 * key (or any private key) here or in any PUBLIC_ variable.
 *
 * To change what the browser sends, edit toCrmBody() and readCrmResponse();
 * the Leadrat field mapping lives in the relay.
 */
import type { FormIntent } from "~/lib/schemas";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Non-personal campaign data captured on landing (see attribution.ts). */
export interface LeadAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  landingPath?: string;
  referrerHost?: string;
}

/** A validated enquiry, ready to send. Built by enquiry.ts after validation. */
export interface LeadSubmission {
  projectSlug: string;
  projectName: string;
  intent: FormIntent;
  name: string;
  /** "+91XXXXXXXXXX" */
  phoneE164: string;
  email?: string;
  consent: true;
  /** Version id of the consent wording the person agreed to. */
  consentVersion: string;
  /** Exact consent wording shown, stored with the lead as evidence. */
  consentText: string;
  /** ISO timestamp of submission. */
  submittedAt: string;
  /** One UUID per modal open, reused on retry. Lets the CRM drop duplicates. */
  idempotencyKey: string;
  /** Page path the form was sent from, without query string. */
  pagePath: string;
  attribution: LeadAttribution;
}

/** Body sent to the CRM. Generic flat JSON by default; reshape in toCrmBody(). */
export type CrmLeadBody = Record<string, string | boolean | undefined>;

export type SubmitError =
  | "not_configured" // PUBLIC_CRM_LEAD_URL missing
  | "offline" // browser reports no connection
  | "timeout" // no answer within the timeout
  | "network" // request failed (DNS, CORS, connection reset)
  | "http_error" // CRM answered with a non-2xx status
  | "rejected"; // CRM answered 2xx but said the lead was not accepted

export type SubmitResult =
  { ok: true; leadId: string } | { ok: false; error: SubmitError; status?: number };

export interface SubmitOptions {
  /** Defaults to import.meta.env.PUBLIC_CRM_LEAD_URL. */
  endpoint?: string | undefined;
  /** Defaults to 12 seconds. */
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

/** Optional phone verification step (form.otp). No provider is wired in yet. */
export interface OtpProvider {
  send(phoneE164: string): Promise<{ ok: boolean }>;
  verify(phoneE164: string, code: string): Promise<{ ok: boolean }>;
}

/* ------------------------------------------------------------------ */
/* CRM mapping: the two functions to edit when the CRM is chosen       */
/* ------------------------------------------------------------------ */

/** Shape the lead for the CRM. Field names here are a neutral default. */
export function toCrmBody(lead: LeadSubmission): CrmLeadBody {
  const a = lead.attribution;
  return {
    source: "website",
    project_slug: lead.projectSlug,
    project_name: lead.projectName,
    intent: lead.intent,
    name: lead.name,
    phone: lead.phoneE164,
    email: lead.email,
    consent: lead.consent,
    consent_version: lead.consentVersion,
    consent_text: lead.consentText,
    consent_at: lead.submittedAt,
    idempotency_key: lead.idempotencyKey,
    page_path: lead.pagePath,
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    utm_term: a.utm_term,
    utm_content: a.utm_content,
    gclid: a.gclid,
    gbraid: a.gbraid,
    wbraid: a.wbraid,
    fbclid: a.fbclid,
    fbp: a.fbp,
    fbc: a.fbc,
    landing_path: a.landingPath,
    referrer_host: a.referrerHost,
  };
}

/**
 * Decide success from the CRM response. A 2xx is success unless the body
 * explicitly says otherwise. The lead id is the CRM's record id when it
 * returns one, otherwise our idempotency key (both opaque, never PII).
 */
export function readCrmResponse(status: number, body: unknown, lead: LeadSubmission): SubmitResult {
  if (status < 200 || status >= 300) return { ok: false, error: "http_error", status };
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.ok === false || b.success === false || (b.error !== undefined && b.error !== null)) {
    return { ok: false, error: "rejected", status };
  }
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<string, unknown>;
  const id = [b.id, b.leadId, b.name, data.id, data.name].find(
    (v): v is string | number => typeof v === "string" || typeof v === "number",
  );
  return { ok: true, leadId: id !== undefined ? String(id) : lead.idempotencyKey };
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 12_000;

/** Drop empty values so the CRM receives only what we have. */
function compact(body: CrmLeadBody): Record<string, string | boolean> {
  return Object.fromEntries(
    Object.entries(body).filter(
      (e): e is [string, string | boolean] => e[1] !== undefined && e[1] !== "",
    ),
  );
}

export async function submitLead(
  lead: LeadSubmission,
  opts: SubmitOptions = {},
): Promise<SubmitResult> {
  const endpoint = (opts.endpoint ?? import.meta.env.PUBLIC_CRM_LEAD_URL ?? "").trim();

  if (!endpoint) {
    // Local development or a labeled preview build without a CRM: simulate success so
    // the flow can be reviewed. The preview banner tells visitors forms are not connected.
    if (import.meta.env.DEV || import.meta.env.PUBLIC_PREVIEW === "1") {
      console.info("[api] PUBLIC_CRM_LEAD_URL is not set; simulating a successful submit in dev.");
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, leadId: lead.idempotencyKey };
    }
    return { ok: false, error: "not_configured" };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { ok: false, error: "offline" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(compact(toCrmBody(lead))),
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Some CRMs answer 200/201 with an empty body; that is still success.
    }
    return readCrmResponse(res.status, body, lead);
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return { ok: false, error: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
