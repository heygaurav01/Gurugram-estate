/**
 * Maps assets.yaml entries to Astro ImageMetadata so astro:assets can emit
 * responsive AVIF/WebP. Only files inside a project's images/ folder resolve.
 */
import type { ImageMetadata } from "astro";

const files = import.meta.glob<{ default: ImageMetadata }>(
  "/src/content/projects/*/images/*.{png,jpg,jpeg,webp,avif}",
  { eager: true },
);

export function projectImage(slug: string, file: string): ImageMetadata {
  const mod = files[`/src/content/projects/${slug}/images/${file}`];
  if (!mod) throw new Error(`[${slug}] images/${file} not found or not a raster image.`);
  return mod.default;
}

/** Responsive widths used for every content image. */
export const IMAGE_WIDTHS = [640, 960, 1280, 1920];
