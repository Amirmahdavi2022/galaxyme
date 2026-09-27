"""Builds public/index.html (the Telegram Mini App) from the files in app/."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda f: open(os.path.join(here, f), encoding="utf-8").read()
miner = rd("miner.js")
core = rd("core.js").split("if(typeof module")[0]
worker = miner + rd("worker.src.js")
app = rd("app.src.js").replace("__GENESIS__", json.dumps(json.load(open(os.path.join(here, "genesis.json")))))
assert "</script" not in worker
page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>Galaxyme</title>
<meta name="description" content="Mine blocks on your phone. Every block you find becomes a star.">
<meta name="theme-color" content="#070816">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700&family=Figtree:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
[hidden]{{display:none!important}}
body{{margin:0}}
{rd("app.css")}</style>
</head>
<body>
{rd("body.html")}
<script type="text/plain" id="wsrc">{worker}</script>
<script>
{miner}
{core}
{app}
</script>
</body>
</html>
"""
out = os.path.join(here, "..", "public", "index.html")
open(out, "w", encoding="utf-8").write(page)
print("wrote", os.path.normpath(out), len(page), "bytes")
