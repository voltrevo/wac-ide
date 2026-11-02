#!/usr/bin/env python3
"""Writes src/websrc.wac: the `web` package this IDE is pinned to, as text, for the page programs written in it.

A page program imports `web`, which a build finds in a package cache — `$WAC_HOME/cache/git/<repo>/<commit>/`. A page
in a browser has no `$WAC_HOME` and no such cache, so the IDE keeps one of its own (`webcache.wac`), filled from
this: `web`'s manifest and sources at the commit wac.lock pins, which are what the IDE itself is built with. Run it
whenever the pin moves; the file is committed, since wac's desktop builds the IDE straight from git.

    python3 tools/websrc.py
"""
import json, os, sys, urllib.parse

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.normpath(os.path.join(here, ".."))
lock = json.load(open(os.path.join(root, "wac.lock")))
entry = lock["imports"]["web"]
home = os.environ.get("WAC_HOME") or os.path.join(os.environ["HOME"], ".wac")
checkout = os.path.join(home, "cache", "git", urllib.parse.quote(entry["git"], safe=""), entry["commit"])
if not os.path.isfile(os.path.join(checkout, "wac.json5")):
    sys.exit("websrc.py: web %s is not in the package cache at %s — run `sh tools/fill-cache.sh`" % (entry["commit"][:9], checkout))

def literal(text):
    out = []
    for c in text:
        if c == "\\": out.append("\\\\")
        elif c == '"': out.append('\\"')
        elif c == "\n": out.append("\\n")
        elif c == "\t": out.append("\\t")
        elif c == "\r": out.append("\\r")
        elif ord(c) < 32: sys.exit("websrc.py: a control character in web's sources")
        else: out.append(c)
    return '"' + "".join(out) + '"'

files = ["wac.json5"] + sorted("src/" + f for f in os.listdir(os.path.join(checkout, "src")) if f.endswith(".wac"))
texts = [open(os.path.join(checkout, f), encoding="utf-8").read() for f in files]
out = os.path.join(root, "src", "websrc.wac")
with open(out, "w") as f:
    f.write("// Written by tools/websrc.py from web %s: the `web` package the IDE is built with, for the page programs\n"
            "// written in it (`webcache.wac`). Do not edit; run the script when the pin moves.\n\n" % entry["commit"][:9])
    f.write("/** The repository `web` is fetched from, and the commit these are. */\n")
    f.write("export string webGit() { return %s; }\n" % literal(entry["git"]))
    f.write("export string webCommit() { return %s; }\n\n" % literal(entry["commit"]))
    f.write("/** Each file's path in the package, and its text. */\n")
    f.write("export string[] webPaths() { return [%s]; }\n\n" % ", ".join(literal(p) for p in files))
    f.write("export string[] webTexts() {\n  return [\n")
    f.write(",\n".join("    " + literal(t) for t in texts))
    f.write("\n  ];\n}\n")
print("%s: web %s, %d files, %d bytes" % (os.path.relpath(out, root), entry["commit"][:9], len(files), sum(len(t) for t in texts)))
