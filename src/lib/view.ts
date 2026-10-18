/**
 * View-model helpers: turn validated data into what components render.
 * Every filter here hides unverified facts; components never show raw data.
 */
import type { FormIntent, Project, SiteSettings } from "./schemas";
import {
  agentDisclosure,
  isPlaceholder,
  isRegisterInterestMode,
  isVerified,
  reraStatusLine,
} from "./compliance";
import { waDigits } from "./format";

/* Verified subsets ---------------------------------------------------- */

export function verifiedView(p: Project) {
  return {
    land: p.land && isVerified(p.land) ? p.land : undefined,
    highlights: p.highlights.filter(isVerified),
    connectivity: p.location.connectivity.filter(isVerified),
    configurations: p.configurations.filter(isVerified),
    amenities: p.amenities.filter(isVerified),
    // A step marked done without a source is a claim we cannot back, so it is hidden.
    timeline: p.timeline.filter((t) => !t.done || !isPlaceholder(t.source)),
  };
}

/* Sources ------------------------------------------------------------- */

export type SourceEntry = {
  n: number;
  source: string;
  isUrl: boolean;
  verifiedOn?: string | undefined;
};

/**
 * Numbered source list for footnote markers. Sources are deduplicated in the
 * order facts appear on the page.
 */
export function buildSources(p: Project) {
  const v = verifiedView(p);
  const list: SourceEntry[] = [];
  const index = new Map<string, number>();
  const add = (source?: string, verifiedOn?: string) => {
    if (isPlaceholder(source)) return;
    const existing = index.get(source!);
    if (existing) {
      const entry = list[existing - 1]!;
      if (verifiedOn && (!entry.verifiedOn || verifiedOn > entry.verifiedOn))
        entry.verifiedOn = verifiedOn;
      return;
    }
    const n = list.length + 1;
    index.set(source!, n);
    list.push({ n, source: source!, isUrl: /^https?:\/\//.test(source!), verifiedOn });
  };
  if (v.land) add(v.land.source, v.land.verifiedOn);
  v.highlights.forEach((h) => add(h.source, h.verifiedOn));
  v.configurations.forEach((c) => add(c.source, c.verifiedOn));
  v.amenities.forEach((a) => add(a.source, a.verifiedOn));
  v.connectivity.forEach((c) => add(c.source, c.verifiedOn));
  v.timeline.forEach((t) => add(t.source));
  return { list, ref: (source?: string) => (source ? index.get(source) : undefined) };
}

/** Readable label for a source: the host name for URLs, the text otherwise. */
export function sourceLabel(source: string): string {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

/* Copy that depends on RERA mode ------------------------------------- */

export function ctaCopy(p: Pick<Project, "rera">) {
  return isRegisterInterestMode(p)
    ? { primary: "Register interest", updates: "Get launch updates", advisor: "Talk to an advisor" }
    : { primary: "Enquire now", updates: "Get updates", advisor: "Talk to an advisor" };
}

export const STATUS_LABEL: Record<Project["status"], string> = {
  "pre-registration": "Pre-registration",
  registered: "Registered",
  launched: "Launched",
  "under-construction": "Under construction",
  ready: "Ready to move in",
};

export const RERA_LABEL: Record<Project["rera"]["status"], string> = {
  "not-registered": "Not yet registered",
  applied: "Applied",
  registered: "Registered",
};

/** Resolve {{tokens}} used in FAQ answers. */
export function resolveTokens(text: string, p: Project, settings: SiteSettings): string {
  return text
    .replaceAll("{{rera_status}}", reraStatusLine(p))
    .replaceAll("{{agent_disclosure}}", agentDisclosure(settings, p.developer));
}

/* Contact ------------------------------------------------------------- */

/**
 * Contact links. A number is shown only when it is a well-formed Indian
 * number; production builds additionally reject known dummy numbers.
 */
export function contactView(settings: SiteSettings, project?: Pick<Project, "name">) {
  const b = settings.business;
  const wellFormed = (e164: string) => /^\+91\d{10}$/.test(e164.trim());
  const message = project
    ? `Hello, I would like updates on ${project.name}.`
    : "Hello, I would like to know about new projects in Gurugram.";
  return {
    brand: b.brand_name,
    reraNo: isPlaceholder(b.agent_rera_number) ? undefined : b.agent_rera_number,
    phone: wellFormed(b.phone_e164)
      ? { href: `tel:${b.phone_e164}`, display: b.phone_display }
      : undefined,
    whatsapp: wellFormed(b.whatsapp_e164)
      ? { href: `https://wa.me/${waDigits(b.whatsapp_e164)}?text=${encodeURIComponent(message)}` }
      : undefined,
    email: isPlaceholder(b.email) ? undefined : b.email,
    address: isPlaceholder(b.office_address) ? undefined : b.office_address,
  };
}

/* Enquiry modal headings by intent (used by EnquiryModal in Phase 3). */
export function intentHeading(intent: FormIntent, p: Pick<Project, "rera">): string {
  const ri = isRegisterInterestMode(p);
  switch (intent) {
    case "pricing":
      return ri ? "Get pricing when it is released" : "Get the latest pricing";
    case "floor-plan":
      return "Get the official floor plans";
    case "location":
      return "Get location details";
    case "gallery":
      return "Get project images and updates";
    default:
      return ri ? "Register your interest" : "Talk to an advisor";
  }
}
