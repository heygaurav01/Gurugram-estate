// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { load as loadYamlText } from "js-yaml";

// The canonical origin comes from site settings so there is one place to change it.
// Until a domain is set, a reserved .invalid origin keeps canonicals obviously fake.
const PLACEHOLDER_ORIGIN = "https://example.invalid";

function siteOrigin() {
  const raw = readFileSync(new URL("./src/content/site/settings.yaml", import.meta.url), "utf8");
  const settings = /** @type {any} */ (loadYamlText(raw));
  const domain = String(settings?.site?.domain ?? "").trim();
  if (!domain || domain.toUpperCase().startsWith("TBD")) return PLACEHOLDER_ORIGIN;
  return domain.startsWith("http") ? domain.replace(/\/+$/, "") : `https://${domain}`;
}

export default defineConfig({
  site: siteOrigin(),
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [
    sitemap({
      filter: (page) => !/\/thank-you\/$/.test(page) && !/\/404\/?$/.test(page),
    }),
  ],
});
