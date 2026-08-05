import test from "node:test";
import assert from "node:assert/strict";

import {
  formatMermaidError,
  renderMarkdown,
  renderMermaidDocument,
  splitMarkdownBlocks,
  splitFrontmatter,
  resolveRelativePath,
} from "../src/lib/preview/markdown.ts";

test("extracts mermaid blocks with LF line endings", () => {
  const result = renderMarkdown("```mermaid\ngraph TD\nA-->B\n```");

  assert.equal(result.mermaidBlocks.length, 1);
  assert.equal(result.mermaidBlocks[0], "graph TD\nA-->B");
  assert.match(result.html, /class="mermaid-container"/);
});

test("extracts mermaid blocks with CRLF line endings", () => {
  const result = renderMarkdown("```mermaid\r\ngraph TD\r\nA-->B\r\n```");

  assert.equal(result.mermaidBlocks.length, 1);
  assert.equal(result.mermaidBlocks[0], "graph TD\nA-->B");
  assert.match(result.html, /class="mermaid-container"/);
});

test("extracts mermaid blocks when the info string has trailing spaces", () => {
  const result = renderMarkdown("```mermaid   \ngraph TD\nA-->B\n```");

  assert.equal(result.mermaidBlocks.length, 1);
  assert.equal(result.mermaidBlocks[0], "graph TD\nA-->B");
});

test("extracts a trailing mermaid block even when the closing fence is missing", () => {
  const result = renderMarkdown("before\n\n```mermaid\ngraph TD\nA-->B");

  assert.equal(result.mermaidBlocks.length, 1);
  assert.equal(result.mermaidBlocks[0], "graph TD\nA-->B");
  assert.match(result.html, /class="mermaid-container"/);
});

test("does not extract mermaid blocks nested inside a markdown code fence", () => {
  const result = renderMarkdown(
    [
      "intro",
      "```markdown",
      "# demo",
      "```mermaid",
      "graph TD",
      "A-->B",
      "```",
      "```",
    ].join("\n"),
  );

  assert.equal(result.mermaidBlocks.length, 0);
  assert.doesNotMatch(result.html, /class="mermaid-container"/);
  assert.match(result.html, /language-markdown/);
});

test("renders multiline block math without injecting br tags into the formula", () => {
  const result = renderMarkdown(
    [
      "before",
      "",
      "$$ \\begin{pmatrix}",
      "a_{11} & a_{12} \\\\",
      "a_{21} & a_{22}",
      "\\end{pmatrix} $$",
    ].join("\n"),
  );

  assert.match(result.html, /katex-display/);
  assert.doesNotMatch(result.html, /&lt;br&gt;/);
  assert.doesNotMatch(result.html, /<br>/);
});

test("does not let an unterminated block math swallow following markdown", () => {
  const result = renderMarkdown(
    [
      "bad block:",
      "$$ \\sqrt{x^2 + $ broken",
      "",
      "## Mermaid",
      "",
      "```mermaid",
      "graph TD",
      "A-->B",
      "```",
    ].join("\n"),
  );

  assert.equal(result.mermaidBlocks.length, 1);
  assert.match(result.html, /Mermaid/);
  assert.match(result.html, /class="mermaid-container"/);
});

test("formats mermaid errors as inline preview markup", () => {
  const html = formatMermaidError(new Error('Parse error on line 1: A["x"]'), 'graph TD\nA["x"]');

  assert.match(html, /class="mermaid-error"/);
  assert.match(html, /class="mermaid-error-source"/);
  assert.match(html, /Mermaid source/);
  assert.match(html, /Mermaid syntax error/);
  assert.match(html, /<pre>/);
  assert.match(html, /A\[[\s\S]*&quot;x&quot;[\s\S]*\]/);
  assert.match(html, /graph TD/);
});

test("renders a mermaid file as a single diagram container", () => {
  const result = renderMermaidDocument("graph TD\nA-->B");

  assert.equal(result.mermaidBlocks.length, 1);
  assert.equal(result.mermaidBlocks[0], "graph TD\nA-->B");
  assert.match(result.html, /class="mermaid-container"/);
});

test("splits markdown into blocks with stable line numbers", () => {
  const blocks = splitMarkdownBlocks([
    "# Title",
    "",
    "first line",
    "second line",
    "",
    "- item 1",
    "- item 2",
  ].join("\n"));

  assert.deepEqual(
    blocks.map((block) => [block.type, block.startLine, block.endLine]),
    [
      ["heading", 1, 1],
      ["paragraph", 3, 4],
      ["list", 6, 7],
    ],
  );
});

test("keeps fenced mermaid blocks intact for live editing", () => {
  const blocks = splitMarkdownBlocks([
    "before",
    "",
    "```mermaid",
    "graph TD",
    "A-->B",
    "```",
  ].join("\n"));

  assert.equal(blocks[1].type, "mermaid");
  assert.equal(blocks[1].startLine, 3);
  assert.equal(blocks[1].endLine, 6);
});

test("decodes double-escaped HTML entities in code blocks", () => {
  const result = renderMarkdown(
    [
      "```python",
      "chapters = sorted(Path(&#39;筑仙/正式章节&#39;).glob(&#39;第*章 *.md&#39;), key=lambda s: int(re.search(r&#39;第(\\d+)章&#39;, s.name).group(1)))",
      "```"
    ].join("\n")
  );
  
  assert.match(result.html, /Path\(.*筑仙\/正式章节.*\)/);
  assert.match(result.html, /group\(.*1.*\)/);
  assert.doesNotMatch(result.html, /&amp;#39;/);
});

test("handles dollar signs in code blocks without corruption", () => {
  const result = renderMarkdown(
    [
      "```javascript",
      "const $ = jQuery;",
      "let x = $state(0);",
      "```"
    ].join("\n")
  );
  
  assert.match(result.html, /const.*\$ = jQuery;/);
  assert.match(result.html, /let.*x = \$state\(.*0.*\);/);
});

test("resolves relative paths correctly on Unix and Windows", () => {
  // Unix paths
  assert.equal(
    resolveRelativePath("typescirpt-learn-plan.md", "/Users/lll/Vault/note.md"),
    "/Users/lll/Vault/typescirpt-learn-plan.md"
  );
  assert.equal(
    resolveRelativePath("./typescirpt-learn-plan.md", "/Users/lll/Vault/note.md"),
    "/Users/lll/Vault/typescirpt-learn-plan.md"
  );
  assert.equal(
    resolveRelativePath("../typescirpt-learn-plan.md", "/Users/lll/Vault/note.md"),
    "/Users/lll/typescirpt-learn-plan.md"
  );
  assert.equal(
    resolveRelativePath("typescirpt-learn-plan.md#section?foo=bar", "/Users/lll/Vault/note.md"),
    "/Users/lll/Vault/typescirpt-learn-plan.md"
  );
  
  // Windows paths
  assert.equal(
    resolveRelativePath("typescirpt-learn-plan.md", "C:\\Users\\lll\\Vault\\note.md"),
    "C:\\Users\\lll\\Vault\\typescirpt-learn-plan.md"
  );
  assert.equal(
    resolveRelativePath(".\\typescirpt-learn-plan.md", "C:\\Users\\lll\\Vault\\note.md"),
    "C:\\Users\\lll\\Vault\\typescirpt-learn-plan.md"
  );
  assert.equal(
    resolveRelativePath("..\\typescirpt-learn-plan.md", "C:\\Users\\lll\\Vault\\note.md"),
    "C:\\Users\\lll\\typescirpt-learn-plan.md"
  );
});

// ---------- YAML front matter ----------

test("renders YAML front matter as a properties panel and strips it from the body", () => {
  const src = [
    "---",
    "title: My Note",
    "tags: [obsidian, bilberry]",
    "created: 2026-08-05",
    "---",
    "# Hello",
    "",
    "Body text.",
  ].join("\n");

  const result = renderMarkdown(src);

  assert.match(result.html, /class="frontmatter-properties"/);
  assert.match(result.html, /property-key">title<\/span>/);
  assert.match(result.html, /property-key">tags<\/span>/);
  // tags become clickable chips (hashtag style) with data-tag
  assert.match(result.html, /class="hashtag property-chip"[^>]*data-tag="obsidian"/);
  assert.match(result.html, /#bilberry/);
  // the raw front matter no longer leaks into the body
  assert.doesNotMatch(result.html, />title: My Note</);
  // the panel comes before the rendered body
  assert.ok(result.html.indexOf("frontmatter-properties") < result.html.indexOf(">Hello<"));
  assert.match(result.html, /<h1[^>]*>Hello<\/h1>/);
});

test("renders a single `tags:` value as one chip", () => {
  const result = renderMarkdown("---\ntags: personal\n---\n# T");

  assert.match(result.html, /class="hashtag property-chip"[^>]*data-tag="personal"/);
  assert.match(result.html, /#personal/);
});

test("handles CRLF front matter and a file that is only front matter", () => {
  const result = renderMarkdown("---\r\ntitle: Note\r\n---\r\n");

  assert.match(result.html, /frontmatter-properties/);
  assert.match(result.html, /Note/);
});

test("does not treat a horizontal rule at the start as front matter", () => {
  const result = renderMarkdown("---\n\n# Title");

  assert.doesNotMatch(result.html, /frontmatter-properties/);
  assert.match(result.html, /<hr/);
});

test("does not treat front matter with a missing closing fence as front matter", () => {
  const result = renderMarkdown("---\ntitle: x\nbody text");

  assert.doesNotMatch(result.html, /frontmatter-properties/);
});

test("renders empty front matter as no panel", () => {
  const result = renderMarkdown("---\n---\n# Title");

  assert.doesNotMatch(result.html, /frontmatter-properties/);
  assert.match(result.html, /Title/);
});

test("falls back to a raw YAML block when the front matter is not a mapping", () => {
  const result = renderMarkdown("---\n- just\n- a list\n---\n# Title");

  assert.match(result.html, /frontmatter-properties/);
  assert.match(result.html, /frontmatter-raw/);
  assert.match(result.html, /language-yaml/);
});

test("falls back to a raw YAML block when the front matter cannot be parsed", () => {
  const result = renderMarkdown("---\ntitle: [unclosed\n---\n# Title");

  assert.match(result.html, /frontmatter-raw/);
});

test("renders nested object values as a YAML code block", () => {
  const result = renderMarkdown(
    [
      "---",
      "meta:",
      "  author: me",
      "  draft: true",
      "---",
      "# T",
    ].join("\n"),
  );

  assert.match(result.html, /frontmatter-complex/);
  assert.match(result.html, /author: me/);
});

test("does not process math, wikilinks, or hashtags inside front matter values", () => {
  const result = renderMarkdown(
    [
      "---",
      'cost: "$5"',
      "link: '[[note]]'",
      "tag: '#foo'",
      "---",
      "# T",
    ].join("\n"),
  );

  assert.doesNotMatch(result.html, /katex/);
  assert.match(result.html, /\[\[note\]\]/);
  assert.doesNotMatch(result.html, /class="hashtag"[^>]*data-tag="foo"/);
});

test("splitMarkdownBlocks reports leading front matter as its own block", () => {
  const blocks = splitMarkdownBlocks([
    "---",
    "title: x",
    "tags: [a]",
    "---",
    "",
    "# Title",
  ].join("\n"));

  assert.deepEqual(
    blocks.map((b) => [b.type, b.startLine, b.endLine]),
    [
      ["frontmatter", 1, 4],
      ["heading", 6, 6],
    ],
  );
});

// ---------- Front matter display modes ----------

const FM_SRC = "---\ntitle: Note\ntags: [a, b]\n---\n# Body";

test('"hidden" mode strips front matter without rendering a panel', () => {
  const result = renderMarkdown(FM_SRC, undefined, "hidden");

  assert.doesNotMatch(result.html, /frontmatter-properties/);
  assert.doesNotMatch(result.html, />Note</);
  assert.match(result.html, /<h1[^>]*>Body<\/h1>/);
});

test('"code" mode renders the raw YAML as a code block panel', () => {
  const result = renderMarkdown(FM_SRC, undefined, "code");

  assert.match(result.html, /frontmatter-properties/);
  assert.match(result.html, /frontmatter-raw/);
  assert.match(result.html, /language-yaml/);
  // raw YAML is present, syntax-highlighted by hljs
  assert.match(result.html, /hljs-attr">title:/);
  assert.match(result.html, /hljs-string">Note</);
  assert.doesNotMatch(result.html, /property-row/);
});

test("default mode is properties", () => {
  const result = renderMarkdown(FM_SRC);

  assert.match(result.html, /frontmatter-properties/);
  assert.match(result.html, /property-row/);
});

test("splitFrontmatter splits body and panel per mode", () => {
  const { body, panelHtml } = splitFrontmatter(FM_SRC, "properties");

  assert.equal(body, "# Body");
  assert.match(panelHtml, /frontmatter-properties/);

  const hidden = splitFrontmatter(FM_SRC, "hidden");
  assert.equal(hidden.panelHtml, "");
  assert.equal(hidden.body, "# Body");

  const code = splitFrontmatter(FM_SRC, "code");
  assert.match(code.panelHtml, /frontmatter-raw/);

  // No front matter: body is untouched and panel is empty.
  const plain = splitFrontmatter("just text", "properties");
  assert.equal(plain.body, "just text");
  assert.equal(plain.panelHtml, "");
});


