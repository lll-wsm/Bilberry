<script lang="ts">
  import { settingsStore } from "../../stores/settings";
  import { previewThemes } from "../themes/preview-themes";
  import { t } from "../i18n/i18n.svelte";

  let { show = false, onclose }: { show?: boolean; onclose?: () => void } = $props();

  let fontSize = $state($settingsStore.fontSize);
  let fontFamily = $state($settingsStore.fontFamily);
  let lineHeight = $state($settingsStore.lineHeight);
  let autoSaveDelay = $state($settingsStore.autoSaveDelay);
  let previewTheme = $state($settingsStore.previewTheme);
  let showHiddenFiles = $state($settingsStore.showHiddenFiles);
  let language = $state($settingsStore.language);
  let frontmatter = $state($settingsStore.frontmatter);

  $effect(() => {
    if (show) {
      fontSize = $settingsStore.fontSize;
      fontFamily = $settingsStore.fontFamily;
      lineHeight = $settingsStore.lineHeight;
      autoSaveDelay = $settingsStore.autoSaveDelay;
      previewTheme = $settingsStore.previewTheme;
      showHiddenFiles = $settingsStore.showHiddenFiles;
      language = $settingsStore.language;
      frontmatter = $settingsStore.frontmatter;
    }
  });

  function save() {
    settingsStore.updateSetting("fontSize", fontSize);
    settingsStore.updateSetting("fontFamily", fontFamily);
    settingsStore.updateSetting("lineHeight", lineHeight);
    settingsStore.updateSetting("autoSaveDelay", autoSaveDelay);
    settingsStore.updateSetting("showHiddenFiles", showHiddenFiles);
    settingsStore.updateSetting("language", language);
    settingsStore.updateSetting("frontmatter", frontmatter);
    
    // Logic: if previewTheme is 'system', app base theme is also 'system'.
    // Otherwise, app base theme matches the preview theme's mode.
    if (previewTheme === "system") {
      settingsStore.updateSetting("theme", "system");
      settingsStore.updateSetting("previewTheme", "system");
    } else {
      const selected = previewThemes.find(t => t.id === previewTheme);
      if (selected) {
        settingsStore.updateSetting("theme", selected.mode);
        settingsStore.updateSetting("previewTheme", previewTheme);
      } else {
        settingsStore.updateSetting("theme", "light");
        settingsStore.updateSetting("previewTheme", "default");
      }
    }
    
    onclose?.();
  }

  function handleThemeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    previewTheme = target.value;
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onclose} onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>{t("settings.title")}</h2>

      <div class="field">
        <label for="previewTheme">{t("settings.appearanceAndTheme")}</label>
        <select id="previewTheme" value={previewTheme} onchange={handleThemeChange}>
          <option value="system">{t("settings.followSystem")}</option>
          <optgroup label={t("settings.lightThemes")}>
            {#each previewThemes.filter(t => t.mode === "light" && t.id !== "default") as theme}
              <option value={theme.id}>{theme.label}</option>
            {/each}
          </optgroup>
          <optgroup label={t("settings.darkThemes")}>
            {#each previewThemes.filter(t => t.mode === "dark") as theme}
              <option value={theme.id}>{theme.label}</option>
            {/each}
          </optgroup>
        </select>
      </div>

      <div class="field">
        <label for="language">{t("settings.language")}</label>
        <select id="language" bind:value={language}>
          <option value="system">{t("settings.languageSystem")}</option>
          <option value="zh">{t("settings.languageChinese")}</option>
          <option value="en">{t("settings.languageEnglish")}</option>
        </select>
      </div>

      <div class="field">
        <label for="frontmatter">{t("settings.frontmatter")}</label>
        <select id="frontmatter" bind:value={frontmatter}>
          <option value="properties">{t("settings.frontmatterProperties")}</option>
          <option value="hidden">{t("settings.frontmatterHidden")}</option>
          <option value="code">{t("settings.frontmatterCode")}</option>
        </select>
      </div>

      <div class="field">
        <label for="fontSize">{t("settings.fontSize")}</label>
        <div class="input-row">
          <input
            id="fontSize"
            type="range"
            min="10"
            max="24"
            bind:value={fontSize}
          />
          <span class="value">{fontSize}px</span>
        </div>
      </div>

      <div class="field">
        <label for="fontFamily">{t("settings.fontFamily")}</label>
        <select id="fontFamily" bind:value={fontFamily}>
          <option value="SF Mono, Fira Code, Cascadia Code, monospace">{t("settings.fontMonospace")}</option>
          <option value="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">{t("settings.fontSansSerif")}</option>
          <option value="Georgia, 'Times New Roman', Times, serif">{t("settings.fontSerif")}</option>
        </select>
      </div>

      <div class="field">
        <label for="lineHeight">{t("settings.lineHeight")}</label>
        <div class="input-row">
          <input
            id="lineHeight"
            type="range"
            min="1.0"
            max="2.4"
            step="0.1"
            bind:value={lineHeight}
          />
          <span class="value">{lineHeight.toFixed(1)}</span>
        </div>
      </div>

      <div class="field">
        <label for="autoSaveDelay">{t("settings.autoSaveDelay")}</label>
        <div class="input-row">
          <input
            id="autoSaveDelay"
            type="range"
            min="500"
            max="5000"
            step="500"
            bind:value={autoSaveDelay}
          />
          <span class="value">{autoSaveDelay}ms</span>
        </div>
      </div>

      <div class="field">
        <label class="checkbox-label">
          <input
            type="checkbox"
            bind:checked={showHiddenFiles}
          />
          {t("settings.showHiddenFiles")}
        </label>
      </div>

      <div class="actions">
        <button class="btn primary" onclick={save}>{t("common.save")}</button>
        <button class="btn" onclick={onclose}>{t("common.cancel")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-primary);
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    color: var(--text-normal);
  }

  h2 {
    font-size: 18px;
    margin-bottom: 20px;
  }

  .field {
    margin-bottom: 16px;
  }

  .field label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 6px;
    color: var(--text-normal);
  }

  select {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-normal);
    font-size: 13px;
    outline: none;
    cursor: pointer;
  }

  select:focus {
    border-color: var(--interactive-accent);
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .input-row input[type="range"] {
    flex: 1;
  }

  .value {
    font-size: 12px;
    color: var(--text-muted);
    min-width: 50px;
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 24px;
  }

  .btn {
    padding: 6px 16px;
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    background: var(--bg-secondary);
    cursor: pointer;
    font-size: 13px;
    color: var(--text-normal);
  }

  .btn:hover {
    background: var(--bg-hover);
  }

  .btn.primary {
    background: var(--interactive-accent);
    color: white;
    border-color: var(--interactive-accent);
  }

  .btn.primary:hover {
    opacity: 0.9;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
    margin-top: 12px;
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
    margin: 0;
    width: 16px;
    height: 16px;
    accent-color: var(--interactive-accent);
  }
</style>
