<script lang="ts">
  import { vaultStore } from "../../stores/vault";
  import { contextMenu } from "../../stores/contextMenu";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { X, PanelLeftClose, PanelLeft } from "lucide-svelte";

  let {
    sidebarOpen = true,
    onToggleSidebar = () => {},
  }: {
    sidebarOpen?: boolean;
    onToggleSidebar?: () => void;
  } = $props();

  const tabs = $derived($vaultStore.openTabs);
  const activePath = $derived($vaultStore.currentFilePath);

  function onTabClick(path: string) {
    vaultStore.switchTab(path);
  }

  function onTabClose(e: Event, path: string) {
    e.stopPropagation();
    vaultStore.closeTab(path);
  }

  function revealInFinder(path: string) {
    invoke("reveal_in_finder", { path });
  }

  function copyRelativePath(path: string) {
    const vp = $vaultStore.vault?.path;
    if (!vp) return;
    const relPath = path.startsWith(vp + "/")
      ? path.slice(vp.length + 1)
      : path;
    navigator.clipboard.writeText(relPath);
  }

  function copyAbsolutePath(path: string) {
    navigator.clipboard.writeText(path);
  }

  async function onTabContextMenu(e: MouseEvent, path: string) {
    const idx = tabs.findIndex(t => t.path === path);
    contextMenu.show(e, [
      { label: "关闭", action: () => vaultStore.closeTab(path) },
      { separator: true, label: "", action: () => {} },
      { label: "关闭其他标签", action: () => {
        tabs.forEach(t => { if (t.path !== path) vaultStore.closeTab(t.path); });
      }},
      { label: "关闭左侧标签", action: () => {
        tabs.filter((_, i) => i < idx).forEach(t => vaultStore.closeTab(t.path));
      }},
      { label: "关闭右侧标签", action: () => {
        tabs.filter((_, i) => i > idx).forEach(t => vaultStore.closeTab(t.path));
      }},
      { label: "全部关闭", action: () => {
        tabs.forEach(t => vaultStore.closeTab(t.path));
      }},
      { separator: true, label: "", action: () => {} },
      { label: "在文件系统打开", action: () => revealInFinder(path) },
      { separator: true, label: "", action: () => {} },
      { label: "复制相对路径", action: () => copyRelativePath(path) },
      { label: "复制绝对路径", action: () => copyAbsolutePath(path) },
    ]);
  }

  function onWheel(e: WheelEvent) {
    const container = e.currentTarget as HTMLElement;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      container.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  $effect(() => {
    if (activePath) {
      const activeEl = document.querySelector(".tab.active");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  });
</script>

<div class="tab-bar" data-tauri-drag-region>
  <div class="leading-fixed">
    <button
      class="sidebar-toggle"
      onclick={onToggleSidebar}
      title="切换侧边栏"
    >
      {#if sidebarOpen}
        <PanelLeftClose size={16} />
      {:else}
        <PanelLeft size={16} />
      {/if}
    </button>
  </div>

  <div class="tabs-scroll" onwheel={onWheel}>
    {#each tabs as tab (tab.path)}
      <button
        class="tab"
        class:active={tab.path === activePath}
        onclick={() => onTabClick(tab.path)}
        oncontextmenu={(e) => onTabContextMenu(e, tab.path)}
        title={tab.path}
      >
        <span class="tab-name">{tab.path.split("/").pop()}</span>
        <span
          class="tab-close"
          role="button"
          tabindex="-1"
          onclick={(e) => onTabClose(e, tab.path)}
          onkeydown={(e) => { if (e.key === 'Enter') onTabClose(e, tab.path); }}
        >
          <X size={12} />
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-divider);
    flex-shrink: 0;
    padding-top: 28px;
  }

  .leading-fixed {
    display: flex;
    align-items: center;
    background: var(--bg-secondary);
    padding-right: 4px;
  }

  .sidebar-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    padding: 6px 8px;
    border-radius: 4px;
    transition: background 0.1s ease, color 0.1s ease;
    flex-shrink: 0;
  }

  .sidebar-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .tabs-scroll {
    display: flex;
    align-items: center;
    overflow-x: auto;
    flex: 1;
    align-self: stretch;
    scrollbar-width: none; /* Firefox */
  }

  .tabs-scroll::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Edge */
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    border-right: 1px solid var(--border-divider);
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
    position: relative;
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-normal);
  }

  .tab.active {
    background: var(--bg-primary);
    color: var(--text-normal);
  }

  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--interactive-accent);
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
    color: var(--text-muted);
  }

  .tab:hover .tab-close {
    opacity: 0.5;
  }

  .tab.active .tab-close {
    opacity: 0.5;
  }

  .tab-close:hover {
    opacity: 1 !important;
    background: var(--bg-hover);
    color: var(--text-normal);
  }
</style>
