/** Typed access to site settings and projects, with build-time guards. */
import { getCollection, getEntry } from "astro:content";
import type { Asset, Project, SiteSettings } from "./schemas";
import { approvedLicenses } from "./schemas";
import { darkenToContrast, lightenToContrast } from "./color";
import { BONE, DARK_BG } from "./compliance";

export async function getSettings(): Promise<SiteSettings> {
  const entry = await getEntry("site", "settings");
  if (!entry) throw new Error("src/content/site/settings.yaml is missing.");
  return entry.data;
}

export async function getProjects(opts: { publishedOnly?: boolean } = {}): Promise<Project[]> {
  const all = await getCollection("projects");
  return all
    .map((e) => e.data)
    .filter((p) => !opts.publishedOnly || p.published)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ProjectBundle = {
  project: Project;
  assets: Asset[];
  /** Look up an asset by id. Throws (failing the build) if unlisted or unlicensed. */
  asset: (id: string) => Asset;
  theme: {
    accent: string;
    accentInk: string;
    accentSoft?: string | undefined;
    mode: "light" | "dark";
    motif: "none" | "neon" | "aurum" | "horology";
  };
};

export async function getProjectBundle(slug: string): Promise<ProjectBundle> {
  const projectEntry = await getEntry("projects", slug);
  if (!projectEntry) throw new Error(`Project "${slug}" not found.`);
  const assetsEntry = await getEntry("projectAssets", slug);
  const assets = assetsEntry?.data.assets ?? [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const project = projectEntry.data;

  const asset = (id: string): Asset => {
    const a = byId.get(id);
    if (!a) throw new Error(`[${slug}] Image "${id}" is not listed in assets.yaml.`);
    if (!(approvedLicenses as readonly string[]).includes(a.license)) {
      throw new Error(`[${slug}] Image "${id}" has unapproved license "${a.license}".`);
    }
    return a;
  };

  const accent = project.theme.accent ?? "#8C6A3F";
  const mode = project.theme.mode;
  return {
    project,
    assets,
    asset,
    theme: {
      accent,
      accentInk:
        mode === "dark"
          ? lightenToContrast(accent, DARK_BG, 4.5)
          : darkenToContrast(accent, BONE, 4.5),
      accentSoft: project.theme.accentSoft,
      mode,
      motif: project.theme.motif,
    },
  };
}
