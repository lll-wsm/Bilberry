import { marked } from "marked";
import katex from "katex";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

const DOLLAR_PLACEHOLDER = "\x00DOLLAR\x00";
const BLOCK_MATH_PLACEHOLDER_PREFIX = "\x00BLOCK_MATH_";

interface PreprocessResult {
  html: string;
  mermaidBlocks: string[];
  blockMaths: string[];
}

/**
 * Pre-process markdown source:
 * - Escape \$ so they survive math processing
 * - Extract mermaid code blocks for post-processing
 */
function preprocessMarkdown(src: string): PreprocessResult {
  // Escape \$ → placeholder so $ is not treated as math delimiter
  const escaped = src.replace(/\\\$/g, DOLLAR_PLACEHOLDER);

  const mermaidBlocks: string[] = [];
  const blockMaths: string[] = [];
  const lines = escaped.split(/\r?\n/);
  const output: string[] = [];

  let blockIndex = 0;
  let activeFenceLang: string | null = null;
  let mermaidBuffer: string[] = [];
  let activeBlockMath = false;
  let blockMathBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*```([^\s`]*)[^\S\r\n]*$/);

    if (activeBlockMath) {
      const closeIdx = line.indexOf("$$");
      if (closeIdx >= 0) {
        blockMathBuffer.push(line.slice(0, closeIdx));
        output.push(`${BLOCK_MATH_PLACEHOLDER_PREFIX}${blockMaths.length}\x00`);
        blockMaths.push(blockMathBuffer.join("\n").trim());
        activeBlockMath = false;
        blockMathBuffer = [];

        const trailing = line.slice(closeIdx + 2);
        if (trailing.trim()) output.push(trailing);
      } else {
        blockMathBuffer.push(line);
      }
      continue;
    }

    if (activeFenceLang === "mermaid") {
      if (fenceMatch) {
        const id = `mermaid-${blockIndex}`;
        mermaidBlocks.push(mermaidBuffer.join("\n").trim());
        output.push(`<div class="mermaid-container" id="${id}"></div>`);
        blockIndex++;
        activeFenceLang = null;
        mermaidBuffer = [];
      } else {
        mermaidBuffer.push(line);
      }
      continue;
    }

    if (activeFenceLang) {
      output.push(line);
      if (fenceMatch) activeFenceLang = null;
      continue;
    }

    if (fenceMatch?.[1] === "mermaid") {
      activeFenceLang = "mermaid";
      mermaidBuffer = [];
      continue;
    }

    const blockMathStart = line.indexOf("$$");
    if (blockMathStart >= 0) {
      const before = line.slice(0, blockMathStart);
      const afterStart = line.slice(blockMathStart + 2);
      const blockMathEnd = afterStart.indexOf("$$");

      if (before.trim()) output.push(before);

      if (blockMathEnd >= 0) {
        output.push(`${BLOCK_MATH_PLACEHOLDER_PREFIX}${blockMaths.length}\x00`);
        blockMaths.push(afterStart.slice(0, blockMathEnd).trim());

        const trailing = afterStart.slice(blockMathEnd + 2);
        if (trailing.trim()) output.push(trailing);
      } else {
        const hasClosingAhead = lines.slice(i + 1).some((nextLine) => nextLine.includes("$$"));
        if (hasClosingAhead) {
          activeBlockMath = true;
          blockMathBuffer = [afterStart];
        } else {
          output.push(line);
        }
      }
      continue;
    }

    if (fenceMatch) {
      activeFenceLang = fenceMatch[1] || "";
    }

    output.push(line);
  }

  if (activeFenceLang === "mermaid") {
    const id = `mermaid-${blockIndex}`;
    mermaidBlocks.push(mermaidBuffer.join("\n").trim());
    output.push(`<div class="mermaid-container" id="${id}"></div>`);
  }

  if (activeBlockMath) output.push(`$$${blockMathBuffer.join("\n")}`);

  return { html: output.join("\n"), mermaidBlocks, blockMaths };
}

function renderMath(html: string, blockMaths: string[]): string {
  let result = html;

  for (let i = 0; i < blockMaths.length; i++) {
    const placeholder = `${BLOCK_MATH_PLACEHOLDER_PREFIX}${i}\x00`;
    try {
      result = result.replace(
        placeholder,
        katex.renderToString(blockMaths[i], {
          displayMode: true,
          throwOnError: false,
        }),
      );
    } catch {
      result = result.replace(
        placeholder,
        `<span class="katex-error">${blockMaths[i]}</span>`,
      );
    }
  }

  // Block math $$...$$ (process first so $$ aren't caught by inline rule)
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">${tex}</span>`;
    }
  });

  // Inline math $...$ — content must start with something that looks like math
  // (not a digit) to avoid matching prices like $5, $100, $5.99, etc.
  result = result.replace(
    /(?<!\$)\$(?!\d)([^$\n]{1,200}?)\$(?!\$)/g,
    (_match, tex) => {
      try {
        return katex.renderToString(tex.trim(), {
          displayMode: false,
          throwOnError: false,
        });
      } catch {
        return `<span class="katex-error">${tex}</span>`;
      }
    },
  );

  return result;
}

export interface RenderResult {
  html: string;
  mermaidBlocks: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatMermaidError(error: unknown, source?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const sourceBlock = source
    ? `<div class="mermaid-error-source"><strong>Mermaid 源码</strong><pre>${escapeHtml(source)}</pre></div>`
    : "";
  return `<div class="mermaid-error">${sourceBlock}<strong>Mermaid 语法错误</strong><pre>${escapeHtml(message)}</pre></div>`;
}

/**
 * Render mermaid diagrams to SVG using the mermaid.render() API.
 * This is called from Preview.svelte after the component mounts (browser only).
 */
export async function renderMermaidBlocks(
  blocks: string[],
  isDark: boolean,
): Promise<string[]> {
  const mermaid = await import("mermaid");
  mermaid.default.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: isDark ? "dark" : "default",
    securityLevel: "loose",
  });

  const svgs: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    try {
      const parseResult = await mermaid.default.parse(blocks[i], { suppressErrors: true });
      if (parseResult === false) {
        svgs.push(formatMermaidError("未知 Mermaid 语法错误", blocks[i]));
        continue;
      }
      const { svg } = await mermaid.default.render(
        `mermaid-svg-${i}-${Date.now()}`,
        blocks[i],
      );
      svgs.push(svg);
    } catch (e: any) {
      console.error(`Mermaid render error (block ${i}):`, e);
      svgs.push(formatMermaidError(e, blocks[i]));
    }
  }
  return svgs;
}

export function renderMarkdown(src: string): RenderResult {
  const { html: preprocessed, mermaidBlocks, blockMaths } = preprocessMarkdown(src);

  // Parse markdown
  const rawHtml = marked.parse(preprocessed) as string;

  // Render KaTeX
  const withMath = renderMath(rawHtml, blockMaths);

  // Restore escaped dollar signs
  const finalHtml = withMath.replace(new RegExp(DOLLAR_PLACEHOLDER, "g"), "$");

  return {
    html: finalHtml,
    mermaidBlocks,
  };
}

export function renderMermaidDocument(src: string): RenderResult {
  return {
    html: `<div class="mermaid-container" id="mermaid-0"></div>`,
    mermaidBlocks: [src.trim()],
  };
}
