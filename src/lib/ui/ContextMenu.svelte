<script lang="ts">
  import { contextMenu, type ContextMenuItem } from "../../stores/contextMenu";

  let visible = $state(false);
  let style = $state("");

  const unsub = contextMenu.subscribe(($m) => {
    visible = $m.show;
    if ($m.show) {
      // Adjust position to stay within viewport
      let x = $m.x;
      let y = $m.y;
      // Use rAF to wait for DOM layout
      requestAnimationFrame(() => {
        const el = document.querySelector(".context-menu-panel") as HTMLElement | null;
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 8;
          if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 8;
          el.style.left = x + "px";
          el.style.top = y + "px";
        }
      });
      style = `left: ${x}px; top: ${y}px;`;
    }
  });

  function handleItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    contextMenu.hide();
    requestAnimationFrame(() => item.action());
  }

  function onBackdropClick() {
    contextMenu.hide();
  }

  function onBackdropContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu.hide();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") contextMenu.hide();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="backdrop"
    onclick={onBackdropClick}
    oncontextmenu={onBackdropContextMenu}
  ></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="context-menu-panel"
    {style}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#each $contextMenu.items as item}
      {#if item.separator}
        <div class="separator"></div>
      {:else}
        <button
          class="menu-item"
          disabled={item.disabled}
          onclick={() => handleItemClick(item)}
          onmousedown={(e) => e.stopPropagation()}
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .context-menu-panel {
    position: fixed;
    z-index: 1000;
    min-width: 160px;
    background: var(--bg-primary);
    border: 1px solid var(--border-divider);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    font-size: 13px;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    color: var(--text-normal);
    border-radius: 4px;
    font-size: 13px;
    white-space: nowrap;
  }

  .menu-item:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .menu-item:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .separator {
    height: 1px;
    background: var(--border-divider);
    margin: 4px 8px;
  }
</style>
