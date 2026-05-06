<script lang="ts">
  import { onMount } from "svelte";
  import { type } from "@tauri-apps/plugin-os";

  let osType = $state("");

  onMount(() => {
    osType = type();
  });
</script>

{#if osType === "macos"}
  <div class="titlebar" data-tauri-drag-region></div>
{/if}

<style>
  .titlebar {
    height: 30px;
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    z-index: 9999;
  }
</style>
