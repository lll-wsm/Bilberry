<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { vaultStore } from "../../stores/vault";
  import { settingsStore } from "../../stores/settings";
  import { splitFrontmatter } from "../preview/markdown";
  import { t } from "../i18n/i18n.svelte";

  let { show = false, onclose }: { show?: boolean; onclose?: () => void } = $props();

  async function exportAsHtml() {
    const path = await save({
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: $vaultStore.currentFilePath?.replace(/\.md$/, ".html") ?? "export.html",
    });
    if (!path) return;

    try {
      const title = $vaultStore.currentFilePath
        ?.split("/")
        .pop()
        ?.replace(/\.md$/, "") ?? "Untitled";
      // Strip / render the YAML front matter the same way the preview does,
      // so the exported HTML never leaks the raw `---` block into the body.
      const { body, panelHtml } = splitFrontmatter(
        $vaultStore.currentContent,
        $settingsStore.frontmatter,
        { properties: t("frontmatter.properties") },
      );
      const html = await invoke<string>("export_html", {
        content: body,
        title,
        frontmatterHtml: panelHtml || null,
      });
      await invoke("write_note", { path, content: html });
      onclose?.();
    } catch (e) {
      alert(t("alert.exportFailed", { error: String(e) }));
    }
  }

  async function exportAsPdf() {
    // Use browser print-to-PDF
    window.print();
    onclose?.();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onclose} onkeydown={(e) => { if (e.key === 'Escape') onclose?.(); }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>{t("export.title")}</h2>
      <div class="options">
        <button class="option-btn" onclick={exportAsHtml}>
          <span class="icon">🌐</span>
          <span class="label">{t("export.html")}</span>
          <span class="desc">{t("export.htmlDesc")}</span>
        </button>
        <button class="option-btn" onclick={exportAsPdf}>
          <span class="icon">📕</span>
          <span class="label">{t("export.pdf")}</span>
          <span class="desc">{t("export.pdfDesc")}</span>
        </button>
      </div>
      <button class="cancel-btn" onclick={onclose}>{t("common.cancel")}</button>
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
    min-width: 320px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    color: var(--text-normal);
  }

  h2 {
    font-size: 18px;
    margin-bottom: 16px;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .option-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid var(--border-divider);
    border-radius: 8px;
    background: var(--bg-secondary);
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: var(--text-normal);
  }

  .option-btn:hover {
    background: var(--bg-hover);
  }

  .icon {
    font-size: 24px;
  }

  .label {
    font-size: 14px;
    font-weight: 500;
  }

  .desc {
    font-size: 12px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .cancel-btn {
    width: 100%;
    padding: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-muted);
    border-radius: 6px;
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
  }
</style>
