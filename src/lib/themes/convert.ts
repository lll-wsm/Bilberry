export function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function toCssVars(colors: object, prefix = "--"): string {
  return Object.entries(colors as Record<string, string>)
    .map(([k, v]) => `${prefix}${camelToKebab(k)}: ${v};`)
    .join("\n");
}
