<script lang="ts">
  import { onMount } from "svelte";
  import { type } from "@tauri-apps/plugin-os";
  import { vaultStore } from "../../stores/vault";

  let osType = $state("");

  onMount(() => {
    osType = type();
  });

  const filename = $derived($vaultStore.currentFilePath?.split("/").pop() ?? "");
</script>

{#if osType === "macos"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="titlebar" data-tauri-drag-region>
    <span class="filename" data-tauri-drag-region>
      {filename || "Bilberry"}
    </span>
  </div>
{/if}

<style>
  .titlebar {
    height: 30px;
    background: var(--header-bg);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    z-index: 9999;
    position: relative;
  }

  .filename {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    font-weight: 500;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 80px;
    pointer-events: none;
  }
</style>
