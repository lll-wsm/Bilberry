<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let { path = "" }: { path?: string } = $props();

  let src = $state("");
  let loadError = $state<string | null>(null);

  function getMimeType(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".avif")) return "image/avif";
    if (lower.endsWith(".ico")) return "image/x-icon";
    return "application/octet-stream";
  }

  $effect(() => {
    let cancelled = false;
    let objectUrl = "";

    src = "";
    loadError = null;

    if (!path) return;

    (async () => {
      try {
        const bytes = await invoke<number[]>("read_binary_file", { path });
        if (cancelled) return;

        const blob = new Blob([new Uint8Array(bytes)], { type: getMimeType(path) });
        objectUrl = URL.createObjectURL(blob);
        src = objectUrl;
      } catch (error) {
        console.error("Failed to load image:", error);
        if (!cancelled) {
          loadError = error instanceof Error ? error.message : String(error);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  });
</script>

<div class="image-viewer">
  {#if src}
    <img class="image" {src} alt={path.split("/").pop() ?? "image"} draggable="false" />
  {:else if loadError}
    <div class="empty">无法加载图片: {loadError}</div>
  {:else}
    <div class="empty">正在加载图片...</div>
  {/if}
</div>

<style>
  .image-viewer {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 24px;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 50%),
      linear-gradient(180deg, rgba(128, 128, 128, 0.04), rgba(128, 128, 128, 0.02));
  }

  .image {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 10px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
    background: white;
  }

  .empty {
    color: var(--text-muted);
    font-size: 14px;
  }
</style>
