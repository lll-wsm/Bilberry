<script lang="ts">
  import { currentFileIsImage, vaultStore } from "../stores/vault";
  import { t } from "./i18n/i18n.svelte";

  // Word/char counts are computed debounced: for large documents splitting the
  // whole content on every keystroke would add noticeable main-thread work.
  let wordCount = $state(0);
  let charCount = $state(0);
  let countTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const content = $vaultStore.currentContent;
    if (countTimer) clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      wordCount = content ? content.split(/\s+/).filter(Boolean).length : 0;
      charCount = content.length;
    }, 150);
    return () => {
      if (countTimer) clearTimeout(countTimer);
    };
  });

  const encodings = [
    { value: "UTF-8", label: "UTF-8" },
    { value: "GB18030", label: "GBK/GB18030" },
    { value: "Big5", label: "Big5" },
    { value: "Shift_JIS", label: "Shift JIS" },
    { value: "UTF-16LE", label: "UTF-16 LE" },
    { value: "Windows-1252", label: "Win-1252" }
  ];

  let encodingOpen = $state(false);

  let currentEncodingLabel = $derived(
    encodings.find((e) => e.value === $vaultStore.currentEncoding)?.label ??
      $vaultStore.currentEncoding,
  );

  // Close the dropdown whenever the active file changes.
  $effect(() => {
    void $vaultStore.currentFilePath;
    encodingOpen = false;
  });

  function toggleEncoding() {
    encodingOpen = !encodingOpen;
  }

  function selectEncoding(value: string) {
    vaultStore.reloadNoteWithEncoding(value);
    encodingOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && encodingOpen) {
      encodingOpen = false;
    }
  }

  // Close the dropdown when a click lands outside of it.
  function clickOutside(node: HTMLElement, onClose: () => void) {
    function handle(event: MouseEvent) {
      if (!node.contains(event.target as Node)) onClose();
    }
    document.addEventListener("click", handle, true);
    return {
      destroy() {
        document.removeEventListener("click", handle, true);
      },
    };
  }
</script>

{#if $vaultStore.vault}
  <div class="statusbar">
    <span class="left"></span>
    <span class="right">
      <span class="stat">{t("status.words", { count: wordCount })}</span>
      <span class="stat">{t("status.chars", { count: charCount })}</span>

      {#if $vaultStore.currentFilePath && !$currentFileIsImage}
        <div
          class="encoding-dropdown"
          use:clickOutside={() => (encodingOpen = false)}
        >
          <button
            class="encoding-select"
            onclick={toggleEncoding}
            onkeydown={handleKeydown}
            title={t("status.reloadWithEncoding")}
          >
            {currentEncodingLabel}
            <svg
              class="chevron"
              class:open={encodingOpen}
              width="8"
              height="8"
              viewBox="0 0 8 8"
              aria-hidden="true"
            >
              <path
                d="M1 2.5L4 5.5L7 2.5"
                stroke="currentColor"
                stroke-width="1.3"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          {#if encodingOpen}
            <div class="encoding-options">
              {#each encodings as enc}
                <button
                  class="encoding-option"
                  class:active={enc.value === $vaultStore.currentEncoding}
                  onclick={() => selectEncoding(enc.value)}
                >
                  {enc.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </span>
  </div>
{/if}

<style>
  .statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-3);
    background: var(--header-bg);
    color: var(--text-muted);
    font-size: 11px;
    user-select: none;
    height: 24px;
    z-index: 100;
    -webkit-app-region: no-drag;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .stat {
    white-space: nowrap;
    opacity: 0.9;
  }

  .encoding-dropdown {
    position: relative;
  }

  .encoding-select {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    border: none;
    font-size: 11px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    opacity: 0.9;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .encoding-select:hover,
  .encoding-select:focus-visible {
    opacity: 1;
    background: var(--bg-hover);
  }

  .chevron {
    transition: transform 0.15s ease;
    opacity: 0.7;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .encoding-options {
    position: absolute;
    bottom: calc(100% + 3px);
    right: 0;
    min-width: 100%;
    background: var(--bg-secondary);
    color: var(--text-normal);
    border: 1px solid var(--border-divider);
    border-radius: 4px;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.25);
    padding: 2px;
    z-index: 200;
    white-space: nowrap;
  }

  .encoding-option {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    color: var(--text-normal);
    border: none;
    font-size: 11px;
    font-family: inherit;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
  }

  .encoding-option:hover {
    background: var(--bg-hover);
  }

  .encoding-option.active {
    color: var(--interactive-accent);
    font-weight: 500;
  }
</style>
