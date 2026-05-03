export interface ThemeInfo {
  id: string;
  label: string;
  mode: "light" | "dark";
  colors?: {
    primary: string;
    secondary: string;
    text: string;
    accent: string;
  };
}

export const themes: ThemeInfo[] = [
  {
    id: "ayu",
    label: "Ayu",
    mode: "light",
    colors: { primary: "#fdfdfd", secondary: "#fafafa", text: "#1a1f29", accent: "#ff9940" },
  },
  {
    id: "ayu-mirage",
    label: "Ayu Mirage",
    mode: "dark",
    colors: { primary: "#1f2430", secondary: "#171b24", text: "#cbccc6", accent: "#ffcc66" },
  },
  {
    id: "bear-default",
    label: "Bear Default",
    mode: "light",
    colors: { primary: "#ffffff", secondary: "#f5f5f5", text: "#2c2c2c", accent: "#eb5757" },
  },
  {
    id: "charcoal",
    label: "Charcoal",
    mode: "dark",
    colors: { primary: "#1f2023", secondary: "#161719", text: "#eeeeee", accent: "#eb5757" },
  },
  {
    id: "cobalt",
    label: "Cobalt",
    mode: "dark",
    colors: { primary: "#051e33", secondary: "#011627", text: "#e0e0e0", accent: "#ff9d00" },
  },
  { id: "contrast", label: "Contrast", mode: "light" },
  { id: "d-boring", label: "D-Boring", mode: "light" },
  {
    id: "dark-graphite",
    label: "Dark Graphite",
    mode: "dark",
    colors: { primary: "#1e1e1e", secondary: "#181818", text: "#d4d4d4", accent: "#eb5757" },
  },
  { id: "default", label: "Default", mode: "light" },
  { id: "dieci", label: "Dieci", mode: "dark" },
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    colors: { primary: "#282a36", secondary: "#21222c", text: "#f8f8f2", accent: "#bd93f9" },
  },
  { id: "duotone-heat", label: "Duotone Heat", mode: "light" },
  { id: "duotone-light", label: "Duotone Light", mode: "light" },
  { id: "gandalf", label: "Gandalf", mode: "light" },
  { id: "gotham", label: "Gotham", mode: "dark" },
  { id: "indigo", label: "Indigo", mode: "light" },
  { id: "jzman", label: "Jzman", mode: "light" },
  { id: "lark", label: "Lark", mode: "light" },
  { id: "lark-bold-color", label: "Lark Bold Color", mode: "light" },
  { id: "lighthouse", label: "Lighthouse", mode: "dark" },
  {
    id: "nord",
    label: "Nord",
    mode: "dark",
    colors: { primary: "#2e3440", secondary: "#242933", text: "#d8dee9", accent: "#88c0d0" },
  },
  { id: "olive-dunk", label: "Olive Dunk", mode: "light" },
  { id: "panic", label: "Panic", mode: "dark" },
  { id: "red-graphite", label: "Red Graphite", mode: "light" },
  { id: "smartblue", label: "Smart Blue", mode: "light" },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    mode: "dark",
    colors: { primary: "#002b36", secondary: "#073642", text: "#839496", accent: "#268bd2" },
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    mode: "light",
    colors: { primary: "#fdf6e3", secondary: "#eee8d5", text: "#657b83", accent: "#268bd2" },
  },
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
  // 1. Remove previous theme and global overrides
  const prevStyle = document.getElementById("bilberry-preview-theme");
  if (prevStyle) prevStyle.remove();

  const prevGlobal = document.getElementById("bilberry-global-theme-override");
  if (prevGlobal) prevGlobal.remove();

  const themeInfo = themes.find((t) => t.id === themeId) || themes.find(t => t.id === 'default');
  
  if (!themeInfo) {
    document.body.className = "light";
    activeThemeId = null;
    return;
  }

  // 2. Apply theme mode to body
  document.body.className = themeInfo.mode;

  // 3. Inject global variable overrides if color metadata exists
  if (themeInfo.colors) {
    const globalStyle = document.createElement("style");
    globalStyle.id = "bilberry-global-theme-override";
    globalStyle.textContent = `
      :root, .dark {
        --bg-primary: ${themeInfo.colors.primary};
        --bg-secondary: ${themeInfo.colors.secondary};
        --text-normal: ${themeInfo.colors.text};
        --interactive-accent: ${themeInfo.colors.accent};
        --border-divider: ${themeInfo.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
        --header-bg: ${themeInfo.colors.secondary};
        --header-text: ${themeInfo.colors.text};
      }
    `;
    document.head.appendChild(globalStyle);
  }

  if (!themeId || themeId === "default") {
    activeThemeId = null;
    return;
  }

  // 4. Load and apply preview-scoped CSS
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
