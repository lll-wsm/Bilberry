import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const THEMES_DIR = path.join(__dirname, "..", "src", "lib", "preview", "themes");

interface RawColors {
  textColor: string | null;
  headingColor: string | null;
  linkColor: string | null;
  linkHoverColor: string | null;
  blockquoteBorder: string | null;
  blockquoteBg: string | null;
  tableBorder: string | null;
  tableHeaderBg: string | null;
  tableRowStripe: string | null;
  codeKeyword: string | null;
  codeString: string | null;
  codeNumber: string | null;
  codeComment: string | null;
  codeFunction: string | null;
  codeBuiltin: string | null;
  codeVariable: string | null;
  codeAttr: string | null;
  codeTag: string | null;
}

const LIGHT_DEFAULTS = {
  codeKeyword: "#d73a49",
  codeString: "#032f62",
  codeNumber: "#005cc5",
  codeComment: "#6a737d",
  codeFunction: "#6f42c1",
  codeBuiltin: "#e36209",
  codeVariable: "#24292e",
  codeAttr: "#005cc5",
  codeTag: "#22863a",
};

const DARK_DEFAULTS = {
  codeKeyword: "#c678dd",
  codeString: "#98c379",
  codeNumber: "#d19a66",
  codeComment: "#5c6370",
  codeFunction: "#61afef",
  codeBuiltin: "#e5c07b",
  codeVariable: "#abb2bf",
  codeAttr: "#d19a66",
  codeTag: "#e06c75",
};

function extractColor(css: string, selectorPattern: string, prop: string): string | null {
  // Escape regex special chars in selector pattern
  const escaped = selectorPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match selector followed by `{` (standalone) or by `,` (in a comma list).
  // For comma-list case, scan forward to the opening `{` of that rule.
  const re = new RegExp(escaped + "\\s*([,{])", "i");
  let idx = 0;
  while (idx < css.length) {
    const m = css.slice(idx).match(re);
    if (!m) return null;
    const matchStart = idx + (m.index ?? 0);
    const sepChar = m[1];
    let braceIdx: number;
    if (sepChar === "{") {
      braceIdx = matchStart + m[0].length - 1;
    } else {
      // sepChar === "," -- find next "{" (skipping over any nested parens)
      braceIdx = css.indexOf("{", matchStart + m[0].length);
      if (braceIdx === -1) return null;
    }
    const closeIdx = css.indexOf("}", braceIdx + 1);
    if (closeIdx === -1) return null;
    const block = css.slice(braceIdx + 1, closeIdx);
    const propRe = new RegExp("(?:^|[;{])\\s*" + prop + "\\s*:\\s*([^;]+)", "i");
    const pm = block.match(propRe);
    if (pm) {
      let v = pm[1].trim();
      if (v.includes("}")) v = v.slice(0, v.indexOf("}")).trim();
      return v;
    }
    idx = closeIdx + 1;
  }
  return null;
}

function parseTheme(css: string, filename: string): RawColors {
  const colors: RawColors = {
    textColor: null,
    headingColor: null,
    linkColor: null,
    linkHoverColor: null,
    blockquoteBorder: null,
    blockquoteBg: null,
    tableBorder: null,
    tableHeaderBg: null,
    tableRowStripe: null,
    codeKeyword: null,
    codeString: null,
    codeNumber: null,
    codeComment: null,
    codeFunction: null,
    codeBuiltin: null,
    codeVariable: null,
    codeAttr: null,
    codeTag: null,
  };

  // body color (try body{} then .markdown-body{})
  colors.textColor = extractColor(css, "body", "color") ?? extractColor(css, ".markdown-body", "color");

  // heading color (try .markdown-body h1, then h2, then h1)
  colors.headingColor = extractColor(css, ".markdown-body h1", "color")
    ?? extractColor(css, ".markdown-body h2", "color")
    ?? extractColor(css, "h1", "color")
    ?? extractColor(css, "h2", "color");

  // link color
  colors.linkColor = extractColor(css, ".markdown-body a", "color") ?? extractColor(css, "a", "color");
  colors.linkHoverColor = extractColor(css, ".markdown-body a:hover", "color") ?? extractColor(css, "a:hover", "color");

  // blockquote
  colors.blockquoteBorder = extractColor(css, ".markdown-body blockquote", "border-left")
    ?? extractColor(css, ".markdown-body blockquote", "border-color")
    ?? extractColor(css, "blockquote", "border-left")
    ?? extractColor(css, "blockquote", "border-color");
  colors.blockquoteBg = extractColor(css, ".markdown-body blockquote", "background-color")
    ?? extractColor(css, "blockquote", "background-color");

  // table
  colors.tableBorder = extractColor(css, ".markdown-body table th", "border")
    ?? extractColor(css, ".markdown-body table td", "border")
    ?? extractColor(css, "table th", "border")
    ?? extractColor(css, "table td", "border");
  colors.tableHeaderBg = extractColor(css, ".markdown-body th", "background-color")
    ?? extractColor(css, "th", "background-color");
  colors.tableRowStripe = extractColor(css, ".markdown-body tr:nth-child(2n)", "background-color")
    ?? extractColor(css, "tr:nth-child(2n)", "background-color");

  // Prism token colors (only default.css uses these)
  colors.codeKeyword = extractColor(css, ".token.keyword", "color");
  colors.codeString = extractColor(css, ".token.string", "color") ?? extractColor(css, ".token.char", "color");
  colors.codeNumber = extractColor(css, ".token.number", "color") ?? extractColor(css, ".token.boolean", "color");
  colors.codeComment = extractColor(css, ".token.comment", "color");
  colors.codeFunction = extractColor(css, ".token.function", "color");
  colors.codeBuiltin = extractColor(css, ".token.builtin", "color");
  colors.codeVariable = extractColor(css, ".token.variable", "color");
  colors.codeAttr = extractColor(css, ".token.attr-name", "color");
  colors.codeTag = extractColor(css, ".token.tag", "color");

  return colors;
}

function determineMode(css: string, filename: string): "light" | "dark" {
  const bg = extractColor(css, "body", "background-color") ?? extractColor(css, "html", "background-color");
  if (bg) {
    const hex = bg.replace("#", "");
    if (hex.length === 6 || hex.length === 3) {
      const c = hex.length === 3 ? hex.split("").map(x => x + x).join("") : hex;
      const r = parseInt(c.slice(0, 2), 16);
      const g = parseInt(c.slice(2, 4), 16);
      const b = parseInt(c.slice(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? "light" : "dark";
    }
  }
  // Fallback: known dark theme names
  const darkHints = ["dark", "dracula", "nord", "gotham", "dieci", "cobalt", "lighthouse", "panic", "toothpaste", "charcoal", "ayu-mirage", "solarized-dark", "dark-graphite"];
  return darkHints.some(h => filename.includes(h)) ? "dark" : "light";
}

function makeLabel(id: string): string {
  return id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Extract just the color portion from a border shorthand value like
// "0.25em solid #d0d7de" -> "#d0d7de". Leaves rgba()/rgb()/named colors intact.
function borderColorOnly(value: string): string {
  const hexMatch = value.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hexMatch) return hexMatch[0];
  const rgbaMatch = value.match(/rgba?\([^)]*\)/);
  if (rgbaMatch) return rgbaMatch[0];
  return value;
}

function generateTheme(id: string, css: string): string {
  const mode = determineMode(css, id);
  const raw = parseTheme(css, id);
  const defaults = mode === "dark" ? DARK_DEFAULTS : LIGHT_DEFAULTS;

  const colors = {
    textColor: raw.textColor ?? (mode === "dark" ? "#abb2bf" : "#24292f"),
    headingColor: raw.headingColor ?? (mode === "dark" ? "#e06c75" : "#0969da"),
    linkColor: raw.linkColor ?? (mode === "dark" ? "#61afef" : "#0969da"),
    linkHoverColor: raw.linkHoverColor ?? (mode === "dark" ? "#61afef" : "#0969da"),
    blockquoteBorder: borderColorOnly(raw.blockquoteBorder ?? (mode === "dark" ? "#3c3c3c" : "#d0d7de")),
    blockquoteBg: raw.blockquoteBg ?? "transparent",
    codeKeyword: raw.codeKeyword ?? defaults.codeKeyword,
    codeString: raw.codeString ?? defaults.codeString,
    codeNumber: raw.codeNumber ?? defaults.codeNumber,
    codeComment: raw.codeComment ?? defaults.codeComment,
    codeFunction: raw.codeFunction ?? defaults.codeFunction,
    codeBuiltin: raw.codeBuiltin ?? defaults.codeBuiltin,
    codeVariable: raw.codeVariable ?? defaults.codeVariable,
    codeAttr: raw.codeAttr ?? defaults.codeAttr,
    codeTag: raw.codeTag ?? defaults.codeTag,
    tableBorder: borderColorOnly(raw.tableBorder ?? (mode === "dark" ? "rgba(255,255,255,0.12)" : "#d0d7de")),
    tableHeaderBg: raw.tableHeaderBg ?? (mode === "dark" ? "#1a1a1a" : "#f6f8fa"),
    tableRowStripe: raw.tableRowStripe ?? (mode === "dark" ? "rgba(255,255,255,0.03)" : "#f6f8fa"),
  };

  const label = makeLabel(id);

  return `  {
    id: "${id}",
    label: "${label}",
    mode: "${mode}",
    colors: ${JSON.stringify(colors, null, 6).replace(/\n/g, "\n    ").replace(/"/g, '"')},
  },`;
}

function main() {
  const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith(".css")).sort();
  let output = `import type { PreviewTheme } from "./types";\n\nexport const previewThemes: PreviewTheme[] = [\n`;

  for (const file of files) {
    const id = file.replace(".css", "");
    const css = fs.readFileSync(path.join(THEMES_DIR, file), "utf-8");
    output += generateTheme(id, css) + "\n";
  }

  output += `];\n`;

  const outPath = path.join(__dirname, "..", "src", "lib", "themes", "preview-themes.ts");
  fs.writeFileSync(outPath, output);
  console.log(`Generated ${files.length} themes to ${outPath}`);
}

main();
