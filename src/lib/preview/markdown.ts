import { marked } from "marked";
import katex from "katex";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Pre-process markdown source:
 * - Extract mermaid code blocks for post-processing
 * - Process math blocks ($$...$$ and $...$)
 */
function preprocessMarkdown(src: string): { html: string; mermaidBlocks: string[] } {
  const mermaidBlocks: string[] = [];
  let blockIndex = 0;

  // Extract mermaid code blocks
  const withPlaceholders = src.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_match, code: string) => {
      const id = `mermaid-${blockIndex}`;
      mermaidBlocks.push(code.trim());
      blockIndex++;
      return `<div class="mermaid-container" id="${id}"></div>`;
    },
  );

  return { html: withPlaceholders, mermaidBlocks };
}

function renderMath(html: string): string {
  // Render display math $$...$$
  let result = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">${tex}</span>`;
    }
  });

  // Render inline math $...$
  result = result.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_match, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">${tex}</span>`;
    }
  });

  return result;
}

export interface RenderResult {
  html: string;
  mermaidBlocks: string[];
}

export function renderMarkdown(src: string): RenderResult {
  const { html: preprocessed, mermaidBlocks } = preprocessMarkdown(src);

  // Parse markdown
  const rawHtml = marked.parse(preprocessed) as string;

  // Render KaTeX
  const withMath = renderMath(rawHtml);

  return {
    html: withMath,
    mermaidBlocks,
  };
}
