import type { UITheme, PreviewTheme, UIColors } from "./types";
import { uiThemes } from "./ui-themes";
import { previewThemes } from "./preview-themes";
import { toCssVars, adjustBrightness } from "./convert";

const STYLE_ID = "bilberry-theme";
const CACHE_KEY_MODE = "bilberry-theme-mode";
const CACHE_KEY_PREVIEW = "bilberry-preview-theme";

class ThemeManagerImpl {
  private styleEl: HTMLStyleElement | null = null;

  initSync(): void {
    // Restore the last preview theme (if any) so the correct background is
    // applied on first paint, before settings.json finishes loading.
    const cachedPreviewId = localStorage.getItem(CACHE_KEY_PREVIEW);
    const previewTheme = cachedPreviewId
      ? previewThemes.find(t => t.id === cachedPreviewId) ?? null
      : null;

    // The preview theme's mode is the source of truth; fall back to the mode
    // flag only when no preview theme is cached.
    const mode = previewTheme?.mode ?? localStorage.getItem(CACHE_KEY_MODE);
    const isDark = mode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    const uiTheme = isDark ? uiThemes.dark : uiThemes.light;

    this.inject(uiTheme, previewTheme);
  }

  apply(uiThemeId: "light" | "dark", previewThemeId: string): void {
    const uiTheme = uiThemeId === "dark" ? uiThemes.dark : uiThemes.light;
    const previewTheme = previewThemes.find(t => t.id === previewThemeId) ?? previewThemes[0];

    document.documentElement.classList.toggle("dark", uiTheme.mode === "dark");
    localStorage.setItem(CACHE_KEY_MODE, uiTheme.mode);
    localStorage.setItem(CACHE_KEY_PREVIEW, previewTheme.id);

    this.inject(uiTheme, previewTheme);
  }

  private inject(uiTheme: UITheme, previewTheme: PreviewTheme | null): void {
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = STYLE_ID;
      document.head.appendChild(this.styleEl);
    }

    // Merge UI colors (with bg-derived overrides) and preview theme colors
    // into a single :root block. Preview colors override overlapping UI
    // colors (e.g. --table-border, --table-header-bg) so the preview area
    // uses the theme's original values. CSS variables on :root cascade to
    // .markdown-body automatically — no separate block needed.
    const uiColors = previewTheme?.colors.bgPrimary
      ? this.withThemeBackground(uiTheme.colors, previewTheme.colors.bgPrimary, uiTheme.mode)
      : uiTheme.colors;

    const merged = previewTheme
      ? { ...uiColors, ...previewTheme.colors }
      : uiColors;

    const vars = toCssVars(merged);
    const css = `:root {\n${vars}\ncolor-scheme: ${uiTheme.mode};\n}`;

    this.styleEl.textContent = css;
  }

  /**
   * Override the background-derived fields of a UI palette with shades computed
   * from the preview theme's background color. Text, borders, accents, alert
   * colors, and table colors are kept from the base UI theme / preview theme.
   */
  private withThemeBackground(
    base: UIColors,
    bgPrimary: string,
    mode: "light" | "dark",
  ): UIColors {
    const isDark = mode === "dark";
    const bgSecondary = adjustBrightness(bgPrimary, isDark ? -10 : -8);
    return {
      ...base,
      bgPrimary,
      bgSecondary,
      bgHover: adjustBrightness(bgPrimary, isDark ? -20 : -16),
      // Keep the header flush with the main background (no visible seam),
      // matching the flat look of the base UI themes.
      headerBg: bgPrimary,
      codeBg: adjustBrightness(bgPrimary, isDark ? -12 : -6),
      tableRowBg: bgPrimary,
    };
  }
}

export const themeManager = new ThemeManagerImpl();
