/**
 * i18n module — reactive Chinese/English localization.
 *
 * - `lang` and `dict` are module-level `$state` (Svelte 5 runes), so any
 *   component that calls `t()` while rendering re-renders automatically when
 *   the language changes (reads during render are tracked).
 * - Language resolution: `settings.language` is `"system" | "zh" | "en"`.
 *   `"system"` follows the OS locale (Chinese systems -> Chinese, everything
 *   else -> English). Falls back to `navigator.language` when the OS locale
 *   cannot be read (e.g. running in a plain browser during development).
 * - When the resolved language changes, the native (Rust) application menu is
 *   rebuilt via the `set_language` command so it matches the UI language.
 */

import { get } from "svelte/store";
import { settingsStore } from "../../stores/settings";
import { locale as osLocale } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import en from "./en";
import zh from "./zh";

export type Lang = "zh" | "en";
export type Messages = typeof en;

type DeepKeys<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T]-?: K extends string
        ? T[K] extends string
          ? K
          : `${K}.${DeepKeys<T[K]>}`
        : never;
    }[keyof T]
  : never;

export type TranslationKey = DeepKeys<Messages>;

let dict: Messages = $state(en);
let lang: Lang = $state("en");
let initialized = false;

function normalize(localeStr: string | null | undefined): Lang {
  const l = (localeStr ?? "").toLowerCase();
  return l.startsWith("zh") ? "zh" : "en";
}

function systemLangSync(): Lang {
  if (typeof navigator !== "undefined" && navigator.language) {
    return normalize(navigator.language);
  }
  return "en";
}

async function detectSystemLang(): Promise<Lang> {
  try {
    const loc = await osLocale();
    if (loc) return normalize(loc);
  } catch {
    // OS locale unavailable — fall through to the synchronous estimate.
  }
  return systemLangSync();
}

function applyLang(l: Lang): void {
  if (lang !== l) {
    lang = l;
    dict = l === "zh" ? zh : en;
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  }
  // Keep the native application menu (macOS) in sync with the UI language.
  try {
    invoke("set_language", { language: l }).catch(() => {});
  } catch {
    // Not running inside Tauri (e.g. `vite dev` in a browser) — ignore.
  }
}

/**
 * Resolve the initial language. Called once from the app shell; safe to call
 * again (no-op after the first run).
 */
export async function initI18n(): Promise<Lang> {
  if (initialized) return lang;
  initialized = true;
  const setting = get(settingsStore).language;
  const resolved = setting === "system" ? await detectSystemLang() : setting;
  applyLang(resolved);
  return resolved;
}

// Re-resolve whenever the persisted setting changes (including the async
// settings.json load at startup and manual changes in the Settings modal).
let lastTarget: "system" | "zh" | "en" | null = null;
settingsStore.subscribe(($s) => {
  if (!initialized || $s.language === lastTarget) return;
  lastTarget = $s.language;
  const target = $s.language;
  if (target === "system") {
    detectSystemLang().then(applyLang);
  } else {
    applyLang(target);
  }
});

/**
 * Translate a dotted key (e.g. `"common.save"`) with optional `{placeholder}`
 * interpolation.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: unknown = dict;
  for (const part of key.split(".")) {
    value = value && typeof value === "object" && part in value
      ? (value as Record<string, unknown>)[part]
      : undefined;
    if (value === undefined) break;
  }
  let str = typeof value === "string" ? value : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
