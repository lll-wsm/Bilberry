use pulldown_cmark::{html, Options, Parser};

/// Convert markdown to a complete HTML page
pub fn markdown_to_html(markdown: &str, title: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);
    let mut body = String::new();
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
</style>
</head>
<body>
{body}
</body>
</html>"#
    )
}

#[tauri::command]
pub fn export_html(content: String, title: Option<String>) -> String {
    let t = title.unwrap_or_else(|| "Untitled".to_string());
    markdown_to_html(&content, &t)
}
