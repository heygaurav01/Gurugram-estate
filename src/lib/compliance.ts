/**
 * Compliance rules for project data and built HTML.
 *
 * Pure functions with no I/O so they can be unit tested and shared by
 * Astro components and scripts/check-compliance.mjs.
 */
import type { Asset, Project, SiteSettings } from "./schemas";
import { approvedLicenses } from "./schemas";
import { contrastRatio } from "./color";

/** Page background token (--bone). Kept in sync with src/styles/tokens.css. */
export const BONE = "#F4F1EA";

export type Finding = { rule: string; message: string };
export type Report = { errors: Finding[]; warnings: Finding[] };

/* ------------------------------------------------------------------ */
/* Placeholders and verification                                       */
/* ------------------------------------------------------------------ */

/** True for empty values and anything starting with "TBD". */
export function isPlaceholder(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  return v === "" || v.toUpperCase().startsWith("TBD");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A fact renders only when it names a real source and an ISO verification date. */
export function isVerified(fact: {
  source?: string | undefined;
  verifiedOn?: string | undefined;
}): boolean {
  if (isPlaceholder(fact.source) || isPlaceholder(fact.verifiedOn)) return false;
  if (!ISO_DATE.test(fact.verifiedOn!)) return false;
  return !Number.isNaN(Date.parse(fact.verifiedOn!));
}

/** Known dummy numbers that must never ship (e.g. the sample in the master prompt). */
const DUMMY_DIGITS = ["1234567890", "0000000000", "9999999999", "9876543210"];

/** Indian mobile in E.164 that is not an obvious dummy. */
export function isRealIndianMobileE164(e164: string): boolean {
  const m = /^\+91([6-9]\d{9})$/.exec(e164.trim());
  return m !== null && !DUMMY_DIGITS.includes(m[1]!);
}

export function isRegisterInterestMode(project: Pick<Project, "rera">): boolean {
  return project.rera.status !== "registered";
}

/* ------------------------------------------------------------------ */
/* Required copy                                                       */
/* ------------------------------------------------------------------ */

/** The text shown in place of a TBD value. */
export const ON_REQUEST = "On request";

/** Agent disclosure required on every page. */
export function agentDisclosure(
  settings: SiteSettings,
  developer?: Pick<Project["developer"], "name" | "authorizedChannelPartner">,
): string {
  const authorizedChannelPartner = developer?.authorizedChannelPartner === true;
  const brand = brandWithLegalName(settings);
  const reraNo = isPlaceholder(settings.business.agent_rera_number)
    ? ON_REQUEST
    : settings.business.agent_rera_number;
  const role =
    authorizedChannelPartner && developer
      ? `an authorized channel partner of ${developer.name}`
      : "an independent real estate agent";
  return `${brand} is ${role}, HARERA agent registration no. ${reraNo}. This is not the developer's official website.`;
}

/** "Gurgaon Properties, a brand of Gurugram Real Estate Pvt Ltd," or just the brand. */
export function brandWithLegalName(settings: SiteSettings): string {
  const { brand_name, legal_name } = settings.business;
  return legal_name && !isPlaceholder(legal_name) && legal_name !== brand_name
    ? `${brand_name}, a brand of ${legal_name},`
    : brand_name;
}

/** Name of the company for the homepage: the legal name when set, else the brand. */
export function companyName(settings: SiteSettings): string {
  const legal = settings.business.legal_name;
  return legal && !isPlaceholder(legal) ? legal : settings.business.brand_name;
}

export const HARERA_URL = "https://haryanarera.gov.in";

/** One-line RERA status for the hero, configurations and footer. */
export function reraStatusLine(project: Pick<Project, "rera">): string {
  switch (project.rera.status) {
    case "registered":
      return `RERA registration no. ${project.rera.number}. Verify at haryanarera.gov.in.`;
    case "applied":
      return "RERA registration: applied, not yet granted. We will share pricing and plans only after registration.";
    default:
      return "RERA registration: not yet registered. We will share pricing and plans only after registration.";
  }
}

/* ------------------------------------------------------------------ */
/* Banned language                                                     */
/* ------------------------------------------------------------------ */

/** Banned anywhere on a page for a project that is not RERA registered. */
export const REGISTER_INTEREST_BANNED: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "EOI", re: /\bEOIs?\b/i },
  { label: "expression of interest", re: /\bexpressions? of interest\b/i },
  { label: "booking", re: /\bbookings?\b/i },
  { label: "book now", re: /\bbook now\b/i },
  { label: "pre-launch offer", re: /\bpre-?launch offers?\b/i },
  { label: "limited units", re: /\blimited units?\b/i },
  { label: "price sheet", re: /\bprice ?sheets?\b/i },
  { label: "payment plan", re: /\bpayment plans?\b/i },
  { label: "official site", re: /\bofficial (?:web)?sites?\b/i },
];

/**
 * Required disclosure wording that legitimately contains a banned term
 * ("official website"). Removed before scanning so the disclosure itself
 * does not trip the rule.
 */
const ALLOWED_PHRASES: RegExp[] = [/not the developer['’]s official website/gi];

/** Marketing filler banned from all copy. */
export const FILLER_BANNED = [
  "nestled",
  "in the heart of",
  "unparalleled",
  "world-class",
  "world class",
  "redefine luxury",
  "elevate your lifestyle",
  "a perfect blend",
  "seamless",
  "unmatched",
  "dream home awaits",
  "experience the epitome",
];

/** Fake urgency patterns banned from all copy. */
const URGENCY_BANNED: RegExp[] = [
  /\bonly \d+ units? left\b/i,
  /\bprices? (?:rising|increase|going up) (?:tomorrow|soon)\b/i,
  /\bhurry\b/i,
];

const EM_DASH = "—";

/**
 * @param companyPage The company's own pages (homepage) may truthfully say
 * "official website"; every other banned term still applies.
 */
export function findBannedRegisterInterest(text: string, companyPage = false): string[] {
  let cleaned = text;
  for (const re of ALLOWED_PHRASES) cleaned = cleaned.replace(re, " ");
  return REGISTER_INTEREST_BANNED.filter(
    ({ label, re }) => !(companyPage && label === "official site") && re.test(cleaned),
  ).map(({ label }) => label);
}

export function findFiller(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = FILLER_BANNED.filter((p) => lower.includes(p));
  for (const re of URGENCY_BANNED) if (re.test(text)) hits.push(re.source);
  return hits;
}

export function hasEmDash(text: string): boolean {
  return text.includes(EM_DASH);
}

/* ------------------------------------------------------------------ */
/* Project data checks                                                 */
/* ------------------------------------------------------------------ */

export type ProjectCheckInput = {
  project: Project;
  assets: Asset[];
  /** File names (relative to images/) actually present on disk. */
  imageFiles: string[];
  settings: SiteSettings;
  /** Folder name the project lives in; must equal project.slug. */
  dirName?: string;
  /** Production builds turn launch blockers from warnings into errors. */
  production: boolean;
  /** From settings or project; true only with written developer authorization. */
  authorizedChannelPartner?: boolean;
};

/** Collect every user-facing string in a project file for copy scans. */
function projectCopy(p: Project): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [
    { where: "name", text: p.name },
    { where: "seo.title", text: p.seo.title },
    { where: "seo.description", text: p.seo.description },
  ];
  if (p.tagline) out.push({ where: "tagline", text: p.tagline });
  if (p.developer.about) out.push({ where: "developer.about", text: p.developer.about });
  if (p.overview) {
    out.push({ where: "overview.title", text: p.overview.title });
    p.overview.body.forEach((t, i) => out.push({ where: `overview.body[${i}]`, text: t }));
  }
  if (p.land?.note) out.push({ where: "land.note", text: p.land.note });
  p.highlights.forEach((h, i) => out.push({ where: `highlights[${i}]`, text: h.text }));
  p.faqs.forEach((f, i) => out.push({ where: `faqs[${i}]`, text: `${f.q} ${f.a}` }));
  p.timeline.forEach((t, i) => out.push({ where: `timeline[${i}]`, text: t.label }));
  p.amenities.forEach((a, i) => out.push({ where: `amenities[${i}]`, text: a.name }));
  p.configurations.forEach((c, i) => out.push({ where: `configurations[${i}]`, text: c.type }));
  return out;
}

export function checkProjectData(input: ProjectCheckInput): Report {
  const { project: p, assets, imageFiles, settings, production } = input;
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const err = (rule: string, message: string) => errors.push({ rule, message });
  const warn = (rule: string, message: string) => warnings.push({ rule, message });
  const blocker = (rule: string, message: string) =>
    (production && p.published ? err : warn)(rule, message);

  if (input.dirName !== undefined && input.dirName !== p.slug) {
    err("slug", `Folder "${input.dirName}" does not match slug "${p.slug}".`);
  }

  // Rule 1: pricing only after RERA registration.
  if (isRegisterInterestMode(p)) {
    p.configurations.forEach((c, i) => {
      if (c.priceFromInr !== undefined) {
        err(
          "price-before-rera",
          `configurations[${i}].priceFromInr is set but rera.status is "${p.rera.status}".`,
        );
      }
    });
  }

  // Rule 7: SEO length limits (also enforced by the schema).
  if (p.seo.title.length > 60)
    err("seo-title", `seo.title is ${p.seo.title.length} chars (max 60).`);
  if (p.seo.description.length > 155) {
    err("seo-description", `seo.description is ${p.seo.description.length} chars (max 155).`);
  }

  // Copy rules in the data file itself, caught before any HTML is built.
  for (const { where, text } of projectCopy(p)) {
    if (hasEmDash(text)) err("em-dash", `${where} contains an em-dash.`);
    for (const hit of findFiller(text)) err("filler", `${where} uses banned phrase "${hit}".`);
    if (isRegisterInterestMode(p)) {
      for (const hit of findBannedRegisterInterest(text)) {
        err(
          "register-interest-copy",
          `${where} uses "${hit}", which is banned before RERA registration.`,
        );
      }
    }
  }

  if (p.overview) {
    const words = p.overview.body.join(" ").split(/\s+/).filter(Boolean).length;
    if (words < 120 || words > 180)
      warn("overview", `overview.body is ${words} words (target 120 to 180).`);
  }

  // Rule 4: asset references and licenses.
  const byId = new Map(assets.map((a) => [a.id, a]));
  const refs: Array<{ where: string; id: string | undefined }> = [
    { where: "theme.heroImageId", id: p.theme.heroImageId },
    { where: "seo.ogImageId", id: p.seo.ogImageId },
    { where: "location.mapImageId", id: p.location.mapImageId },
    ...Object.entries(p.sectionImages).map(([k, id]) => ({ where: `sectionImages.${k}`, id })),
    ...p.amenities.map((a, i) => ({ where: `amenities[${i}].imageId`, id: a.imageId })),
  ];
  for (const { where, id } of refs) {
    if (!id) continue;
    const asset = byId.get(id);
    if (!asset) err("asset-unlisted", `${where} references "${id}", which is not in assets.yaml.`);
  }
  for (const a of assets) {
    if (!(approvedLicenses as readonly string[]).includes(a.license)) {
      err(
        "asset-license",
        `Asset "${a.id}" has license "${a.license}". Approved: ${approvedLicenses.join(", ")}.`,
      );
    }
    if (!imageFiles.includes(a.file)) {
      err(
        "asset-missing-file",
        `Asset "${a.id}" points to images/${a.file}, which does not exist.`,
      );
    }
    // Rule 5: developer material needs written authorization.
    if (a.fromDeveloper && a.kind === "logo" && !p.developer.authorizedToUseLogo) {
      err(
        "developer-logo",
        `Asset "${a.id}" is a developer logo but developer.authorizedToUseLogo is false.`,
      );
    }
    if (a.fromDeveloper && a.kind !== "logo" && !p.developer.authorizedAssets) {
      err(
        "developer-asset",
        `Asset "${a.id}" is developer material but developer.authorizedAssets is false.`,
      );
    }
    if (
      a.license === "authorized" &&
      !p.developer.authorizedAssets &&
      !p.developer.authorizedToUseLogo
    ) {
      err(
        "developer-asset",
        `Asset "${a.id}" claims license "authorized" but no developer authorization is set.`,
      );
    }
    if (a.license === "authorized" || a.license === "licensed") {
      if (isPlaceholder(a.licenseProof))
        warn("license-proof", `Asset "${a.id}" has no licenseProof on file.`);
    }
    // Caption rules.
    if (a.kind === "render" && a.caption !== "Artist's impression") {
      err("caption", `Asset "${a.id}" is a render and must be captioned "Artist's impression".`);
    }
    if (
      (a.kind === "photo" || a.kind === "illustration") &&
      !a.projectSpecific &&
      a.caption !== "Representative image"
    ) {
      err(
        "caption",
        `Asset "${a.id}" is not project-specific and must be captioned "Representative image".`,
      );
    }
  }
  const listedFiles = new Set(assets.map((a) => a.file));
  for (const f of imageFiles) {
    if (!listedFiles.has(f)) err("asset-unlisted", `images/${f} is not listed in assets.yaml.`);
  }

  // Unverified facts are hidden by the UI; surface them so someone verifies them.
  p.highlights.forEach((h, i) => {
    if (!isVerified(h))
      warn(
        "unverified",
        `highlights[${i}] "${h.text}" lacks source/verifiedOn and will be hidden.`,
      );
  });
  p.location.connectivity.forEach((c, i) => {
    if (!isVerified(c))
      warn(
        "unverified",
        `location.connectivity[${i}] "${c.place}" lacks source/verifiedOn and will be hidden.`,
      );
  });
  if (p.land && !isVerified(p.land))
    warn("unverified", "land.areaAcres lacks source/verifiedOn and will be hidden.");
  p.configurations.forEach((c, i) => {
    const hasSize = [c.carpetSqftMin, c.carpetSqftMax, c.superSqftMin, c.superSqftMax].some(
      (v) => v !== undefined,
    );
    if (!isVerified(c)) {
      warn(
        "unverified",
        `configurations[${i}] "${c.type}" lacks source/verifiedOn and will be hidden${hasSize ? " (including sizes)" : ""}.`,
      );
    }
  });
  p.amenities.forEach((a, i) => {
    if (!isVerified(a))
      warn("unverified", `amenities[${i}] "${a.name}" lacks source/verifiedOn and will be hidden.`);
  });
  p.timeline.forEach((t, i) => {
    if (t.done && isPlaceholder(t.source)) {
      warn(
        "unverified",
        `timeline[${i}] "${t.label}" is marked done without a source and will be hidden.`,
      );
    }
  });

  // Accent must at least work for large display text and rules (3:1 on bone).
  // Small text uses a darkened variant derived by darkenToContrast().
  if (p.theme.accent && contrastRatio(p.theme.accent, BONE) < 3) {
    err("accent-contrast", `theme.accent ${p.theme.accent} is below 3:1 on the bone background.`);
  }
  if (p.rera.status === "registered" && isPlaceholder(p.rera.verifiedOn)) {
    warn(
      "rera",
      "rera.verifiedOn is empty. Check the number on haryanarera.gov.in and record the date.",
    );
  }

  // Rule 8 and other launch blockers: warn in dev, fail in production.
  const b = settings.business;
  if (isPlaceholder(b.agent_rera_number)) {
    blocker("agent-rera", "business.agent_rera_number is TBD. Required before publishing.");
  }
  if (isPlaceholder(settings.site.domain))
    blocker("domain", "site.domain is TBD. Canonical URLs are placeholders.");
  if (!isRealIndianMobileE164(b.phone_e164)) {
    blocker("phone", `business.phone_e164 "${b.phone_e164}" is not a real Indian mobile number.`);
  }
  if (!isRealIndianMobileE164(b.whatsapp_e164)) {
    blocker(
      "whatsapp",
      `business.whatsapp_e164 "${b.whatsapp_e164}" is not a real Indian mobile number.`,
    );
  }
  // Any use of the developer's name, logo or material must be backed by written authorization.
  const d = p.developer;
  const authorized =
    d.authorizedChannelPartner ||
    d.authorizedToUseName ||
    d.authorizedToUseLogo ||
    d.authorizedAssets;
  if (authorized && isPlaceholder(d.authorizationProof)) {
    blocker(
      "authorization",
      "developer.authorizationProof is empty. Record the channel partner agreement (reference and date) before publishing.",
    );
  }
  if (
    (d.authorizedToUseLogo || d.authorizedAssets) &&
    !d.authorizedChannelPartner &&
    !d.authorizedToUseName
  ) {
    err(
      "authorization",
      "Developer logo or assets are authorized but use of the developer's name is not.",
    );
  }

  // The privacy policy (DPDP Act) and disclaimer need a reachable controller and grievance contact.
  const contactFields = [
    "email",
    "office_address",
    "grievance_officer_name",
    "grievance_officer_email",
  ] as const;
  for (const field of contactFields) {
    if (isPlaceholder(b[field])) {
      blocker("contact", `business.${field} is TBD. Needed by the privacy policy and disclaimer.`);
    }
  }

  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Built HTML checks                                                   */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? m : String.fromCodePoint(n);
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

/**
 * User-facing text of a page: visible text nodes plus the attributes people
 * read or hear (title, meta content, alt, aria-label, placeholder).
 */
export function extractUserFacingText(html: string): string {
  const body = stripNonContent(html);
  const attrs: string[] = [];
  const attrRe = /\s(?:alt|title|aria-label|placeholder|content)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  for (const m of body.matchAll(attrRe)) attrs.push(m[2] ?? m[3] ?? "");
  const text = body.replace(/<[^>]+>/g, " ");
  return decodeEntities(`${text} ${attrs.join(" ")}`)
    .replace(/\s+/g, " ")
    .trim();
}

export function countH1(html: string): number {
  return (stripNonContent(html).match(/<h1[\s>]/gi) ?? []).length;
}

export type HtmlScanOptions = {
  /** Apply the register-interest banned word list. */
  registerInterestMode: boolean;
  /** The company's own pages (homepage): "official website" is allowed there. */
  companyPage?: boolean;
};

export function scanHtml(html: string, opts: HtmlScanOptions): Finding[] {
  const findings: Finding[] = [];
  const h1 = countH1(html);
  if (h1 !== 1)
    findings.push({ rule: "h1", message: `Page has ${h1} <h1> elements (exactly 1 required).` });

  const text = extractUserFacingText(html);
  if (hasEmDash(text)) {
    const i = text.indexOf(EM_DASH);
    findings.push({
      rule: "em-dash",
      message: `Em-dash in page text near "${text.slice(Math.max(0, i - 30), i + 30)}".`,
    });
  }
  if (opts.registerInterestMode) {
    for (const hit of findBannedRegisterInterest(text, opts.companyPage)) {
      findings.push({
        rule: "register-interest-copy",
        message: `Banned term "${hit}" on a page for an unregistered project.`,
      });
    }
  }
  for (const hit of findFiller(text)) {
    findings.push({ rule: "filler", message: `Banned phrase "${hit}".` });
  }
  return findings;
}
