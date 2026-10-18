#!/usr/bin/env node
/**
 * Scaffold a new project from src/content/projects/_template.
 * Usage: npm run new-project -- <slug>
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error("Usage: npm run new-project -- <slug>   (lowercase letters, digits, hyphens)");
  process.exit(1);
}

const base = fileURLToPath(new URL("../src/content/projects/", import.meta.url));
const target = join(base, slug);
if (existsSync(target)) {
  console.error(`Project folder already exists: ${target}`);
  process.exit(1);
}

cpSync(join(base, "_template"), target, { recursive: true });
const projectFile = join(target, "project.yaml");
writeFileSync(
  projectFile,
  readFileSync(projectFile, "utf8").replace("slug: your-project-slug", `slug: ${slug}`),
);

console.log(`Created src/content/projects/${slug}/
Next:
  1. Verify facts (HARERA, developer material). Record source + verifiedOn for each.
  2. Fill project.yaml. Leave anything unverified empty.
  3. Add images to images/ and list each in assets.yaml with its license.
  4. npm run check
  5. Set published: true when the compliance checklist is done (docs/COMPLIANCE-CHECKLIST.md).`);
