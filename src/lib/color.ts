/** WCAG contrast helpers used to keep per-project accents accessible. */

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const a = luminance(hexToRgb(fg));
  const b = luminance(hexToRgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Mix a color toward white until it reaches the target contrast on bg (dark themes). */
export function lightenToContrast(fg: string, bg: string, target = 4.5): string {
  const base = hexToRgb(fg);
  for (let k = 0; k <= 1; k += 0.02) {
    const c = base.map((v) => v + (255 - v) * k) as Rgb;
    const hex = toHex(c);
    if (contrastRatio(hex, bg) >= target) return hex;
  }
  return "#FFFFFF";
}

/**
 * Darken a color toward black until it reaches the target contrast on bg.
 * Used to derive a small-text-safe variant of a project accent.
 */
export function darkenToContrast(fg: string, bg: string, target = 4.5): string {
  const base = hexToRgb(fg);
  for (let k = 0; k <= 1; k += 0.02) {
    const c = base.map((v) => v * (1 - k)) as Rgb;
    const hex = toHex(c);
    if (contrastRatio(hex, bg) >= target) return hex;
  }
  return "#000000";
}
