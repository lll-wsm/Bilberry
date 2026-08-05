<script lang="ts">
  import { renderMarkdown } from "../preview/markdown";
  import { previewThemes } from "../themes/preview-themes";
  import { settingsStore } from "../../stores/settings";
  import { theme } from "../../stores/theme";
  import { t } from "../i18n/i18n.svelte";

  let { content = "", x = 0, y = 0, visible = false, placement = "bottom" }: {
    content?: string;
    x?: number;
    y?: number;
    visible?: boolean;
    placement?: "top" | "bottom";
  } = $props();

  let renderedHtml = $derived(
    renderMarkdown(
      content,
      { properties: t("frontmatter.properties") },
      $settingsStore.frontmatter,
    ).html,
  );

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
      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
        currentDetails = document.createElement("details");
        const level = tag.substring(1);
        currentDetails.setAttribute("data-level", level);
        currentDetails.className = "preview-details";

        const summary = document.createElement("summary");
        summary.innerHTML = child.innerHTML;
        summary.className = "preview-summary";
        summary.setAttribute("data-level", level);

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
  const isDark = $derived(previewThemes.find(t => t.id === previewThemeId)?.mode === "dark" || $theme === "dark");

  let style = $derived(
    placement === "top"
      ? `left: ${x}px; bottom: ${y}px;`
      : `left: ${x}px; top: ${y}px;`
  );
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

  .preview-content :global(details) {
    margin-bottom: 4px;
  }

  .preview-content :global(details[data-level="1"]) { margin-left: 0; }
  .preview-content :global(details[data-level="2"]) { margin-left: 14px; }
  .preview-content :global(details[data-level="3"]) { margin-left: 28px; }
  .preview-content :global(details[data-level="4"]) { margin-left: 42px; }
  .preview-content :global(details[data-level="5"]) { margin-left: 56px; }
  .preview-content :global(details[data-level="6"]) { margin-left: 70px; }

  :global(.preview-summary) {
    cursor: pointer;
    padding: 5px 8px;
    border-radius: 5px;
    list-style: none;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.1s, color 0.1s;
  }

  :global(.preview-summary[data-level="1"]) {
    font-size: 1.25em;
    border-bottom: 1px solid var(--border-divider);
    margin-bottom: 4px;
    color: var(--interactive-accent);
  }

  :global(.preview-summary[data-level="2"]) {
    font-size: 1.1em;
    color: var(--text-normal);
  }

  :global(.preview-summary[data-level="3"]) {
    font-size: 1.0em;
    color: var(--text-normal);
    opacity: 0.9;
  }

  :global(.preview-summary[data-level="4"]),
  :global(.preview-summary[data-level="5"]),
  :global(.preview-summary[data-level="6"]) {
    font-size: 0.95em;
    color: var(--text-muted);
  }

  :global(.preview-summary::-webkit-details-marker) {
    display: none;
  }

  :global(.preview-summary::before) {
    content: "▶";
    font-size: 8px;
    transition: transform 0.2s;
    color: var(--text-muted);
    opacity: 0.7;
  }

  :global(details[open] > .preview-summary::before) {
    transform: rotate(90deg);
  }

  :global(.preview-summary:hover) {
    background: var(--bg-hover);
  }

  :global(details:not(.frontmatter-properties) > *:not(summary)) {
    padding-left: 16px;
    margin-left: 6px;
    border-left: 2px solid var(--border-divider);
    opacity: 0.9;
    margin-top: 4px;
    margin-bottom: 8px;
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
