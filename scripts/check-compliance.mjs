#!/usr/bin/env node
/**
 * Compliance gate. Runs after `astro build` and in `npm run check`.
 *
 * 1. Validates site settings, every project (and _template) against the zod schemas.
 * 2. Runs project data rules (prices before RERA, assets, authorization, launch blockers).
 * 3. Scans built HTML in dist/ (if present): one <h1>, no em-dash, no banned
 *    register-interest terms on pages of unregistered projects, no filler.
 *
 * Exit code 1 on any error. Production mode (--production, or Cloudflare Pages
 * building the main branch) turns launch blockers such as a TBD agent RERA
 * number into errors.
 *
 * Run with tsx so it can import the shared TypeScript rules.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { assetsFileSchema, projectSchema, siteSettingsSchema } from "../src/lib/schemas.ts";
import { checkProjectData, isRegisterInterestMode, scanHtml } from "../src/lib/compliance.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROJECTS = join(ROOT, "src", "content", "projects");
const DIST = join(ROOT, "dist");
const LEGAL_PAGES = new Set(["disclaimer", "privacy-policy", "terms"]);

const args = new Set(process.argv.slice(2));
const production = args.has("--production") || process.env.CF_PAGES_BRANCH === "main";
const dataOnly = args.has("--data-only");

const errors = [];
const warnings = [];
const add = (list, where) => (f) => list.push(`${where}: [${f.rule}] ${f.message}`);

function loadYaml(path) {
  return parseYaml(readFileSync(path, "utf8"));
}

function parseOrReport(schema, data, where) {
  const res = schema.safeParse(data);
  if (!res.success) {
    for (const issue of res.error.issues) {
      errors.push(`${where}: [schema] ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  }
  return res.data;
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}

/* 1. Settings ------------------------------------------------------- */
const settings = parseOrReport(
  siteSettingsSchema,
  loadYaml(join(ROOT, "src", "content", "site", "settings.yaml")),
  "site/settings.yaml",
);

/* 2. Projects ------------------------------------------------------- */
/** slug -> project, used to classify built pages. */
const projects = new Map();

for (const dirName of readdirSync(PROJECTS)) {
  const dir = join(PROJECTS, dirName);
  if (!statSync(dir).isDirectory()) continue;
  const where = `projects/${dirName}`;
  const projectPath = join(dir, "project.yaml");
  const assetsPath = join(dir, "assets.yaml");
  if (!existsSync(projectPath) || !existsSync(assetsPath)) {
    errors.push(`${where}: [structure] needs both project.yaml and assets.yaml.`);
    continue;
  }
  const project = parseOrReport(projectSchema, loadYaml(projectPath), `${where}/project.yaml`);
  const assetsFile = parseOrReport(assetsFileSchema, loadYaml(assetsPath), `${where}/assets.yaml`);
  // The template only has to stay schema-valid; its placeholders are not real data.
  if (dirName.startsWith("_") || !project || !assetsFile || !settings) continue;

  const imageFiles = listFiles(join(dir, "images")).filter((f) => !f.endsWith(".gitkeep"));
  const report = checkProjectData({
    project,
    assets: assetsFile.assets,
    imageFiles,
    settings,
    dirName,
    production,
  });
  report.errors.forEach(add(errors, where));
  report.warnings.forEach(add(warnings, where));
  projects.set(project.slug, project);
}

/* 3. Built HTML ----------------------------------------------------- */
let pagesScanned = 0;
if (!dataOnly && existsSync(DIST)) {
  const anyUnregistered = [...projects.values()].some(
    (p) => p.published && isRegisterInterestMode(p),
  );
  for (const file of listFiles(DIST).filter((f) => f.endsWith(".html"))) {
    const first = file.includes("/") ? file.split("/")[0] : "";
    const project = projects.get(first);
    let registerInterestMode;
    if (project) registerInterestMode = isRegisterInterestMode(project);
    else if (LEGAL_PAGES.has(first))
      registerInterestMode = false; // legal text explains these terms
    else registerInterestMode = anyUnregistered; // hub, 404 and other shared pages
    // The company's own pages (homepage, its thank-you, 404) may say "official website".
    const companyPage = !project && !LEGAL_PAGES.has(first);
    scanHtml(readFileSync(join(DIST, file), "utf8"), { registerInterestMode, companyPage }).forEach(
      add(errors, `dist/${file}`),
    );
    pagesScanned++;
  }
}

/* 4. CRM endpoint --------------------------------------------------- */
// The enquiry form posts straight to the CRM (src/scripts/api.ts). Without an
// endpoint, a production page would show an error to every enquirer.
function envValue(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.production", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    const m = readFileSync(path, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m && m[1].trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}
const crmUrl = envValue("PUBLIC_CRM_LEAD_URL");
if (!crmUrl) {
  (production ? errors : warnings).push(
    "env: [crm] PUBLIC_CRM_LEAD_URL is not set. Enquiries are simulated in dev and fail in production.",
  );
} else if (!crmUrl.startsWith("https://")) {
  errors.push(`env: [crm] PUBLIC_CRM_LEAD_URL must use https (got "${crmUrl}").`);
}

/* Report ------------------------------------------------------------ */
const mode = production ? "production" : "development";
console.log(
  `\nCompliance check (${mode}): ${projects.size} project(s), ${pagesScanned} built page(s) scanned.`,
);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  WARN  ${w}`);
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  FAIL  ${e}`);
  console.error("\nCompliance check failed.\n");
  process.exit(1);
}
console.log("\nCompliance check passed.\n");
