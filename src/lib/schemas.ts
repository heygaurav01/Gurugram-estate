/**
 * Zod schemas for site settings, projects and asset inventories.
 *
 * Shared by Astro content collections (src/content.config.ts) and by the
 * standalone compliance script (scripts/check-compliance.mjs), so both
 * enforce exactly the same rules.
 *
 * Every factual field is optional. The UI hides what is missing or unverified.
 */
import { z } from "astro/zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #8C6A3F");
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens");

/**
 * Source fields for a factual claim. Optional at the schema level so a draft
 * file can hold an unverified fact; isVerified() decides whether it renders.
 */
const sourced = {
  source: z.string().optional(),
  verifiedOn: z.string().optional(),
};

/* ------------------------------------------------------------------ */
/* Site settings (src/content/site/settings.yaml)                      */
/* Keys mirror section 0 of the master prompt so it can be pasted in.  */
/* ------------------------------------------------------------------ */

export const siteSettingsSchema = z.object({
  business: z.object({
    brand_name: z.string().min(2),
    agent_rera_number: z.string(),
    phone_display: z.string(),
    phone_e164: z.string(),
    whatsapp_e164: z.string(),
    email: z.string(),
    office_address: z.string(),
    grievance_officer_name: z.string(),
    grievance_officer_email: z.string(),
    logo_file: z.string(),
    brand_accent_hex: hexColor,
  }),
  site: z.object({
    domain: z.string(),
    hosting: z.literal("cloudflare-pages"),
    /** Only set if the sales team can reliably hit it, e.g. "within 2 working hours". */
    callback_promise: z.string().optional(),
  }),
  leads: z.object({
    crm: z.enum(["frappe", "espocrm", "krayin", "none", "TBD"]),
    notify_email: z.string(),
    otp_enabled: z.boolean(),
  }),
});

/* ------------------------------------------------------------------ */
/* Project (src/content/projects/<slug>/project.yaml)                  */
/* ------------------------------------------------------------------ */

export const reraStatuses = ["not-registered", "applied", "registered"] as const;
export const formIntents = [
  "hero",
  "pricing",
  "floor-plan",
  "gallery",
  "location",
  "footer",
  "sticky",
  "nav",
] as const;

const configurationSchema = z.object({
  type: z.string().min(1),
  carpetSqftMin: z.number().positive().optional(),
  carpetSqftMax: z.number().positive().optional(),
  superSqftMin: z.number().positive().optional(),
  superSqftMax: z.number().positive().optional(),
  /** ONLY allowed when rera.status is "registered". Enforced below. */
  priceFromInr: z.number().positive().optional(),
  ...sourced,
});

export const projectSchema = z
  .object({
    slug,
    name: z.string().min(2),
    tagline: z.string().max(90).optional(),
    /** Overview section: original editorial copy built only from verified facts. */
    overview: z
      .object({
        title: z.string().min(2),
        /** Paragraphs. 120 to 180 words in total. */
        body: z.array(z.string().min(1)).min(1),
      })
      .optional(),
    published: z.boolean(),
    developer: z.object({
      name: z.string().min(1),
      authorizedToUseName: z.boolean(),
      authorizedToUseLogo: z.boolean(),
      authorizedAssets: z.boolean(),
      about: z.string().optional(),
      aboutSource: z.string().optional(),
    }),
    status: z.enum(["pre-registration", "registered", "launched", "under-construction", "ready"]),
    rera: z.object({
      status: z.enum(reraStatuses),
      number: z.string().optional(),
      verifyUrl: z.url().optional(),
      verifiedOn: z.string().optional(),
    }),
    location: z.object({
      sector: z.string().min(1),
      city: z.string().min(1),
      region: z.string().optional(),
      /** Static map image (asset id, kind: map) shown before the live map loads. */
      mapImageId: z.string().optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      connectivity: z
        .array(
          z.object({
            place: z.string().min(1),
            distanceKm: z.number().positive().optional(),
            driveMinutesOffPeak: z.number().positive().optional(),
            mode: z.enum(["road", "metro", "rail", "air"]),
            ...sourced,
          }),
        )
        .default([]),
    }),
    land: z
      .object({
        areaAcres: z.number().positive(),
        /** Clarifies scope, e.g. "Held across Sector 81 and Sector 86". */
        note: z.string().optional(),
        ...sourced,
      })
      .optional(),
    highlights: z.array(z.object({ text: z.string().min(1), ...sourced })).default([]),
    configurations: z.array(configurationSchema).default([]),
    amenities: z
      .array(
        z.object({
          name: z.string().min(1),
          icon: z.string().optional(),
          imageId: z.string().optional(),
          projectSpecific: z.boolean(),
          ...sourced,
        }),
      )
      .default([]),
    timeline: z
      .array(
        z.object({
          label: z.string().min(1),
          date: z.string().optional(),
          done: z.boolean(),
          source: z.string().optional(),
        }),
      )
      .default([]),
    faqs: z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).default([]),
    seo: z.object({
      title: z.string().min(10).max(60, "seo.title must be 60 characters or fewer"),
      description: z.string().min(50).max(155, "seo.description must be 155 characters or fewer"),
      primaryKeyword: z.string().min(2),
      secondaryKeywords: z.array(z.string()).default([]),
      ogImageId: z.string().optional(),
    }),
    theme: z
      .object({
        accent: hexColor.optional(),
        heroImageId: z.string().optional(),
        heroFocus: z
          .string()
          .regex(/^\d{1,3}% \d{1,3}%$/, 'Use "x% y%", e.g. "50% 40%"')
          .optional(),
      })
      .default({}),
    form: z.object({
      otp: z.boolean(),
      intents: z.array(z.enum(formIntents)).min(1),
    }),
    sections: z
      .object({
        plans: z.boolean(),
        gallery: z.boolean(),
        developer: z.boolean(),
      })
      .default({ plans: false, gallery: false, developer: false }),
  })
  .superRefine((p, ctx) => {
    // Rule 1: no prices before RERA registration (RERA Act, Section 3).
    if (p.rera.status !== "registered") {
      p.configurations.forEach((c, i) => {
        if (c.priceFromInr !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["configurations", i, "priceFromInr"],
            message: `COMPLIANCE: priceFromInr is not allowed while rera.status is "${p.rera.status}". Remove it until the project is RERA registered.`,
          });
        }
      });
    }
    if (p.rera.status === "registered" && !p.rera.number?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["rera", "number"],
        message: 'rera.number is required when rera.status is "registered".',
      });
    }
    if (p.sections.developer && !p.developer.authorizedToUseName) {
      ctx.addIssue({
        code: "custom",
        path: ["sections", "developer"],
        message: "sections.developer cannot be true unless developer.authorizedToUseName is true.",
      });
    }
  });

/* ------------------------------------------------------------------ */
/* Asset inventory (src/content/projects/<slug>/assets.yaml)           */
/* ------------------------------------------------------------------ */

export const assetLicenses = ["owned", "authorized", "licensed", "open", "unknown"] as const;
export const approvedLicenses = ["owned", "authorized", "licensed", "open"] as const;

export const assetSchema = z.object({
  id: slug,
  /** Path relative to the project's images/ folder. */
  file: z.string().min(1),
  /** Descriptive and specific. Empty only when decorative is true. */
  alt: z.string(),
  decorative: z.boolean().default(false),
  caption: z.string().optional(),
  /** What the image depicts. Drives authorization and caption rules. */
  kind: z.enum(["photo", "render", "plan", "logo", "map", "illustration"]),
  /** True when the file came from the developer (renders, plans, logo, marketing kit). */
  fromDeveloper: z.boolean().default(false),
  /** True when the image shows this actual project or site, not a stand-in. */
  projectSpecific: z.boolean().default(false),
  license: z.enum(assetLicenses),
  licenseProof: z.string().optional(),
  source: z.string().min(1),
  usage: z
    .array(z.enum(["hero", "og", "gallery", "amenity", "plan", "map", "card", "developer"]))
    .default([]),
});

export const assetsFileSchema = z
  .object({ assets: z.array(assetSchema).default([]) })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.assets.forEach((a, i) => {
      if (seen.has(a.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["assets", i, "id"],
          message: `Duplicate asset id "${a.id}".`,
        });
      }
      seen.add(a.id);
      if (a.license === "unknown") {
        ctx.addIssue({
          code: "custom",
          path: ["assets", i, "license"],
          message: `COMPLIANCE: asset "${a.id}" has license "unknown". Confirm the license or remove the asset.`,
        });
      }
      if (!a.decorative && !a.alt.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["assets", i, "alt"],
          message: `Asset "${a.id}" needs descriptive alt text (or decorative: true).`,
        });
      }
    });
  });

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetsFile = z.infer<typeof assetsFileSchema>;
export type FormIntent = (typeof formIntents)[number];
