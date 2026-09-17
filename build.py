#!/usr/bin/env python3
"""Build AnchorGate into a single self-contained index.html (no dependencies)."""
from pathlib import Path
ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
VERSION = (ROOT / "VERSION").read_text().strip()
JS_ORDER = ["10_core.js", "20_model.js", "25_protocol.js", "30_plot.js", "40_ui.js",
            "50_bar.js", "55_export.js", "57_hist.js", "56_prism.js", "60_boot.js"]
js = '"use strict";\n' + f'const ANCHORGATE_VERSION = "{VERSION}";\n' + "\n".join((SRC / f).read_text(encoding="utf-8") for f in JS_ORDER)
shell = (SRC / "00_shell.html").read_text(encoding="utf-8")
i = shell.index("</style>") + len("</style>")
html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f'<meta name="generator" content="AnchorGate {VERSION}">\n'
        + shell[:i] + '\n</head>\n<body style="margin:0">' + shell[i:]
        + "\n<script>\n" + js + "\n</script>\n</body>\n</html>\n")
(ROOT / "index.html").write_text(html, encoding="utf-8")
print(f"index.html built (AnchorGate {VERSION}, {len(html)//1024} KB)")
