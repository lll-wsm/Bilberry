<script lang="ts">
  import { vaultStore, type SearchResult } from "../../stores/vault";
  import { editorStore, pendingNavRange } from "../../stores/editor";
  import { tick } from "svelte";
  import { Search, Loader2 } from "lucide-svelte";

  let query = $state("");
  let searching = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const searchReady = $derived($vaultStore.searchReady);

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!query.trim()) {
      vaultStore.search("");
      searching = false;
      return;
    }
    searching = true;
    debounceTimer = setTimeout(async () => {
      await vaultStore.search(query);
      searching = false;
    }, 200);
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightSnippet(snippet: string, q: string): string {
    if (!q.trim()) return escapeHtml(snippet);
    const escaped = escapeHtml(snippet);
    const regex = new RegExp(`(${escapeRegex(q)})`, "gi");
    return escaped.replace(regex, '<mark class="sr-highlight">$1</mark>');
  }

  async function openResult(result: SearchResult) {
    await vaultStore.openNote(result.path);
    if (result.match_end !== undefined && result.match_end > 0) {
      editorStore.setMode("source");
      await tick();
      pendingNavRange.set({ anchor: result.match_start, head: result.match_end });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      query = "";
      vaultStore.search("");
    }
  }
</script>

<div class="panel">
  <div class="search-box">
    <span class="search-icon"><Search size={14} /></span>
    <input
      type="text"
      placeholder="搜索文件名或内容..."
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKeydown}
    />
    {#if searching}
      <span class="spinner"><Loader2 size={14} /></span>
    {/if}
  </div>

  <div class="results">
    {#if !searchReady && query}
      <p class="status">正在构建搜索索引...</p>
    {:else if $vaultStore.searchResults.length > 0}
      {#each $vaultStore.searchResults as result}
        <button class="result-item" onclick={() => openResult(result)}>
          <span class="title">
            {result.title}
            {#if result.score === 100}
              <span class="badge">文件名</span>
            {/if}
          </span>
          <span class="snippet">{@html highlightSnippet(result.snippet, query)}</span>
          <span class="path">{result.path.split("/").slice(-2).join("/")}</span>
        </button>
      {/each}
    {:else if query && !searching}
      <p class="empty">无匹配结果</p>
    {/if}
  </div>
</div>

<style>
  .panel {
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    background: var(--bg-primary);
    transition: border-color 0.15s;
  }

  .search-box:focus-within {
    border-color: var(--interactive-accent);
  }

  .search-icon {
    display: flex;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .search-box input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 13px;
    outline: none;
    min-width: 0;
  }

  .search-box input::placeholder {
    color: var(--text-muted);
  }

  .spinner {
    display: flex;
    animation: spin 1s linear infinite;
    color: var(--text-muted);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 4px;
  }

  .result-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
  }

  .result-item:hover {
    background: var(--bg-hover);
  }

  .title {
    font-size: 13px;
    font-weight: 500;
    color: var(--interactive-accent);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge {
    font-size: 10px;
    font-weight: 400;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  .snippet {
    font-size: 11px;
    color: var(--text-muted);
    overflow-wrap: break-word;
    word-break: break-all;
    line-height: 1.4;
  }

  .path {
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.6;
    overflow-wrap: break-word;
    word-break: break-all;
  }

  .empty, .status {
    font-size: 12px;
    color: var(--text-muted);
    padding: 16px;
    text-align: center;
  }

  .status {
    color: var(--interactive-accent);
    opacity: 0.8;
  }

  :global(.sr-highlight) {
    background: var(--interactive-accent);
    color: var(--bg-primary);
    border-radius: 2px;
    padding: 0 1px;
  }
</style>
