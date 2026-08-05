import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { vaultStore } from "../../stores/vault";
import { resolveRelativePath } from "../preview/markdown";
import { findFile } from "../vault/findFile";

/** Bounding rect of the hovered link, used for popover positioning. */
interface LinkRect {
  left: number;
  top: number;
  bottom: number;
}

const HOVER_DELAY_MS = 400;
const HIDE_DELAY_MS = 100;
const POPOVER_WIDTH = 420;
const POPOVER_HEIGHT_ESTIMATE = 350;
const POPOVER_OFFSET = 8;

/**
 * Shared link-hover-preview logic for the editor and preview components.
 *
 * Both components need the same flow: 400 ms hover -> resolve path -> find
 * file -> read note -> position a `<LinkPreview>` popover.  What differs is
 * *how* the link is detected and *where* the rect comes from (CodeMirror coords
 * vs. DOM getBoundingClientRect), so those concerns stay in the caller.
 *
 * @param getBasePath  Returns the current file path (for relative resolution)
 *                     or null for untitled documents.
 */
export function useLinkPreview(getBasePath: () => string | null) {
  let previewVisible = $state(false);
  let previewContent = $state("");
  let previewX = $state(0);
  let previewY = $state(0);
  let previewPlacement = $state<"top" | "bottom">("bottom");
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Schedule showing a preview for `targetVal` after the hover delay. */
  function scheduleShow(targetVal: string, rect: LinkRect) {
    if (hoverTimeout) clearTimeout(hoverTimeout);

    // If already showing this link's preview, don't restart the timeout
    if (previewVisible && Math.abs(rect.left - previewX) < 1) return;

    hoverTimeout = setTimeout(async () => {
      let fileName = decodeURIComponent(targetVal);
      let fullPath: string | null = null;
      const basePath = getBasePath();

      if (basePath) {
        try {
          const absPath = resolveRelativePath(decodeURIComponent(targetVal), basePath);
          fullPath = findFile(get(vaultStore).fileTree, absPath);
        } catch (err) {
          console.error("[LinkPreview] Error resolving path:", err);
        }
      }

      if (!fullPath) {
        fullPath = findFile(get(vaultStore).fileTree, fileName);
      }

      if (fullPath) {
        try {
          const content = await invoke<string>("read_note", { path: fullPath, encoding: "UTF-8" });
          previewContent = content;

          previewX = rect.left;
          if (previewX + POPOVER_WIDTH > window.innerWidth) {
            previewX = window.innerWidth - (POPOVER_WIDTH + 20);
          }

          if (rect.bottom + POPOVER_OFFSET + POPOVER_HEIGHT_ESTIMATE > window.innerHeight) {
            previewPlacement = "top";
            previewY = window.innerHeight - rect.top + POPOVER_OFFSET;
          } else {
            previewPlacement = "bottom";
            previewY = rect.bottom + POPOVER_OFFSET;
          }

          previewVisible = true;
        } catch (err) {
          console.error("[LinkPreview] Failed to load preview content:", err);
        }
      }
    }, HOVER_DELAY_MS);
  }

  /** Clear any pending show and hide after a short delay, unless the cursor
   *  is still over the popover (or, optionally, over a link). */
  function deferHide(isStillOnLink?: () => boolean, onHide?: () => void) {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    setTimeout(() => {
      const popover = document.querySelector(".link-preview-popover:hover");
      if (!popover && !(isStillOnLink && isStillOnLink())) {
        previewVisible = false;
        onHide?.();
      }
    }, HIDE_DELAY_MS);
  }

  /** Immediately hide the preview and cancel any pending show. */
  function hide() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    previewVisible = false;
  }

  return {
    get previewVisible() { return previewVisible; },
    get previewContent() { return previewContent; },
    get previewX() { return previewX; },
    get previewY() { return previewY; },
    get previewPlacement() { return previewPlacement; },
    scheduleShow,
    deferHide,
    hide,
  };
}
