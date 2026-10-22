// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { load as loadYamlText } from "js-yaml";
import { loadEnv } from "vite";
import { relayLead } from "./scripts/leadrat-relay.mjs";

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

/**
 * Local lead relay: serves POST /api/lead.php on the dev and preview servers,
 * the same contract as public/api/lead.php on Hostinger. The Leadrat key comes
 * from LEADRAT_API_KEY in .env (server-side only, never a PUBLIC_ variable).
 * @returns {import("vite").Plugin}
 */
function leadRelay() {
  /** @type {import("vite").Connect.NextHandleFunction} */
  const handle = async (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/lead.php") return next();
    const send = (/** @type {number} */ status, /** @type {unknown} */ json) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(json));
    };
    if (req.method !== "POST") return send(405, { ok: false, error: "method" });
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16384) return send(413, { ok: false, error: "body" });
      }
      const env = loadEnv("development", process.cwd(), "");
      const projects = await (
        await fetch(`http://${req.headers.host}/api/lead-projects.json`)
      ).json();
      const out = await relayLead(JSON.parse(raw || "{}"), {
        apiKey: env.LEADRAT_API_KEY ?? "",
        url: env.LEADRAT_API_URL,
        projects,
      });
      console.info(`[lead relay] ${out.status} ${JSON.stringify(out.json)}`);
      send(out.status, out.json);
    } catch (err) {
      console.error("[lead relay] failed:", err);
      send(502, { ok: false, error: "relay_failed" });
    }
  };
  return {
    name: "gp-lead-relay",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export default defineConfig({
  vite: { plugins: [leadRelay()] },
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
