<script lang="ts">
  import { settingsStore } from "../../stores/settings";
  import { themes, applyTheme } from "../preview/themes";

  let { show = false, onclose }: { show?: boolean; onclose?: () => void } = $props();

  let fontSize = $state($settingsStore.fontSize);
  let lineHeight = $state($settingsStore.lineHeight);
  let autoSaveDelay = $state($settingsStore.autoSaveDelay);
  let previewTheme = $state($settingsStore.previewTheme);
  let showLineNumbers = $state($settingsStore.showLineNumbers);

  function save() {
    settingsStore.updateSetting("fontSize", fontSize);
    settingsStore.updateSetting("lineHeight", lineHeight);
    settingsStore.updateSetting("autoSaveDelay", autoSaveDelay);
    settingsStore.updateSetting("previewTheme", previewTheme);
    settingsStore.updateSetting("showLineNumbers", showLineNumbers);
    applyTheme(previewTheme);
    onclose?.();
  }

  function handleThemeChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    previewTheme = target.value;
    applyTheme(previewTheme);
  }
</script>

{#if show}
  <div class="overlay" onclick={onclose} onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>设置</h2>

      <div class="field">
        <label for="previewTheme">预览主题</label>
        <select id="previewTheme" value={previewTheme} onchange={handleThemeChange}>
          <option value="default">Default</option>
          <optgroup label="浅色">
            {#each themes.filter(t => t.mode === "light") as t}
              <option value={t.id}>{t.label}</option>
            {/each}
          </optgroup>
          <optgroup label="深色">
            {#each themes.filter(t => t.mode === "dark") as t}
              <option value={t.id}>{t.label}</option>
            {/each}
          </optgroup>
        </select>
      </div>

      <div class="field">
        <label for="fontSize">字号</label>
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
        <label for="lineHeight">行高</label>
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
        <label for="autoSaveDelay">自动保存延迟</label>
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

      <div class="field checkbox-field">
        <input
          id="showLineNumbers"
          type="checkbox"
          bind:checked={showLineNumbers}
        />
        <label for="showLineNumbers">显示行号</label>
      </div>

      <div class="actions">
        <button class="btn primary" onclick={save}>保存</button>
        <button class="btn" onclick={onclose}>取消</button>
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

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .checkbox-field input {
    width: auto;
    margin: 0;
  }

  .checkbox-field label {
    margin-bottom: 0;
    cursor: pointer;
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
</style>
