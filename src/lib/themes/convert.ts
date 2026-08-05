export function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function toCssVars(colors: object, prefix = "--"): string {
  return Object.entries(colors as Record<string, string>)
    .map(([k, v]) => `${prefix}${camelToKebab(k)}: ${v};`)
    .join("\n");
}

/**
 * Normalize a hex color to 6-digit form (#fff -> #ffffff).
 * Returns the input unchanged if it is not a 3/6-digit hex.
 */
export function normalizeHex(hex: string): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  return `#${c}`;
}

/**
 * Lighten (positive amount) or darken (negative amount) a hex color, clamped to [0,255].
 */
export function adjustBrightness(hex: string, amount: number): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = Math.max(0, Math.min(255, parseInt(c.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(c.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(c.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Perceptual luminance test: is this hex color "light" (luminance > 128)? */
export function isLightColor(hex: string): boolean {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
