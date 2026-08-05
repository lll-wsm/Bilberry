import type { UITheme, PreviewTheme } from "./types";
import { uiThemes } from "./ui-themes";
import { previewThemes } from "./preview-themes";
import { toCssVars } from "./convert";

const STYLE_ID = "bilberry-theme";
const CACHE_KEY_MODE = "bilberry-theme-mode";

class ThemeManagerImpl {
  private styleEl: HTMLStyleElement | null = null;

  initSync(): void {
    const mode = localStorage.getItem(CACHE_KEY_MODE);
    const isDark = mode === "dark";
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    const uiTheme = isDark ? uiThemes.dark : uiThemes.light;
    this.inject(uiTheme, null);
  }

  apply(uiThemeId: "light" | "dark", previewThemeId: string): void {
    const uiTheme = uiThemeId === "dark" ? uiThemes.dark : uiThemes.light;
    const previewTheme = previewThemes.find(t => t.id === previewThemeId) ?? previewThemes[0];

    document.documentElement.classList.toggle("dark", uiTheme.mode === "dark");
    localStorage.setItem(CACHE_KEY_MODE, uiTheme.mode);

    this.inject(uiTheme, previewTheme);
  }

  private inject(uiTheme: UITheme, previewTheme: PreviewTheme | null): void {
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = STYLE_ID;
      document.head.appendChild(this.styleEl);
    }

    const uiVars = toCssVars(uiTheme.colors);
    let css = `:root {\n${uiVars}\n}`;

    if (previewTheme) {
      const previewVars = toCssVars(previewTheme.colors);
      css += `\n.markdown-body {\n${previewVars}\n}`;
    }

    this.styleEl.textContent = css;
  }
}

export const themeManager = new ThemeManagerImpl();
