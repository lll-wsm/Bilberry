<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { type } from "@tauri-apps/plugin-os";
  import { Minus, Square, X } from "lucide-svelte";

  let osType = $state<string>("");
  const appWindow = getCurrentWindow();

  onMount(async () => {
    osType = type();
  });

  const minimize = () => appWindow.minimize();
  const toggleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      appWindow.unmaximize();
    } else {
      appWindow.maximize();
    }
  };
  const close = () => appWindow.close();
</script>

<div class="titlebar" data-tauri-drag-region>
  <div class="title" data-tauri-drag-region>
    {#if osType !== "macos"}
      <span class="app-name">Bilberry</span>
    {/if}
  </div>

  {#if osType !== "macos"}
    <div class="window-controls">
      <button class="control-btn" onclick={minimize} title="最小化">
        <Minus size={14} />
      </button>
      <button class="control-btn" onclick={toggleMaximize} title="最大化">
        <Square size={12} />
      </button>
      <button class="control-btn close" onclick={close} title="关闭">
        <X size={14} />
      </button>
    </div>
  {/if}
</div>

<style>
  .titlebar {
    height: 30px;
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    user-select: none;
    border-bottom: 1px solid var(--border-divider);
    flex-shrink: 0;
    z-index: 9999;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
  }

  .title {
    flex: 1;
    display: flex;
    align-items: center;
    height: 100%;
    padding-left: 12px;
  }

  .app-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.5px;
  }

  .window-controls {
    display: flex;
    height: 100%;
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
    -webkit-app-region: no-drag;
  }

  .control-btn:hover {
    background: var(--bg-hover);
  }

  .control-btn.close:hover {
    background: #e81123;
    color: white;
  }
</style>
