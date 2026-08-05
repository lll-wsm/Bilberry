import { marked } from "marked";
import katex from "katex";
import hljs from "highlight.js";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x22;/g, '"')
    .replace(/&amp;/g, "&");
}

const renderer = {
  code(token: any) {
    const text = decodeHtmlEntities(token.text);
    const lang = (token.lang || "").match(/^\S*/)?.[0] || "";
    let highlighted: string;

    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(text, { language: lang }).value;
      } catch {
        highlighted = escapeHtml(text);
      }
    } else {
      try {
        highlighted = hljs.highlightAuto(text).value;
      } catch {
        highlighted = escapeHtml(text);
      }
    }

    const classAttr = lang ? ` class="language-${lang} hljs"` : ' class="hljs"';
    return `<pre><code${classAttr}>${highlighted}</code></pre>`;
  },
  codespan(token: any) {
    const text = decodeHtmlEntities(token.text);
    return `<code>${escapeHtml(text)}</code>`;
  },
  blockquote(this: any, token: any) {
    const body = this.parser.parse(token.tokens);
    const match = body.match(/^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?\s*/i);
    if (match) {
      const type = match[1].toUpperCase();
      let cleanContent = body.slice(match[0].length);
      if (/^\s*<\/p>/.test(cleanContent)) {
        cleanContent = cleanContent.replace(/^\s*<\/p>/, "");
      } else {
        cleanContent = "<p>" + cleanContent;
      }

      const icons: Record<string, string> = {
        NOTE: `<svg class="octicon octicon-info" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-3a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1.5 7h-3a.5.5 0 0 1 0-1H7V7H6a.5.5 0 0 1 0-1h1.5a.5.5 0 0 1 .5.5v4h1a.5.5 0 0 1 0 1Z"></path></svg>`,
        TIP: `<svg class="octicon octicon-light-bulb" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.876-4 4 0 .758.208 1.525.614 2.217.363.621.554 1.311.554 2.01v.058c0 .59.375 1.08.9 1.258V13.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5v-1.72c.525-.178.9-.668.9-1.258v-.058c0-.7-.19-1.39-.554-2.01A4.213 4.213 0 0 0 12 5.5c0-2.124-1.637-4-4-4ZM6 11h4v1.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V11Zm1.5 3h1a.5.5 0 0 1 0 1h-1a.5.5 0 0 1 0-1Z"></path></svg>`,
        IMPORTANT: `<svg class="octicon octicon-report" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.543c0 .242.293.363.464.192L8.03 12.53a.75.75 0 0 1 .53-.22h5.69a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Z"></path><path d="M7.75 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 7.75 3Zm0 6a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"></path></svg>`,
        WARNING: `<svg class="octicon octicon-alert" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6.457 1.047c.659-1.048 2.187-1.048 2.846 0l5.81 9.25c.685 1.09-.094 2.513-1.422 2.513H1.722c-1.328 0-2.107-1.423-1.422-2.513Zm8.603 2.21a.75.75 0 0 0-1.206 0L1.588 11.46c-.152.243-.017.561.27.561h11.908c.287 0 .422-.318.27-.562Zm-.853 4.29a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Zm0 4a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"></path></svg>`,
        CAUTION: `<svg class="octicon octicon-stop" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4.47.22A.75.75 0 0 1 5 0h6a.75.75 0 0 1 .53.22l4.25 4.25c.141.14.22.33.22.53v6a.75.75 0 0 1-.22.53l-4.25 4.25A.75.75 0 0 1 11 16H5a.75.75 0 0 1-.53-.22L.22 11.53A.75.75 0 0 1 0 11V5a.75.75 0 0 1 .22-.53L4.47.22Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5H5.31Z"></path><path d="M8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 6a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"></path></svg>`
      };

      const titles: Record<string, string> = {
        NOTE: "Note",
        TIP: "Tip",
        IMPORTANT: "Important",
        WARNING: "Warning",
        CAUTION: "Caution"
      };

      const icon = icons[type];
      const title = titles[type];

      return `<div class="markdown-alert markdown-alert-${type.toLowerCase()}">
  <div class="markdown-alert-title">${icon}${title}</div>
  <div class="markdown-alert-content">${cleanContent}</div>
</div>`;
    }
    return `<blockquote>\n${body}</blockquote>\n`;
  }
};

marked.use({ renderer });


const DOLLAR_PLACEHOLDER = "\x00DOLLAR\x00";
const BLOCK_MATH_PLACEHOLDER_PREFIX = "\x00BLOCK_MATH_";

interface PreprocessResult {
  html: string;
  mermaidBlocks: string[];
  blockMaths: string[];
}

export interface MarkdownBlock {
  type: "heading" | "paragraph" | "list" | "blockquote" | "code" | "mermaid" | "image" | "table" | "other" | "frontmatter";
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

/**
 * Split markdown source into typed blocks with stable line/offset ranges.
 *
 * Currently used only by tests, but intended for future live-mode block-level
 * scroll synchronisation between editor and preview (finer-grained than the
 * current whole-document ratio sync). Kept and tested because it is pure,
 * working, and represents intended functionality — do not remove without
 * confirming live sync is off the roadmap.
 */
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

  // A leading YAML front matter block (if present) is reported as a single
  // "frontmatter" block so editor ↔ preview scroll sync stays aligned after
  // the preview strips it from the body.
  const frontmatterMatch = normalized.match(FRONTMATTER_RE);
  const frontmatterEndLine = frontmatterMatch
    ? frontmatterMatch[0].split("\n").length - (frontmatterMatch[0].endsWith("\n") ? 1 : 0) - 1
    : null;

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
    if (frontmatterEndLine !== null && i <= frontmatterEndLine) {
      pushBlock("frontmatter", i, frontmatterEndLine);
      i = frontmatterEndLine + 1;
      continue;
    }

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

  // Restore extracted $$...$$ blocks (single pass — placeholder order matches
  // the array, so one regex replace avoids an O(n²) per-block scan).
  result = result.replace(
    new RegExp(`${BLOCK_MATH_PLACEHOLDER_PREFIX}(\\d+)\\x00`, "g"),
    (_match, indexStr: string) => {
      const i = Number(indexStr);
      try {
        return katex.renderToString(blockMaths[i], {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        return `<span class="katex-error">${blockMaths[i]}</span>`;
      }
    },
  );

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

export interface MermaidLabels {
  source: string;
  syntaxError: string;
  unknownSyntaxError: string;
}

/** Default (English) mermaid error labels — used outside the UI (e.g. tests). */
export const DEFAULT_MERMAID_LABELS: MermaidLabels = {
  source: "Mermaid source",
  syntaxError: "Mermaid syntax error",
  unknownSyntaxError: "Unknown Mermaid syntax error",
};

export function formatMermaidError(
  error: unknown,
  source?: string,
  labels: MermaidLabels = DEFAULT_MERMAID_LABELS,
): string {
  const message = error instanceof Error ? error.message : String(error);
  const sourceBlock = source
    ? `<div class="mermaid-error-source"><strong>${labels.source}</strong><pre>${escapeHtml(source)}</pre></div>`
    : "";
  return `<div class="mermaid-error">${sourceBlock}<strong>${labels.syntaxError}</strong><pre>${escapeHtml(message)}</pre></div>`;
}

/**
 * Render mermaid diagrams to SVG using the mermaid.render() API.
 * This is called from Preview.svelte after the component mounts (browser only).
 */
export async function renderMermaidBlocks(
  blocks: string[],
  isDark: boolean,
  labels: MermaidLabels = DEFAULT_MERMAID_LABELS,
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
        svgs.push(formatMermaidError(labels.unknownSyntaxError, blocks[i], labels));
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

// ---------- YAML front matter ----------

export interface FrontmatterLabels {
  /** Heading of the collapsible properties panel. */
  properties: string;
}

/** Default (English) front matter labels — used outside the UI (e.g. tests). */
export const DEFAULT_FRONTMATTER_LABELS: FrontmatterLabels = {
  properties: "Properties",
};

/** How YAML front matter is presented in the rendered output. */
export type FrontmatterMode = "hidden" | "properties" | "code";

export interface FrontmatterSplit {
  /** Source with the front matter block removed. */
  body: string;
  /** Rendered `<details>` panel (properties or raw code), or "" when hidden/absent. */
  panelHtml: string;
}

/**
 * A YAML front matter block is only recognized when it is the very first thing
 * in the file (after an optional BOM): an opening `---` fence, content, and a
 * closing `---` fence on its own line. A `---` anywhere else in the document is
 * a thematic break (hr) and is never touched.
 */
const FRONTMATTER_RE = /^[\uFEFF]?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function extractFrontmatter(
  src: string,
  labels: FrontmatterLabels,
  mode: FrontmatterMode,
): FrontmatterSplit {
  const match = FRONTMATTER_RE.exec(src);
  if (!match) return { body: src, panelHtml: "" };

  const raw = match[1];
  const body = src.slice(match[0].length);
  if (!raw.trim()) return { body, panelHtml: "" };

  let panelHtml = "";
  if (mode === "properties") {
    panelHtml = renderFrontmatterPanel(raw, labels);
  } else if (mode === "code") {
    panelHtml = renderFrontmatterCodeBlock(raw, labels);
  }
  return { body, panelHtml };
}

/**
 * Split a markdown source into its body and the rendered front matter panel.
 * Shared by the preview and the HTML export so both surfaces stay consistent.
 */
export function splitFrontmatter(
  src: string,
  mode: FrontmatterMode = "properties",
  labels: FrontmatterLabels = DEFAULT_FRONTMATTER_LABELS,
): FrontmatterSplit {
  return extractFrontmatter(src, labels, mode);
}

/** A collapsible panel showing the raw YAML as a syntax-highlighted code block. */
function renderFrontmatterCodeBlock(raw: string, labels: FrontmatterLabels): string {
  return `<details class="frontmatter-properties" open><summary>${escapeHtml(labels.properties)}</summary><div class="frontmatter-raw"><pre><code class="language-yaml hljs">${highlightYaml(raw)}</code></pre></div></details>`;
}

function renderFrontmatterPanel(raw: string, labels: FrontmatterLabels): string {
  let data: unknown;
  try {
    data = yamlLoad(raw);
  } catch {
    data = null;
  }

  const rows = frontmatterRows(data);
  if (rows === null) {
    // Unparseable YAML, or the document is not a mapping: keep the raw block
    // visible as a syntax-highlighted YAML code block instead of dropping it.
    return renderFrontmatterCodeBlock(raw, labels);
  }
  if (rows.length === 0) return ""; // empty mapping — nothing worth showing

  const rowsHtml = rows
    .map(
      ([key, valueHtml]) =>
        `<div class="property-row"><span class="property-key">${escapeHtml(key)}</span><span class="property-value">${valueHtml}</span></div>`,
    )
    .join("");

  return `<details class="frontmatter-properties" open><summary>${escapeHtml(labels.properties)}<span class="property-count">${rows.length}</span></summary><div class="property-grid">${rowsHtml}</div></details>`;
}

/**
 * Turn parsed YAML into [key, valueHtml] rows. Returns null when the YAML
 * cannot be rendered as a property list (parse error, or the document is not a
 * mapping); the caller then falls back to showing the raw block.
 */
function frontmatterRows(data: unknown): [string, string][] | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  return entries.map(([key, value]) => [key, renderFrontmatterValue(value, key)]);
}

function renderFrontmatterValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return `<span class="property-null">—</span>`;

  if (typeof value === "string") {
    // A single `tags: foo` is treated as one tag chip, like Obsidian.
    if (key?.toLowerCase() === "tags" && value.trim()) {
      const text = escapeHtml(value.trim());
      return `<a class="hashtag property-chip" href="javascript:void(0)" data-tag="${text}">#${text}</a>`;
    }
    return escapeHtml(value);
  }

  if (typeof value === "number" || typeof value === "boolean") return escapeHtml(String(value));
  if (value instanceof Date) return escapeHtml(value.toISOString());

  if (Array.isArray(value)) {
    // Arrays of plain scalars render as clickable chips (like Obsidian).
    if (value.length > 0 && value.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      return value
        .map((v) => {
          const text = escapeHtml(String(v));
          return `<a class="hashtag property-chip" href="javascript:void(0)" data-tag="${text}">#${text}</a>`;
        })
        .join(" ");
    }
    if (value.length === 0) return `<span class="property-null">—</span>`;
  }

  // Nested objects / arrays of objects: re-serialize as YAML in a code block.
  try {
    return `<code class="frontmatter-complex">${escapeHtml(yamlDump(value).trimEnd())}</code>`;
  } catch {
    return `<code class="frontmatter-complex">${escapeHtml(JSON.stringify(value))}</code>`;
  }
}

function highlightYaml(raw: string): string {
  try {
    return hljs.highlight(raw, { language: "yaml" }).value;
  } catch {
    return escapeHtml(raw);
  }
}

export function renderMarkdown(
  src: string,
  labels: FrontmatterLabels = DEFAULT_FRONTMATTER_LABELS,
  mode: FrontmatterMode = "properties",
): RenderResult {
  const { body, panelHtml } = extractFrontmatter(src, labels, mode);

  const { html: preprocessed, mermaidBlocks, blockMaths } = preprocessMarkdown(body);

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

  // Restore code blocks — single pass over the whole string. The placeholders
  // appear in order, so one global regex replace replaces every block without
  // the O(n²) cost of a per-block `String.replace` (which rescans from the
  // start on a multi-megabyte string — the dominant cost for large files).
  const finalHtml = withTags.replace(
    new RegExp(`${placeholderPrefix}(\\d+)\\x00`, "g"),
    (_match, indexStr: string) => {
      // Decode double-escaped HTML entities in code blocks to show normal characters (like ', ", &, <, >)
      const decodedCodeBlock = codeBlocks[Number(indexStr)].replace(
        /&amp;((?:#[0-9]+|#[xX][0-9a-fA-F]+|amp|lt|gt|quot|apos|nbsp);)/g,
        '&$1'
      );
      return decodedCodeBlock;
    },
  );

  // Restore escaped dollar signs
  const restoredHtml = finalHtml.replace(new RegExp(DOLLAR_PLACEHOLDER, "g"), () => "$");

  // The properties panel is prepended after all transforms so front matter
  // values can never be misinterpreted as math, wiki-links, or hashtags.
  return {
    html: panelHtml + restoredHtml,
    mermaidBlocks,
  };
}

export function renderMermaidDocument(src: string): RenderResult {
  return {
    html: `<div class="mermaid-container" id="mermaid-0"></div>`,
    mermaidBlocks: [src.trim()],
  };
}

export function resolveRelativePath(href: string, currentFilePath: string): string {
  // Determine separator (fallback to '/')
  const isWindows = currentFilePath.includes("\\");
  const sep = isWindows ? "\\" : "/";
  
  // Normalize href to use the same separator
  const normalizedHref = href.replace(/[/\\]/g, sep);
  
  // Strip hash and query parameters
  const cleanHref = normalizedHref.split("#")[0].split("?")[0];
  
  // Check if absolute path
  // On Windows, absolute path starts with a drive letter (e.g., C:\)
  // On Unix, absolute path starts with /
  const isAbsolute = isWindows 
    ? /^[a-zA-Z]:\\/.test(cleanHref)
    : cleanHref.startsWith("/");
    
  if (isAbsolute) {
    return cleanHref;
  }
  
  const parts = currentFilePath.split(sep);
  parts.pop(); // Remove note filename to get parent directory path
  
  const hrefParts = cleanHref.split(sep);
  for (const part of hrefParts) {
    if (part === "." || part === "") {
      continue;
    } else if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join(sep);
}
