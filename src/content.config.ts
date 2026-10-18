import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { assetsFileSchema, projectSchema, siteSettingsSchema } from "./lib/schemas";

// Folders starting with "_" (such as _template) are never loaded.
const PROJECTS_BASE = "./src/content/projects";
const byFolder = ({ entry }: { entry: string }) => entry.split(/[\\/]/)[0]!;

const site = defineCollection({
  loader: glob({ pattern: "settings.yaml", base: "./src/content/site" }),
  schema: siteSettingsSchema,
});

const projects = defineCollection({
  loader: glob({
    pattern: ["*/project.yaml", "!_*/**"],
    base: PROJECTS_BASE,
    generateId: byFolder,
  }),
  schema: projectSchema,
});

const projectAssets = defineCollection({
  loader: glob({ pattern: ["*/assets.yaml", "!_*/**"], base: PROJECTS_BASE, generateId: byFolder }),
  schema: assetsFileSchema,
});

export const collections = { site, projects, projectAssets };
