import type { APIRoute } from "astro";

/**
 * robots.txt with an absolute sitemap URL from the configured site origin.
 * Preview builds (PUBLIC_PREVIEW=1) block all crawling.
 */
export const GET: APIRoute = ({ site }) => {
  const preview = import.meta.env.PUBLIC_PREVIEW === "1";
  const sitemap = new URL("/sitemap-index.xml", site).href;
  const body = preview
    ? ["User-agent: *", "Disallow: /", ""].join("\n")
    : ["User-agent: *", "Allow: /", "", `Sitemap: ${sitemap}`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
