/**
 * First-touch campaign attribution. Non-personal data only: UTM parameters,
 * ad click IDs, Meta browser cookies, landing path and referrer host.
 * Stored in sessionStorage under "gp_attr". Never stores name, phone or email.
 */
import type { LeadAttribution } from "./api";

const KEY = "gp_attr";
const PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
] as const;

function readCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : undefined;
}

function load(): LeadAttribution | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LeadAttribution) : undefined;
  } catch {
    return undefined;
  }
}

/** Capture on first page load of the session, then strip tracked params from the URL. */
export function captureAttribution(): void {
  const url = new URL(window.location.href);
  if (!load()) {
    const attr: LeadAttribution = { landingPath: url.pathname };
    for (const p of PARAMS) {
      const v = url.searchParams.get(p);
      if (v) attr[p] = v.slice(0, 200);
    }
    if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (host !== url.hostname) attr.referrerHost = host;
      } catch {
        // ignore malformed referrers
      }
    }
    try {
      sessionStorage.setItem(KEY, JSON.stringify(attr));
    } catch {
      // storage blocked (private mode): attribution is best effort
    }
  }
  // Keep canonical URLs clean and avoid click IDs being shared onward.
  if (PARAMS.some((p) => url.searchParams.has(p))) {
    PARAMS.forEach((p) => url.searchParams.delete(p));
    history.replaceState(history.state, "", url.pathname + (url.search || "") + url.hash);
  }
}

/** Attribution for a submission, with Meta cookies read at send time. */
export function getAttribution(): LeadAttribution {
  const attr: LeadAttribution = { ...(load() ?? { landingPath: window.location.pathname }) };
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  if (fbp) attr.fbp = fbp;
  if (fbc) attr.fbc = fbc;
  return attr;
}
