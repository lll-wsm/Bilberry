export interface ThemeInfo {
  id: string;
  label: string;
  mode: "light" | "dark";
}

export const themes: ThemeInfo[] = [
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

function scopeSelectors(selectors: string): string {
  return selectors
    .split(",")
    .map((s) => {
      const t = s.trim();
      if (!t) return t;
      if (t === "html" || t === "body") return ".markdown-body";
      if (t.startsWith(":root")) return t;
      if (t.startsWith(".markdown-body")) return t;
      if (t.startsWith("html.") || t.startsWith("body.")) {
        return ".markdown-body" + t.slice(4);
      }
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

  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === "{") {
      const selectors = buffer.trim();
      depth++;
      if (depth === 1) {
        if (selectors.startsWith("@")) {
          atRuleStack.push(selectors.split(/\s+/)[0]);
          result += selectors + "{";
        } else {
          atRuleStack.push("");
          result += scopeSelectors(selectors) + "{";
        }
      } else if (depth === 2 && atRuleStack[atRuleStack.length - 1] === "@media") {
        result += scopeSelectors(selectors) + "{";
      } else {
        result += selectors + "{";
      }
      buffer = "";
      continue;
    }
    if (char === "}") {
      depth--;
      atRuleStack.pop();
      result += buffer + "}";
      buffer = "";
      continue;
    }
    buffer += char;
  }
  result += buffer;
  return result;
}

export async function applyTheme(themeId: string | null) {
  // Remove previous theme
  const prev = document.getElementById("bilberry-preview-theme");
  if (prev) prev.remove();

  if (!themeId || themeId === "default") {
    activeThemeId = null;
    return;
  }

  const path = `./themes/${themeId}.css`;
  if (!themeModules[path]) {
    console.warn("Unknown theme:", themeId);
    return;
  }

  const mod = await themeModules[path]();
  const style = document.createElement("style");
  style.id = "bilberry-preview-theme";
  style.textContent = scopeThemeCss(mod.default);
  document.head.appendChild(style);
  activeThemeId = themeId;
}
