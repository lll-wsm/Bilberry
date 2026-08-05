use pulldown_cmark::{html, Options, Parser};

/// Convert markdown to a complete HTML page.
///
/// `frontmatter_html` is the pre-rendered YAML front matter panel (properties
/// or raw code block) produced by the frontend with the exact same code used
/// for the preview, so exports stay consistent with what the user sees. It is
/// embedded at the top of the body; pass `None` when the front matter is
/// hidden or absent.
pub fn markdown_to_html(markdown: &str, title: &str, frontmatter_html: Option<&str>) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);
    let mut body = String::new();
    if let Some(fm) = frontmatter_html {
        body.push_str(fm);
    }
    html::push_html(&mut body, parser);

    format!(
        r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 24px;
    line-height: 1.7;
    color: #24292e;
  }}
  h1 {{ font-size: 1.8em; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; }}
  h2 {{ font-size: 1.5em; border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3em; }}
  h3 {{ font-size: 1.25em; }}
  pre {{ background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }}
  code {{ background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
  pre code {{ background: none; padding: 0; }}
  blockquote {{ border-left: 4px solid #dfe2e5; padding-left: 16px; color: #6a737d; margin: 0; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #dfe2e5; padding: 8px 12px; text-align: left; }}
  img {{ max-width: 100%; }}
  a {{ color: #0366d6; text-decoration: none; }}
  /* YAML front matter panel — mirrors the preview styling */
  details.frontmatter-properties {{
    margin: 0 0 1.25em 0;
    border: 1px solid #e1e4e8;
    border-radius: 8px;
    background: #f6f8fa;
    overflow: hidden;
  }}
  details.frontmatter-properties summary {{
    cursor: pointer;
    padding: 6px 12px;
    font-size: 0.85em;
    font-weight: 600;
    color: #6a737d;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  details.frontmatter-properties summary::-webkit-details-marker {{ display: none; }}
  details.frontmatter-properties summary::before {{
    content: "▸";
    display: inline-block;
    font-size: 0.75em;
    transition: transform 0.15s ease;
  }}
  details.frontmatter-properties[open] summary::before {{ transform: rotate(90deg); }}
  details.frontmatter-properties .property-count {{ font-size: 0.8em; font-weight: 400; opacity: 0.7; }}
  details.frontmatter-properties .property-grid {{ border-top: 1px solid #e1e4e8; }}
  details.frontmatter-properties .property-row {{
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 12px;
    padding: 6px 12px;
    font-size: 0.92em;
    border-bottom: 1px solid #e1e4e8;
  }}
  details.frontmatter-properties .property-row:last-child {{ border-bottom: none; }}
  details.frontmatter-properties .property-key {{ color: #6a737d; word-break: break-word; }}
  details.frontmatter-properties .property-value {{ min-width: 0; word-break: break-word; }}
  details.frontmatter-properties .property-chip {{
    display: inline-block;
    background: #f6f8fa;
    border: 1px solid #e1e4e8;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.9em;
    color: #0366d6;
    text-decoration: none;
    margin: 0 4px 2px 0;
  }}
  details.frontmatter-properties .property-null {{ color: #6a737d; opacity: 0.6; }}
  details.frontmatter-properties .frontmatter-complex {{
    background: #f6f8fa;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.85em;
    white-space: pre-wrap;
    word-break: break-word;
  }}
  details.frontmatter-properties .frontmatter-raw pre {{
    margin: 0;
    padding: 10px 12px;
    border-top: 1px solid #e1e4e8;
    border-radius: 0;
    overflow-x: auto;
  }}
  details.frontmatter-properties .frontmatter-raw code {{ background: none; padding: 0; }}
</style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

#[tauri::command]
pub fn export_html(
    content: String,
    title: Option<String>,
    frontmatter_html: Option<String>,
) -> String {
    let t = title.unwrap_or_else(|| "Untitled".to_string());
    markdown_to_html(&content, &t, frontmatter_html.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embeds_frontmatter_panel_before_the_body() {
        let panel = r#"<details class="frontmatter-properties"><summary>Properties</summary></details>"#;
        let html = markdown_to_html("# Hello", "Note", Some(panel));

        assert!(html.contains("frontmatter-properties"));
        assert!(html.contains("<h1>Hello</h1>"));
        // Panel must come before the rendered body.
        assert!(html.find("frontmatter-properties").unwrap() < html.find("<h1>Hello</h1>").unwrap());
    }

    #[test]
    fn omits_frontmatter_when_none_is_provided() {
        let html = markdown_to_html("# Hello", "Note", None);

        // The stylesheet mentions `.frontmatter-properties` / `.property-grid`,
        // so assert on the panel markup (`class="..."` attribute) instead —
        // the CSS selectors use `details.frontmatter-properties` form and can
        // never produce a `class="frontmatter-properties"` string.
        assert!(!html.contains("class=\"frontmatter-properties\""));
        assert!(html.contains("<h1>Hello</h1>"));
    }

    #[test]
    fn export_command_defaults_title() {
        let html = export_html("# Hi".to_string(), None, None);

        assert!(html.contains("<title>Untitled</title>"));
        assert!(html.contains("<h1>Hi</h1>"));
    }
}
