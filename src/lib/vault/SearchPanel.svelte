<script lang="ts">
  import { vaultStore, type SearchResult } from "../../stores/vault";

  let query = $state("");

  function onInput() {
    vaultStore.search(query);
  }

  function openResult(result: SearchResult) {
    vaultStore.openNote(result.path);
  }
</script>

<div class="panel">
  <div class="search-box">
    <input
      type="text"
      placeholder="搜索笔记..."
      bind:value={query}
      oninput={onInput}
    />
  </div>

  <div class="results">
    {#if $vaultStore.searchResults.length > 0}
      {#each $vaultStore.searchResults as result}
        <button class="result-item" onclick={() => openResult(result)}>
          <span class="title">{result.title}</span>
          <span class="snippet">{result.snippet}</span>
        </button>
      {/each}
    {:else if query && $vaultStore.searchResults.length === 0}
      <p class="empty">无匹配结果</p>
    {/if}
  </div>
</div>

<style>
  .panel {
    padding: 8px;
  }

  .search-box {
    padding: 0 0 8px;
  }

  .search-box input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    outline: none;
  }

  .search-box input:focus {
    border-color: #0366d6;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 2px;
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
    color: #0366d6;
  }

  .snippet {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    font-size: 12px;
    color: var(--text-muted);
    padding: 16px;
    text-align: center;
  }
</style>
