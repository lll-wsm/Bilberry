export interface ThemeInfo {
  id: string;
  label: string;
  mode: "light" | "dark";
}

export const themes: ThemeInfo[] = [
  { id: "github-light", label: "GitHub Light", mode: "light" },
  { id: "one-dark", label: "One Dark", mode: "dark" },
  { id: "modern-zen", label: "Modern Zen", mode: "light" },
  { id: "ayu", label: "Ayu", mode: "light" },
  { id: "ayu-mirage", label: "Ayu Mirage", mode: "dark" },
  { id: "bear-default", label: "Bear Default", mode: "light" },
  { id: "charcoal", label: "Charcoal", mode: "dark" },
  { id: "cobalt", label: "Cobalt", mode: "dark" },
  { id: "contrast", label: "Contrast", mode: "light" },
  { id: "d-boring", label: "D-Boring", mode: "light" },
  { id: "dark-graphite", label: "Dark Graphite", mode: "dark" },
  { id: "default", label: "Default", mode: "light" },
  { id: "dieci", label: "Dieci", mode: "dark" },
  { id: "dracula", label: "Dracula", mode: "dark" },
  { id: "duotone-heat", label: "Duotone Heat", mode: "light" },
  { id: "duotone-light", label: "Duotone Light", mode: "light" },
  { id: "gandalf", label: "Gandalf", mode: "light" },
  { id: "gotham", label: "Gotham", mode: "dark" },
  { id: "indigo", label: "Indigo", mode: "light" },
  { id: "jzman", label: "Jzman", mode: "light" },
  { id: "lark", label: "Lark", mode: "light" },
  { id: "lark-bold-color", label: "Lark Bold Color", mode: "light" },
  { id: "lighthouse", label: "Lighthouse", mode: "dark" },
  { id: "nord", label: "Nord", mode: "dark" },
  { id: "olive-dunk", label: "Olive Dunk", mode: "light" },
  { id: "panic", label: "Panic", mode: "dark" },
  { id: "red-graphite", label: "Red Graphite", mode: "light" },
  { id: "smartblue", label: "Smart Blue", mode: "light" },
  { id: "solarized-dark", label: "Solarized Dark", mode: "dark" },
  { id: "solarized-light", label: "Solarized Light", mode: "light" },
  { id: "toothpaste", label: "Toothpaste", mode: "dark" },
  { id: "typo", label: "Typo", mode: "light" },
  { id: "v-green", label: "V-Green", mode: "light" },
  { id: "vue", label: "Vue", mode: "light" },
];

// Import all theme CSS as raw strings via Vite's ?raw query
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const themeModules = import.meta.glob("./themes/*.css", {
  query: "?raw",
  eager: false,
}) as Record<string, () => Promise<{ default: string }>>;

let activeThemeId: string | null = null;

// Parse a CSS declaration block and extract named property values
function extractProps(declarations: string): Record<string, string> {
  const result: Record<string, string> = {};
  const props = declarations.split(";").map((s) => s.trim()).filter(Boolean);
  for (const prop of props) {
    const colon = prop.indexOf(":");
    if (colon === -1) continue;
    const name = prop.slice(0, colon).trim();
    const value = prop.slice(colon + 1).trim();
    result[name] = value;
  }
  return result;
}

// Parse CSS to find top-level body{} and html{} declarations
function parseGlobalColors(css: string): {
  bodyBg: string | null;
  bodyColor: string | null;
  htmlColor: string | null;
  htmlBg: string | null;
} {
  let bodyBg: string | null = null;
  let bodyColor: string | null = null;
  let htmlColor: string | null = null;
  let htmlBg: string | null = null;

  let depth = 0;
  let buffer = "";

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === "{") {
      depth++;
      if (depth === 1) {
        const selector = buffer.trim();
        // Remember what we're inside
        buffer = "";
        // Scan until closing }
        let body = "";
        let d = 1;
        let j = i + 1;
        for (; j < css.length; j++) {
          if (css[j] === "{") d++;
          else if (css[j] === "}") {
            d--;
            if (d === 0) break;
          }
          body += css[j];
        }
        i = j; // skip past the closing brace

        const props = extractProps(body);
        if (selector === "body") {
          bodyBg = props["background-color"] ?? props["background"] ?? null;
          bodyColor = props["color"] ?? null;
        } else if (selector === "html") {
          htmlBg = props["background-color"] ?? props["background"] ?? null;
          htmlColor = props["color"] ?? null;
        }
        depth = 0;
        buffer = "";
        continue;
      }
    }
    if (char === "}") {
      depth--;
    }
    buffer += char;
  }

  return { bodyBg, bodyColor, htmlColor, htmlBg };
}

function stripLayoutProps(declarations: string): string {
  return declarations
    .replace(/max-width:\s*[^;]+;?/g, "")
    .replace(/min-width:\s*[^;]+;?/g, "")
    .replace(/margin:\s*[^;]+;?/g, "")
    .replace(/margin-left:\s*[^;]+;?/g, "")
    .replace(/margin-right:\s*[^;]+;?/g, "")
    .replace(/margin-top:\s*[^;]+;?/g, "")
    .replace(/margin-bottom:\s*[^;]+;?/g, "")
    .replace(/padding:\s*[^;]+;?/g, "")
    .replace(/padding-left:\s*[^;]+;?/g, "")
    .replace(/padding-right:\s*[^;]+;?/g, "")
    .replace(/padding-top:\s*[^;]+;?/g, "")
    .replace(/padding-bottom:\s*[^;]+;?/g, "");
}

function scopeSelectors(selectors: string): string {
  return selectors
    .split(",")
    .map((s) => {
      const t = s.trim();
      if (!t) return t;
      // Keep html/body global — they set background-color and text color for the whole app
      if (t === "html" || t === "body") return t;
      if (t.startsWith(":root")) return t;
      if (t.startsWith(".markdown-body")) return t;
      // html.borderbox etc — keep as-is
      if (t.startsWith("html.") || t.startsWith("body.")) return t;
      if (t.startsWith("html ") || t.startsWith("body ")) {
        return ".markdown-body " + t.slice(5);
      }
      if (t.startsWith("html>") || t.startsWith("body>")) {
        return ".markdown-body>" + t.slice(5);
      }
      return ".markdown-body " + t;
    })
    .join(", ");
}

function scopeThemeCss(css: string): string {
  let result = "";
  let buffer = "";
  let depth = 0;
  const atRuleStack: string[] = [];
  const selectorStack: string[] = [];

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === "{") {
      const selectors = buffer.trim();
      depth++;
      if (depth === 1) {
        if (selectors.startsWith("@")) {
          atRuleStack.push(selectors.split(/\s+/)[0]);
          selectorStack.push("");
          result += selectors + "{";
        } else {
          atRuleStack.push("");
          const scoped = scopeSelectors(selectors);
          selectorStack.push(scoped);
          result += scoped + "{";
        }
      } else if (depth === 2 && atRuleStack[atRuleStack.length - 1] === "@media") {
        const scoped = scopeSelectors(selectors);
        selectorStack.push(scoped);
        result += scoped + "{";
      } else {
        selectorStack.push("");
        result += selectors + "{";
      }
      buffer = "";
      continue;
    }
    if (char === "}") {
      depth--;
      const sel = selectorStack.pop() ?? "";
      if (depth === 0) atRuleStack.pop();

      if (sel === "body") {
        // Strip layout-breaking props from body so the app doesn't get squished
        result += stripLayoutProps(buffer) + "}";
      } else {
        result += buffer + "}";
      }
      buffer = "";
      continue;
    }
    buffer += char;
  }
  result += buffer;
  return result;
}

// Derive a slightly darker/lighter shade for secondary backgrounds
function adjustBrightness(hex: string, amount: number): string {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = Math.max(0, Math.min(255, parseInt(c.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(c.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(c.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function isLightColor(hex: string): boolean {
  let c = hex.replace("#", "");
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function applyGlobalColors(colors: {
  bodyBg: string | null;
  bodyColor: string | null;
  htmlColor: string | null;
  htmlBg: string | null;
}) {
  const prev = document.getElementById("bilberry-global-theme-override");
  if (prev) prev.remove();

  const bg = colors.bodyBg ?? colors.htmlBg;
  const fg = colors.bodyColor ?? colors.htmlColor;

  if (!bg && !fg) return;

  const themeInfo = themes.find((t) => t.id === activeThemeId);
  const isDark = themeInfo ? themeInfo.mode === "dark" : (bg ? !isLightColor(bg) : false);

  // Derive CSS variable values from the theme's colors
  const bgPrimary = bg ?? (isDark ? "#1e1e1e" : "#ffffff");
  const bgSecondary = adjustBrightness(bgPrimary, isDark ? -10 : -8);
  const bgHover = adjustBrightness(bgPrimary, isDark ? -20 : -16);
  const textNormal = fg ?? (isDark ? "#cccccc" : "#1f2937");
  const textMuted = adjustBrightness(
    isDark ? "#cccccc" : "#1f2937",
    isDark ? -60 : 60,
  );
  const borderDivider = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";

  const style = document.createElement("style");
  style.id = "bilberry-global-theme-override";
  style.textContent = `
    :root, .dark {
      --bg-primary: ${bgPrimary};
      --bg-secondary: ${bgSecondary};
      --bg-hover: ${bgHover};
      --text-normal: ${textNormal};
      --text-muted: ${textMuted};
      --border-divider: ${borderDivider};
      --header-bg: ${bgSecondary};
      --header-text: ${textNormal};
    }
  `;
  document.head.appendChild(style);
}

function resetGlobalColors() {
  const prev = document.getElementById("bilberry-global-theme-override");
  if (prev) prev.remove();
}

const PREVIEW_THEME_KEY = "bilberry-preview-theme";
const PREVIEW_THEME_MODE_KEY = "bilberry-preview-theme-mode";

function cacheTheme(themeId: string | null, isDark: boolean) {
  if (themeId) {
    localStorage.setItem(PREVIEW_THEME_KEY, themeId);
    localStorage.setItem(PREVIEW_THEME_MODE_KEY, isDark ? "dark" : "light");
  } else {
    localStorage.removeItem(PREVIEW_THEME_KEY);
    localStorage.removeItem(PREVIEW_THEME_MODE_KEY);
  }
}

/** Sync init — call before first render to prevent flash. */
export function initPreviewThemeSync() {
  const mode = localStorage.getItem(PREVIEW_THEME_MODE_KEY);
  if (mode) {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }
}

export async function applyTheme(themeId: string | null) {
  // Remove previous theme styles
  const prevStyle = document.getElementById("bilberry-preview-theme");
  if (prevStyle) prevStyle.remove();

  const themeInfo = themes.find((t) => t.id === themeId);

  if (!themeId || themeId === "default" || !themeInfo) {
    resetGlobalColors();
    activeThemeId = null;
    cacheTheme(null, false);
    return;
  }

  // Set html class for dark/light mode CSS variables
  document.documentElement.classList.toggle("dark", themeInfo.mode === "dark");
  activeThemeId = themeId;
  cacheTheme(themeId, themeInfo.mode === "dark");

  // Load the theme CSS
  const path = `./themes/${themeId}.css`;
  if (!themeModules[path]) {
    console.warn("Unknown theme:", themeId);
    return;
  }

  const mod = await themeModules[path]();
  const rawCss = mod.default;

  // Extract global colors from body{}/html{} to drive CSS variables
  const colors = parseGlobalColors(rawCss);
  applyGlobalColors(colors);

  // Inject scoped CSS (body/html kept global, other selectors scoped to .markdown-body)
  const style = document.createElement("style");
  style.id = "bilberry-preview-theme";
  style.textContent = scopeThemeCss(rawCss);
  document.head.appendChild(style);
}
