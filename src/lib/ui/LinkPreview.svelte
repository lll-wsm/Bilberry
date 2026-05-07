<script lang="ts">
  import { renderMarkdown } from "../preview/markdown";
  import { themes } from "../preview/themes";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";

  let { content = "", x = 0, y = 0, visible = false }: {
    content?: string;
    x?: number;
    y?: number;
    visible?: boolean;
  } = $props();

  let renderedHtml = $derived(renderMarkdown(content).html);

  // Post-process HTML to wrap sections in <details> for folding
  function processFolding(html: string): string {
    if (typeof document === "undefined") return html;
    const div = document.createElement("div");
    div.innerHTML = html;

    const children = Array.from(div.children);
    if (children.length === 0) return html;

    const newContainer = document.createElement("div");
    let currentDetails: HTMLDetailsElement | null = null;

    children.forEach((child) => {
      const tag = child.tagName.toLowerCase();
      if (["h1", "h2", "h3", "h4"].includes(tag)) {
        currentDetails = document.createElement("details");
        const summary = document.createElement("summary");
        summary.innerHTML = child.innerHTML;
        summary.className = "preview-summary";
        
        // Set level for hierarchical styling
        const level = tag.substring(1);
        summary.setAttribute("data-level", level);

        // Copy color if it's a heading
        const color = window.getComputedStyle(child).color;
        if (color) summary.style.setProperty("--summary-color", color);

        currentDetails.appendChild(summary);
        newContainer.appendChild(currentDetails);
      } else {
        if (currentDetails) {
          currentDetails.appendChild(child.cloneNode(true));
        } else {
          newContainer.appendChild(child.cloneNode(true));
        }
      }
    });

    return newContainer.innerHTML;
  }

  let foldedHtml = $derived(processFolding(renderedHtml));

  const previewThemeId = $derived($settingsStore.previewTheme);
  const isDark = $derived(themes.find(t => t.id === previewThemeId)?.mode === "dark" || $theme === "dark");

  let style = $derived(`left: ${x}px; top: ${y}px;`);
</script>

{#if visible && content}
  <div class="link-preview-popover" {style} class:dark={isDark}>
    <div class="preview-content markdown-body">
      {@html foldedHtml}
    </div>
  </div>
{/if}

<style>
  .link-preview-popover {
    position: fixed;
    z-index: 10000;
    width: 420px;
    max-height: 350px;
    background: var(--bg-primary);
    border: 1px solid var(--border-divider);
    border-radius: 10px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    pointer-events: auto; /* Enable interaction for folding */
    display: flex;
    flex-direction: column;
    animation: fade-in 0.15s ease-out;
  }

  .link-preview-popover.dark {
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  }

  .preview-content {
    padding: 12px;
    overflow-y: auto;
    font-size: 13px;
  }

  :global(.preview-summary) {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    list-style: none;
    font-weight: 600;
    color: var(--summary-color, var(--interactive-accent));
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.1s;
  }

  :global(.preview-summary[data-level="1"]) { font-size: 1.35em; border-bottom: 1px solid var(--border-divider); margin-bottom: 6px; }
  :global(.preview-summary[data-level="2"]) { font-size: 1.15em; }
  :global(.preview-summary[data-level="3"]) { font-size: 1.05em; color: var(--text-normal); }
  :global(.preview-summary[data-level="4"]) { font-size: 0.95em; color: var(--text-muted); }

  :global(.preview-summary::-webkit-details-marker) {
    display: none;
  }

  :global(.preview-summary::before) {
    content: "▶";
    font-size: 8px;
    transition: transform 0.2s;
    color: var(--text-muted);
  }

  :global(details[open] > .preview-summary::before) {
    transform: rotate(90deg);
  }

  :global(.preview-summary:hover) {
    background: var(--bg-hover);
  }

  :global(details) {
    margin-bottom: 2px;
  }

  :global(details > *:not(summary)) {
    padding-left: 20px;
    opacity: 0.9;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Limit image sizes in preview */
  .preview-content :global(img) {
    max-height: 150px;
    width: auto;
  }
</style>
