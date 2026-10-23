/**
 * JSON-LD builders. Only verified data goes in. Never Product, Offer,
 * AggregateRating, Review or Event markup (no prices or fake ratings).
 */
import type { Project, SiteSettings } from "./schemas";
import { isPlaceholder, isRealIndianMobileE164 } from "./compliance";
import { resolveTokens } from "./view";

type Json = Record<string, unknown>;

export function realEstateAgentLd(settings: SiteSettings, site: URL): Json {
  const b = settings.business;
  const ld: Json = {
    "@type": "RealEstateAgent",
    "@id": new URL("/#agent", site).href,
    name: b.brand_name,
    url: new URL("/", site).href,
    areaServed: { "@type": "City", name: "Gurugram" },
  };
  if (isRealIndianMobileE164(b.phone_e164)) ld.telephone = b.phone_e164;
  if (!isPlaceholder(b.email)) ld.email = b.email;
  if (!isPlaceholder(b.office_address)) {
    ld.address = {
      "@type": "PostalAddress",
      streetAddress: b.office_address,
      addressCountry: "IN",
    };
  }
  if (!isPlaceholder(b.agent_rera_number)) {
    ld.identifier = {
      "@type": "PropertyValue",
      propertyID: "HARERA agent registration",
      value: b.agent_rera_number,
    };
  }
  return ld;
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>, site: URL): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: new URL(it.path, site).href,
    })),
  };
}

/** ApartmentComplex with verified fields only: name, locality, developer if authorized, image. */
export function apartmentComplexLd(p: Project, site: URL, imageUrl?: string): Json {
  const ld: Json = {
    "@type": "ApartmentComplex",
    "@id": new URL(`/${p.slug}/#project`, site).href,
    name: p.name,
    url: new URL(`/${p.slug}/`, site).href,
    address: {
      "@type": "PostalAddress",
      streetAddress: p.location.sector,
      addressLocality: p.location.city,
      ...(p.location.region ? { addressRegion: p.location.region } : {}),
      addressCountry: "IN",
    },
  };
  if (p.location.lat !== undefined && p.location.lng !== undefined) {
    ld.geo = { "@type": "GeoCoordinates", latitude: p.location.lat, longitude: p.location.lng };
  }
  if (imageUrl) ld.image = imageUrl;
  return ld;
}

export function faqLd(p: Project, settings: SiteSettings): Json | undefined {
  if (p.faqs.length === 0) return undefined;
  return {
    "@type": "FAQPage",
    mainEntity: p.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: resolveTokens(f.a, p, settings) },
    })),
  };
}

export function graph(nodes: Array<Json | undefined>): Json {
  return { "@context": "https://schema.org", "@graph": nodes.filter(Boolean) };
}
