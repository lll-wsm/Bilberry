<script lang="ts">
  import { onMount } from "svelte";
  import { type } from "@tauri-apps/plugin-os";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { invoke } from "@tauri-apps/api/core";
  import { emit } from "@tauri-apps/api/event";
  import { Minus, Square, X } from "lucide-svelte";

  interface MenuAction {
    type: "emit" | "invoke" | "exec" | "window";
    payload: string;
  }

  interface MenuItem {
    label?: string;
    action?: MenuAction;
    separator?: boolean;
  }

  interface MenuCategory {
    label: string;
    items: MenuItem[];
  }

  let osType = $state("");
  let openMenu = $state<number | null>(null);
  const appWindow = getCurrentWindow();

  const menus: MenuCategory[] = [
    {
      label: "Bilberry",
      items: [
        { label: "Settings...", action: { type: "emit", payload: "menu-show-settings" } },
        { separator: true },
        { label: "Quit", action: { type: "window", payload: "close" } },
      ],
    },
    {
      label: "File",
      items: [
        { label: "New Window", action: { type: "invoke", payload: "create_new_window" } },
        { label: "Open Vault...", action: { type: "emit", payload: "menu-open-vault" } },
        { separator: true },
        { label: "Close Window", action: { type: "window", payload: "close" } },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", action: { type: "exec", payload: "undo" } },
        { label: "Redo", action: { type: "exec", payload: "redo" } },
        { separator: true },
        { label: "Cut", action: { type: "exec", payload: "cut" } },
        { label: "Copy", action: { type: "exec", payload: "copy" } },
        { label: "Paste", action: { type: "exec", payload: "paste" } },
        { separator: true },
        { label: "Select All", action: { type: "exec", payload: "selectAll" } },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Zoom In", action: { type: "emit", payload: "menu-zoom-in" } },
        { label: "Zoom Out", action: { type: "emit", payload: "menu-zoom-out" } },
        { label: "Actual Size", action: { type: "emit", payload: "menu-zoom-reset" } },
      ],
    },
    {
      label: "Window",
      items: [
        { label: "Minimize", action: { type: "window", payload: "minimize" } },
        { label: "Zoom", action: { type: "window", payload: "maximize" } },
      ],
    },
  ];

  onMount(() => {
    osType = type();
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  });

  function closeMenu() {
    openMenu = null;
  }

  async function handleAction(action: MenuAction | undefined) {
    if (!action) return;
    openMenu = null;
    const win = getCurrentWindow();
    switch (action.type) {
      case "emit":
        await emit(action.payload);
        break;
      case "invoke":
        await invoke(action.payload);
        break;
      case "exec":
        document.execCommand(action.payload);
        break;
      case "window":
        if (action.payload === "minimize") win.minimize();
        else if (action.payload === "maximize") {
          const isMax = await win.isMaximized();
          isMax ? win.unmaximize() : win.maximize();
        } else if (action.payload === "close") win.close();
        break;
    }
  }

  function onHeaderClick(i: number) {
    openMenu = openMenu === i ? null : i;
  }

  function onHeaderEnter(i: number) {
    if (openMenu !== null) {
      openMenu = i;
    }
  }

  const minimize = () => appWindow.minimize();
  const toggleMaximize = async () => {
    const isMax = await appWindow.isMaximized();
    isMax ? appWindow.unmaximize() : appWindow.maximize();
  };
  const close = () => appWindow.close();
</script>

{#if osType !== "macos"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="titlebar" data-tauri-drag-region onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') openMenu = null; }}>
    <div class="menu-group">
      {#each menus as menu, i}
        <div class="menu-category">
          <button
            class="menu-header"
            class:active={openMenu === i}
            class:brand={i === 0}
            onclick={() => onHeaderClick(i)}
            onmouseenter={() => onHeaderEnter(i)}
          >
            {menu.label}
          </button>
          {#if openMenu === i}
            <!-- svelte-ignore a11y_interactive_supports_focus, a11y_click_events_have_key_events -->
            <div class="menu-dropdown" role="menu" onclick={(e) => e.stopPropagation()}>
              {#each menu.items as item}
                {#if item.separator}
                  <div class="menu-separator" role="separator"></div>
                {:else}
                  <button
                    class="menu-item-btn"
                    role="menuitem"
                    onclick={() => handleAction(item.action)}
                  >
                    {item.label}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="right-section">
      <button class="control-btn" onclick={minimize} title="最小化" aria-label="Minimize">
        <Minus size={14} />
      </button>
      <button class="control-btn" onclick={toggleMaximize} title="最大化" aria-label="Maximize">
        <Square size={12} />
      </button>
      <button class="control-btn close" onclick={close} title="关闭" aria-label="Close">
        <X size={14} />
      </button>
    </div>
  </div>
{/if}

<style>
  .titlebar {
    display: flex;
    align-items: center;
    height: 36px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-divider);
    flex-shrink: 0;
    user-select: none;
    z-index: 9999;
  }

  .menu-group {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 1px;
    padding-left: 8px;
    -webkit-app-region: no-drag;
  }

  .menu-category {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .menu-header {
    padding: 2px 8px;
    height: 26px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }

  .menu-header:hover,
  .menu-header.active {
    background: var(--bg-hover);
  }

  .menu-header.brand {
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .menu-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border-divider);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 10000;
  }

  .menu-item-btn {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
  }

  .menu-item-btn:hover {
    background: var(--bg-hover);
  }

  .menu-separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--border-divider);
  }

  .right-section {
    display: flex;
    height: 100%;
    margin-left: auto;
    -webkit-app-region: no-drag;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    transition: background 0.1s ease;
  }

  .control-btn:hover {
    background: var(--bg-hover);
  }

  .control-btn.close:hover {
    background: #e81123;
    color: white;
  }
</style>
