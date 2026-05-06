import test from "node:test";
import assert from "node:assert/strict";

import { formatMermaidError, renderMarkdown, renderMermaidDocument } from "../src/lib/preview/markdown.ts";

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
