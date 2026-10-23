import type { APIRoute } from "astro";
import { getProjects } from "~/lib/data";

/**
 * Allowlist for the lead relay (public/api/lead.php and the dev relay): which
 * project slugs may be sent, and the name each lead carries into the CRM. Built
 * from the published projects, so a new project page is covered automatically.
 * Public on purpose: it holds only names, never the API key.
 *
 * Leadrat splits the "project" field on commas ("A, B" becomes two projects), so
 * the CRM name drops them: "M3M Franck Muller, Sector 43, Gurgaon" is sent as
 * "M3M Franck Muller Sector 43 Gurgaon".
 */
const crmName = (name: string) => name.replace(/\s*,\s*/g, " ").trim();
export const GET: APIRoute = async () => {
  const projects = await getProjects({ publishedOnly: true });
  const map: Record<string, { name: string; location: string; city: string; state: string }> = {
    general: {
      name: "General enquiry Gurugram Estate website",
      location: "",
      city: "Gurugram",
      state: "Haryana",
    },
  };
  for (const p of projects) {
    map[p.slug] = {
      name: crmName(p.name),
      location: p.location.sector,
      city: p.location.city,
      state: p.location.region,
    };
  }
  return new Response(JSON.stringify(map, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
