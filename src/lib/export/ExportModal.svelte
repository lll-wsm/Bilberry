<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { vaultStore } from "../../stores/vault";

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
      const html = await invoke<string>("export_html", {
        content: $vaultStore.currentContent,
        title,
      });
      await invoke("write_note", { path, content: html });
      onclose?.();
    } catch (e) {
      alert("导出失败: " + e);
    }
  }

  async function exportAsPdf() {
    // Use browser print-to-PDF
    window.print();
    onclose?.();
  }
</script>

{#if show}
  <div class="overlay" onclick={onclose}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <h2>导出</h2>
      <div class="options">
        <button class="option-btn" onclick={exportAsHtml}>
          <span class="icon">🌐</span>
          <span class="label">导出 HTML</span>
          <span class="desc">生成独立的 HTML 文件</span>
        </button>
        <button class="option-btn" onclick={exportAsPdf}>
          <span class="icon">📕</span>
          <span class="label">导出 PDF</span>
          <span class="desc">通过浏览器打印生成 PDF</span>
        </button>
      </div>
      <button class="cancel-btn" onclick={onclose}>取消</button>
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
