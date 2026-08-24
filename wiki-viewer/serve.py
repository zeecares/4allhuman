#!/usr/bin/env python3
"""
Local OpenWiki viewer — zero external dependencies, no downloads.

Serves the openwiki/ folder over http://localhost:8137 with:
  * a sidebar table-of-contents (auto-built from the .md tree)
  * a minimal pure-stdlib Markdown renderer (headings, tables, code/mermaid,
    lists, blockquotes, inline code/bold/italic/links)
  * relative links that resolve correctly (this server serves real files)

Mermaid diagrams are shown as readable source (not graphical) so no external
JS is fetched. To see them rendered graphically, open any .md in VS Code with
Markdown Preview (Cmd+Shift+V) — that renders Mermaid natively, no download.

Usage:  python3 wiki-viewer/serve.py
        then open http://localhost:8137
"""
import html
import os
import re
import socketserver
import urllib.parse
from http.server import BaseHTTPRequestHandler
from functools import partial

WIKI = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "openwiki"))
PORT = 8137
BASE_TITLE = "Don't Train On Me — OpenWiki"

# ---------------------------------------------------------------- nav tree
def build_nav():
    pages = []
    for root, _, files in os.walk(WIKI):
        for f in sorted(files):
            if not f.endswith(".md"):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, WIKI).replace(os.sep, "/")
            if rel == "index.md":
                continue
            title = rel
            with open(full, encoding="utf-8") as fh:
                for line in fh:
                    m = re.match(r'^#\s+(.*)', line)
                    if m:
                        title = m.group(1).strip()
                        break
            pages.append((rel, title))
    return pages

NAV = build_nav()

# ---------------------------------------------------------------- markdown
def escape(t):
    return html.escape(t, quote=False)

def inline(t):
    # images first, then links, then code, bold, italic
    t = escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', t)
    return t

def render_markdown(text):
    lines = text.split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        # fenced code / mermaid
        m = re.match(r'^```(\w*)\s*$', line)
        if m:
            lang = m.group(1)
            buf = []
            i += 1
            while i < n and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1  # skip closing ```
            code = "\n".join(buf)
            if lang == "mermaid":
                out.append('<div class="mermaid-block"><div class="mermaid-label">Mermaid diagram (source — render in VS Code)</div>'
                           f'<pre class="code"><code>{escape(code)}</code></pre></div>')
            else:
                out.append(f'<pre class="code"><code>{escape(code)}</code></pre>')
            continue

        # headings
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            lvl = len(m.group(1))
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>')
            i += 1; continue

        # horizontal rule (standalone)
        if re.match(r'^---+\s*$', line):
            out.append('<hr>'); i += 1; continue

        # blockquote
        if line.startswith('>'):
            buf = []
            while i < n and lines[i].startswith('>'):
                buf.append(re.sub(r'^>\s?', '', lines[i])); i += 1
            out.append(f'<blockquote>{"<br>".join(inline(b) for b in buf)}</blockquote>')
            continue

        # table
        if line.strip().startswith('|') and i + 1 < n and re.match(r'^\s*\|[\s:|-]+\|\s*$', lines[i+1]):
            rows = [line]
            i += 1
            while i < n and lines[i].strip().startswith('|'):
                rows.append(lines[i]); i += 1
            out.append(render_table(rows))
            continue

        # unordered / ordered list
        if re.match(r'^\s*[-*]\s+', line) or re.match(r'^\s*\d+\.\s+', line):
            buf = []
            while i < n and (re.match(r'^\s*[-*]\s+', lines[i]) or re.match(r'^\s*\d+\.\s+', lines[i])):
                item = re.sub(r'^\s*(?:[-*]|\d+\.)\s+', '', lines[i])
                buf.append(f'<li>{inline(item)}</li>'); i += 1
            tag = 'ul' if buf and '<li>' in buf[0] and re.match(r'^\s*[-*]\s', lines[0] if False else lines[max(0,i-len(buf))]) else 'ul'
            out.append(f'<ul>{"".join(buf)}</ul>')
            continue

        # blank
        if not line.strip():
            i += 1; continue

        # paragraph (gather until blank / block start)
        buf = [line]
        i += 1
        while i < n and lines[i].strip() and not lines[i].startswith(('#', '>', '|', '```')) \
                and not re.match(r'^\s*[-*]\s+', lines[i]) and not re.match(r'^\s*\d+\.\s+', lines[i]):
            buf.append(lines[i]); i += 1
        out.append(f'<p>{" ".join(inline(b) for b in buf)}</p>')

    return "\n".join(out)

def render_table(rows):
    header = [c.strip() for c in rows[0].strip().strip('|').split('|')]
    body = []
    for r in rows[2:]:
        cells = [c.strip() for c in r.strip().strip('|').split('|')]
        body.append('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in cells) + '</tr>')
    head = '<tr>' + ''.join(f'<th>{inline(c)}</th>' for c in header) + '</tr>'
    return f'<table class="md-table"><thead>{head}</thead><tbody>{"".join(body)}</tbody></table>'

# ---------------------------------------------------------------- page shell
def page_html(rel, body):
    nav_items = []
    for r, t in NAV:
        cls = ' class="active"' if r == rel else ''
        nav_items.append(f'<li{cls}><a href="/{r}">{escape(t)}</a></li>')
    nav_html = "<ul>" + "".join(nav_items) + "</ul>"
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(rel)} — {BASE_TITLE}</title>
<style>
:root {{ --bg:#fafaf7; --panel:#fff; --ink:#1c1c1c; --muted:#6b6b6b; --line:#e3e1da; --accent:#ff5a1f; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); }}
.layout {{ display:flex; min-height:100vh; }}
nav {{ width:280px; flex:0 0 280px; border-right:1px solid var(--line); background:var(--panel); padding:18px 14px; position:sticky; top:0; height:100vh; overflow:auto; }}
nav h1 {{ font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 12px; }}
nav ul {{ list-style:none; margin:0; padding:0; }}
nav li {{ margin:2px 0; }}
nav a {{ display:block; padding:5px 8px; border-radius:6px; color:var(--ink); text-decoration:none; font-size:13.5px; }}
nav a:hover {{ background:#f0eee8; }}
nav a.active {{ background:var(--accent); color:#fff; }}
main {{ flex:1; padding:32px 44px; max-width:980px; }}
h1,h2,h3 {{ line-height:1.25; }}
h1 {{ font-size:26px; border-bottom:2px solid var(--line); padding-bottom:8px; }}
h2 {{ font-size:20px; margin-top:32px; }}
a {{ color:var(--accent); }}
.md-table {{ border-collapse:collapse; width:100%; margin:14px 0; font-size:14px; }}
.md-table th,.md-table td {{ border:1px solid var(--line); padding:7px 10px; text-align:left; vertical-align:top; }}
.md-table th {{ background:#f5f3ee; }}
pre.code {{ background:#1e1e1e; color:#e6e6e6; padding:14px 16px; border-radius:8px; overflow:auto; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }}
code {{ font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#f0eee8; padding:1px 5px; border-radius:4px; }}
pre.code code {{ background:none; padding:0; }}
.mermaid-block {{ margin:14px 0; }}
.mermaid-label {{ font-size:12px; color:var(--muted); margin-bottom:4px; }}
blockquote {{ border-left:3px solid var(--accent); margin:14px 0; padding:6px 16px; color:var(--muted); background:#fff; }}
hr {{ border:none; border-top:1px solid var(--line); margin:28px 0; }}
.foot {{ margin-top:48px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }}
</style></head>
<body><div class="layout">
<nav><h1>{BASE_TITLE}</h1>{nav_html}</nav>
<main>{body}
<div class="foot">Local OpenWiki viewer · served from <code>{escape(WIKI)}</code> · diagrams shown as source (graphical render in VS Code).</div>
</main></div></body></html>"""

# ---------------------------------------------------------------- server
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("", "/"):
            path = "/quickstart.md"
        fs_path = os.path.normpath(os.path.join(WIKI, path.lstrip("/")))
        if not fs_path.startswith(WIKI) or not os.path.isfile(fs_path):
            self.send_error(404, "Not found: " + path); return
        if fs_path.endswith(".md"):
            with open(fs_path, encoding="utf-8") as fh:
                body = render_markdown(fh.read())
            rel = os.path.relpath(fs_path, WIKI).replace(os.sep, "/")
            payload = page_html(rel, body).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
        else:
            with open(fs_path, "rb") as fh:
                payload = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass

def main():
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    print(f"OpenWiki viewer running at  http://localhost:{PORT}")
    print(f"Serving: {WIKI}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
