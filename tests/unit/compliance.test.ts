import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import type { z } from "astro/zod";
import {
  agentDisclosure,
  checkProjectData,
  countH1,
  extractUserFacingText,
  findBannedRegisterInterest,
  findFiller,
  hasEmDash,
  isPlaceholder,
  isRealIndianMobileE164,
  isVerified,
  scanHtml,
  type ProjectCheckInput,
} from "../../src/lib/compliance";
import { contrastRatio, darkenToContrast } from "../../src/lib/color";
import {
  assetsFileSchema,
  projectSchema,
  siteSettingsSchema,
  type Asset,
  type Project,
  type SiteSettings,
} from "../../src/lib/schemas";

const readYaml = (p: string) => load(readFileSync(new URL(p, import.meta.url), "utf8"));
const PROJECT_YAML = "../../src/content/projects/l-and-t-sector-86-gurgaon/project.yaml";
/** A fresh, unvalidated copy of the real project file for schema tests. */
const rawProject = () => readYaml(PROJECT_YAML) as z.input<typeof projectSchema>;
const realProject = projectSchema.parse(rawProject());
const realSettings = siteSettingsSchema.parse(readYaml("../../src/content/site/settings.yaml"));

const goodSettings: SiteSettings = {
  ...realSettings,
  business: {
    ...realSettings.business,
    agent_rera_number: "HRERA-PKL-REA-000-2026",
    phone_e164: "+919812345678",
    whatsapp_e164: "+919812345678",
  },
  site: { ...realSettings.site, domain: "example.in" },
};

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: "hero",
  file: "hero.jpg",
  alt: "Low-rise residential towers at dusk",
  decorative: false,
  caption: "Representative image",
  kind: "photo",
  fromDeveloper: false,
  projectSpecific: false,
  license: "licensed",
  licenseProof: "Invoice 42",
  source: "Stock library",
  usage: ["hero"],
  ...over,
});

const input = (over: Partial<ProjectCheckInput> = {}): ProjectCheckInput => ({
  project: realProject,
  assets: [],
  imageFiles: [],
  settings: goodSettings,
  production: false,
  ...over,
});

const withProject = (patch: (p: Project) => Project) =>
  input({ project: patch(structuredClone(realProject)) });
const ruleIds = (r: { errors: { rule: string }[] }) => r.errors.map((e) => e.rule);

describe("schema: price before RERA registration", () => {
  it("rejects priceFromInr on an unregistered project", () => {
    const raw = rawProject();
    raw.configurations = [{ type: "3 BHK", priceFromInr: 32000000 }];
    const res = projectSchema.safeParse(raw);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain("priceFromInr is not allowed");
  });

  it("accepts priceFromInr once registered with a number", () => {
    const raw = rawProject();
    raw.rera = { status: "registered", number: "RC/REP/HARERA/GGM/000/2026" };
    raw.configurations = [{ type: "3 BHK", priceFromInr: 32000000 }];
    expect(projectSchema.safeParse(raw).success).toBe(true);
  });

  it("requires a RERA number when registered", () => {
    const raw = rawProject();
    raw.rera = { status: "registered" };
    expect(projectSchema.safeParse(raw).success).toBe(false);
  });

  it("enforces SEO length limits", () => {
    const raw = rawProject();
    raw.seo.title = "x".repeat(61);
    expect(projectSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects unknown asset licenses", () => {
    const res = assetsFileSchema.safeParse({ assets: [{ ...asset(), license: "unknown" }] });
    expect(res.success).toBe(false);
  });
});

describe("checkProjectData", () => {
  it("passes the real first project with complete settings", () => {
    expect(checkProjectData(input()).errors).toEqual([]);
  });

  it("flags price on an unregistered project", () => {
    const r = checkProjectData(
      withProject((p) => ({ ...p, configurations: [{ type: "3 BHK", priceFromInr: 1 }] })),
    );
    expect(ruleIds(r)).toContain("price-before-rera");
  });

  it("flags banned register-interest copy in data", () => {
    const r = checkProjectData(withProject((p) => ({ ...p, tagline: "EOI open now" })));
    expect(ruleIds(r)).toContain("register-interest-copy");
  });

  it("flags em-dashes and filler in data", () => {
    const r = checkProjectData(
      withProject((p) => ({ ...p, tagline: "Quiet homes — nestled in green" })),
    );
    expect(ruleIds(r)).toEqual(expect.arrayContaining(["em-dash", "filler"]));
  });

  it("flags image references missing from assets.yaml", () => {
    const r = checkProjectData(
      withProject((p) => ({ ...p, theme: { ...p.theme, heroImageId: "hero" } })),
    );
    expect(ruleIds(r)).toContain("asset-unlisted");
  });

  it("flags image files on disk that are not listed", () => {
    expect(ruleIds(checkProjectData(input({ imageFiles: ["stray.jpg"] })))).toContain(
      "asset-unlisted",
    );
  });

  it("flags listed assets whose file is missing", () => {
    expect(ruleIds(checkProjectData(input({ assets: [asset()] })))).toContain("asset-missing-file");
  });

  it("accepts a correctly listed and licensed asset", () => {
    expect(checkProjectData(input({ assets: [asset()], imageFiles: ["hero.jpg"] })).errors).toEqual(
      [],
    );
  });

  it("flags developer logo and renders without authorization", () => {
    const r = checkProjectData(
      input({
        assets: [
          asset({
            id: "logo",
            file: "logo.svg",
            kind: "logo",
            fromDeveloper: true,
            caption: undefined,
            license: "authorized",
          }),
          asset({
            id: "render",
            file: "render.jpg",
            kind: "render",
            fromDeveloper: true,
            caption: "Artist's impression",
            license: "authorized",
          }),
        ],
        imageFiles: ["logo.svg", "render.jpg"],
      }),
    );
    expect(ruleIds(r)).toEqual(expect.arrayContaining(["developer-logo", "developer-asset"]));
  });

  it("requires correct captions", () => {
    const r = checkProjectData(
      input({
        assets: [
          asset({ id: "a", file: "a.jpg", caption: undefined }),
          asset({ id: "b", file: "b.jpg", kind: "render", caption: "Render" }),
        ],
        imageFiles: ["a.jpg", "b.jpg"],
      }),
    );
    expect(r.errors.filter((e) => e.rule === "caption")).toHaveLength(2);
  });

  it("warns (dev) and fails (production) when agent RERA is TBD on a published project", () => {
    const tbd = {
      ...goodSettings,
      business: { ...goodSettings.business, agent_rera_number: "TBD" },
    };
    const dev = checkProjectData(input({ settings: tbd }));
    expect(ruleIds(dev)).not.toContain("agent-rera");
    expect(dev.warnings.map((w) => w.rule)).toContain("agent-rera");
    expect(ruleIds(checkProjectData(input({ settings: tbd, production: true })))).toContain(
      "agent-rera",
    );
  });

  it("does not block production for unpublished projects", () => {
    const tbd = {
      ...goodSettings,
      business: { ...goodSettings.business, agent_rera_number: "TBD" },
    };
    const r = checkProjectData({
      ...input({ settings: tbd, production: true }),
      project: { ...realProject, published: false },
    });
    expect(ruleIds(r)).not.toContain("agent-rera");
  });

  it("warns about unverified facts so they get verified", () => {
    const r = checkProjectData(
      withProject((p) => ({ ...p, highlights: [{ text: "Unsourced claim", source: "TBD" }] })),
    );
    expect(r.warnings.some((w) => w.rule === "unverified")).toBe(true);
  });
});

describe("HTML scan", () => {
  const page = (body: string) =>
    `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`;

  it("requires exactly one h1", () => {
    expect(
      scanHtml(page("<p>x</p>"), { registerInterestMode: false }).map((f) => f.rule),
    ).toContain("h1");
    expect(
      scanHtml(page("<h1>a</h1><h1>b</h1>"), { registerInterestMode: false }).map((f) => f.rule),
    ).toContain("h1");
    expect(scanHtml(page("<h1>a</h1>"), { registerInterestMode: false })).toEqual([]);
  });

  it("ignores h1 strings inside scripts", () => {
    expect(countH1(page('<h1>a</h1><script>const s = "<h1>";</script>'))).toBe(1);
  });

  it("detects em-dashes, including entities and attributes", () => {
    for (const body of [
      "<h1>a — b</h1>",
      "<h1>a &mdash; b</h1>",
      "<h1>a &#8212; b</h1>",
      '<h1>a</h1><img alt="x — y">',
    ]) {
      expect(scanHtml(page(body), { registerInterestMode: false }).map((f) => f.rule)).toContain(
        "em-dash",
      );
    }
  });

  it("detects banned terms only in register-interest mode", () => {
    const html = page("<h1>Project</h1><p>Download the price sheet. Booking open.</p>");
    expect(
      scanHtml(html, { registerInterestMode: true }).filter(
        (f) => f.rule === "register-interest-copy",
      ),
    ).toHaveLength(2);
    expect(scanHtml(html, { registerInterestMode: false })).toEqual([]);
  });

  it("detects banned terms in meta content", () => {
    const html = `<html><head><meta name="description" content="EOI open now"></head><body><h1>x</h1></body></html>`;
    expect(scanHtml(html, { registerInterestMode: true }).map((f) => f.rule)).toContain(
      "register-interest-copy",
    );
  });

  it("allows the required disclosure sentence", () => {
    const html = page(`<h1>x</h1><p>${agentDisclosure(goodSettings)}</p>`.replace("'", "&#39;"));
    expect(scanHtml(html, { registerInterestMode: true })).toEqual([]);
  });

  it("still catches 'official website' outside the disclosure", () => {
    expect(findBannedRegisterInterest("Visit the official website of L&T")).toContain(
      "official site",
    );
  });

  it("extracts visible text without scripts or styles", () => {
    expect(
      extractUserFacingText(page("<h1>Hi</h1><style>.a{}</style><script>EOI</script>")),
    ).not.toContain("EOI");
  });
});

describe("helpers", () => {
  it("treats empty and TBD values as placeholders", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("TBD (L&T press release)")).toBe(true);
    expect(isPlaceholder("https://example.com")).toBe(false);
  });

  it("verifies facts only with a source and ISO date", () => {
    expect(isVerified({ source: "https://x.com", verifiedOn: "2026-10-18" })).toBe(true);
    expect(isVerified({ source: "TBD", verifiedOn: "2026-10-18" })).toBe(false);
    expect(isVerified({ source: "https://x.com", verifiedOn: "18/10/2026" })).toBe(false);
    expect(isVerified({ source: "https://x.com" })).toBe(false);
  });

  it("rejects dummy and invalid phone numbers", () => {
    expect(isRealIndianMobileE164("+919812345678")).toBe(true);
    expect(isRealIndianMobileE164("+911234567890")).toBe(false);
    expect(isRealIndianMobileE164("+915812345678")).toBe(false);
  });

  it("finds filler and urgency phrases", () => {
    expect(findFiller("A world-class address")).toContain("world-class");
    expect(findFiller("Only 3 units left")).toHaveLength(1);
    expect(hasEmDash("plain - hyphen")).toBe(false);
  });

  it("shows On request for a TBD agent RERA number", () => {
    expect(agentDisclosure(realSettings)).toContain("HARERA agent registration no. On request.");
    expect(agentDisclosure(realSettings)).toContain("independent real estate agent");
  });

  it("derives an accessible accent ink", () => {
    expect(contrastRatio("#8C6A3F", "#F4F1EA")).toBeLessThan(4.5);
    const ink = darkenToContrast("#8C6A3F", "#F4F1EA");
    expect(contrastRatio(ink, "#F4F1EA")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#7A5C37", "#F4F1EA")).toBeGreaterThanOrEqual(4.5);
  });
});
