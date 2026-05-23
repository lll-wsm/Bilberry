import test from "node:test";
import assert from "node:assert/strict";

import {
  formatMermaidError,
  renderMarkdown,
  renderMermaidDocument,
  splitMarkdownBlocks,
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
  assert.match(html, /Mermaid 源码/);
  assert.match(html, /Mermaid 语法错误/);
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


