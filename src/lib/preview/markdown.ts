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

export interface MarkdownBlock {
  type: "heading" | "paragraph" | "list" | "blockquote" | "code" | "mermaid" | "image" | "table" | "other";
  source: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

function looksLikeHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s/.test(line);
}

function looksLikeFence(line: string): boolean {
  return /^\s*```/.test(line);
}

function looksLikeBlockquote(line: string): boolean {
  return /^\s*>/.test(line);
}

function looksLikeList(line: string): boolean {
  return /^\s*(?:[-+*]|\d+\.)\s+/.test(line);
}

function looksLikeIndentedContinuation(line: string): boolean {
  return /^\s{2,}\S/.test(line);
}

function looksLikeTable(line: string): boolean {
  return /\|/.test(line);
}

function looksLikeStandaloneImage(line: string): boolean {
  return /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line.trim());
}

function isBlockStarter(line: string): boolean {
  return looksLikeHeading(line)
    || looksLikeFence(line)
    || looksLikeBlockquote(line)
    || looksLikeList(line)
    || looksLikeStandaloneImage(line);
}

export function splitMarkdownBlocks(src: string): MarkdownBlock[] {
  const normalized = src.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const blocks: MarkdownBlock[] = [];
  let i = 0;

  function pushBlock(type: MarkdownBlock["type"], start: number, end: number) {
    const startOffset = lineOffsets[start];
    const endOffset = end + 1 < lineOffsets.length ? lineOffsets[end + 1] - 1 : normalized.length;
    blocks.push({
      type,
      source: normalized.slice(startOffset, endOffset),
      startLine: start + 1,
      endLine: end + 1,
      startOffset,
      endOffset,
    });
  }

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    const line = lines[i];

    if (looksLikeFence(line)) {
      const fenceLang = line.match(/^\s*```([^\s`]*)/)?.[1]?.toLowerCase() ?? "";
      const start = i;
      i++;
      while (i < lines.length && !looksLikeFence(lines[i])) i++;
      if (i < lines.length) i++;
      pushBlock(fenceLang === "mermaid" ? "mermaid" : "code", start, i - 1);
      continue;
    }

    if (looksLikeHeading(line)) {
      pushBlock("heading", i, i);
      i++;
      continue;
    }

    if (looksLikeStandaloneImage(line)) {
      pushBlock("image", i, i);
      i++;
      continue;
    }

    if (looksLikeBlockquote(line)) {
      const start = i;
      i++;
      while (i < lines.length && (looksLikeBlockquote(lines[i]) || !lines[i].trim())) i++;
      pushBlock("blockquote", start, i - 1);
      continue;
    }

    if (looksLikeList(line)) {
      const start = i;
      i++;
      while (
        i < lines.length
        && (looksLikeList(lines[i]) || looksLikeIndentedContinuation(lines[i]) || !lines[i].trim())
      ) {
        i++;
      }
      pushBlock("list", start, i - 1);
      continue;
    }

    if (
      looksLikeTable(line)
      && i + 1 < lines.length
      && /^\s*\|?[-: ]+\|[-|: ]*$/.test(lines[i + 1])
    ) {
      const start = i;
      i += 2;
      while (i < lines.length && lines[i].trim() && looksLikeTable(lines[i])) i++;
      pushBlock("table", start, i - 1);
      continue;
    }

    const start = i;
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i])) i++;
    pushBlock("paragraph", start, i - 1);
  }

  return blocks;
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
      const mathHtml = katex.renderToString(blockMaths[i], {
        displayMode: true,
        throwOnError: false,
      });
      result = result.replace(placeholder, () => mathHtml);
    } catch {
      const errHtml = `<span class="katex-error">${blockMaths[i]}</span>`;
      result = result.replace(placeholder, () => errHtml);
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

function renderWikiLinks(html: string): string {
  // Matches [[filename]] or [[filename|alias]]
  return html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias: string | null) => {
    const text = alias || target;
    return `<a class="wikilink" href="javascript:void(0)" data-target="${target.trim()}">${text.trim()}</a>`;
  });
}

function renderHashtags(html: string): string {
  // 1. Match HTML tags (like <a>...</a> or <img>) to skip them.
  // 2. Match HTML entities (like &#39; or &amp;) to avoid matching their '#' as a hashtag.
  // 3. Use a lookbehind and lookahead to match #tag only as a whole word.
  const regex = /(<a\b[^>]*>[\s\S]*?<\/a>)|(<[^>]+>)|(&#[0-9]+;)|(&#[xX][0-9a-fA-F]+;)|(&[a-zA-Z0-9]+;)|(?<=[^a-zA-Z0-9_\u4e00-\u9fa5]|^)#([a-zA-Z0-9_\u4e00-\u9fa5]{1,30})(?![a-zA-Z0-9_\u4e00-\u9fa5])/g;
  
  return html.replace(regex, (match, anchor, tag, numEntity, hexEntity, namedEntity, hash) => {
    // If we matched an HTML tag, anchor, or HTML entity, return it unchanged.
    if (anchor || tag || numEntity || hexEntity || namedEntity) return match;
    
    // Skip if it looks like a hex color (3 or 6 hex digits)
    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hash)) return match;
    
    return `<a class="hashtag" href="javascript:void(0)" data-tag="${hash}">#${hash}</a>`;
  });
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

  // Extract <pre> and <code> blocks to placeholders so that math, wiki-links, and hashtags
  // are never processed inside literal code.
  const codeBlocks: string[] = [];
  const placeholderPrefix = "\x00CODE_BLOCK_";
  const codeRegex = /(<pre[\s\S]*?<\/pre>)|(<code[\s\S]*?<\/code>)/g;
  
  const htmlWithPlaceholders = rawHtml.replace(codeRegex, (match) => {
    const placeholder = `${placeholderPrefix}${codeBlocks.length}\x00`;
    codeBlocks.push(match);
    return placeholder;
  });

  // Render KaTeX
  const withMath = renderMath(htmlWithPlaceholders, blockMaths);

  // Render WikiLinks
  const withWiki = renderWikiLinks(withMath);

  // Render Hashtags
  const withTags = renderHashtags(withWiki);

  // Restore code blocks
  let finalHtml = withTags;
  for (let i = 0; i < codeBlocks.length; i++) {
    const placeholder = `${placeholderPrefix}${i}\x00`;
    // Decode double-escaped HTML entities in code blocks to show normal characters (like ', ", &, <, >)
    const decodedCodeBlock = codeBlocks[i].replace(
      /&amp;((?:#[0-9]+|#[xX][0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);)/g,
      '&$1'
    );
    finalHtml = finalHtml.replace(placeholder, () => decodedCodeBlock);
  }

  // Restore escaped dollar signs
  finalHtml = finalHtml.replace(new RegExp(DOLLAR_PLACEHOLDER, "g"), () => "$");

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
