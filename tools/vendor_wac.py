#!/usr/bin/env python3
"""Copy the wac sources this project imports into vendor/wac/, with everything they import in turn.

    python3 tools/vendor_wac.py /path/to/a/wac/checkout

The compiler (`packages/wacc`) and the `wac` command's source gathering (`packages/wac/src/sources.wac`)
are not in wac's root library (`lib.wac`) yet, so they cannot be imported as `from "wac"`; until they are,
they are copied. They keep their paths under the repository root (vendor/wac/packages/...), so their own
relative imports keep working unchanged, and vendor/wac/VENDORED.md records which commit they came from.
Run it again to update; it replaces the whole tree, so nothing stale survives.

**Anything that shares a type with these files must import it from here too** — `Fs` above all. A type
reached through `from "wac"` and the same type reached through vendor/ are two different types.
"""
import os, re, shutil, subprocess, sys

# What the project itself reaches into wac for. Everything they import comes along.
ROOTS = [
    "packages/wacc/src/api.wac",       # the compiler: diagnostics, emitting, the lexer
    "packages/wacc/src/render.wac",    # diagnostics as a person reads them
    "packages/wac/src/sources.wac",    # which files a program is made of, as `wac check` finds them
    "packages/fs/src/fs.wac",          # the filesystem those read through
]
IMPORT = re.compile(r'^(?:import|export)\s*(?:\*\s*as\s*\w+|\{[^}]*\})\s*from\s*"([^"]+)"', re.S | re.M)

def closure(src):
    seen, stack, outside = set(), list(ROOTS), set()
    while stack:
        rel = os.path.normpath(stack.pop())
        if rel in seen:
            continue
        path = os.path.join(src, rel)
        if not os.path.exists(path):
            sys.exit(f"vendor_wac.py: {rel} is imported but not in {src}")
        seen.add(rel)
        for spec in IMPORT.findall(open(path).read()):
            if spec.startswith("."):
                stack.append(os.path.join(os.path.dirname(rel), spec))
            else:
                outside.add(spec)
    return sorted(seen), outside

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = os.path.abspath(sys.argv[1])
    files, outside = closure(src)
    if outside - {"core", "std"}:
        sys.exit(f"vendor_wac.py: the closure reaches beyond core and std: {sorted(outside)}")
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(here, "..", "vendor", "wac")
    shutil.rmtree(dest, ignore_errors=True)
    for rel in files:
        os.makedirs(os.path.join(dest, os.path.dirname(rel)), exist_ok=True)
        shutil.copyfile(os.path.join(src, rel), os.path.join(dest, rel))
    try:
        commit = subprocess.check_output(["git", "-C", src, "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        commit = "unknown (not a git checkout)"
    lines = sum(len(open(os.path.join(dest, r)).read().splitlines()) for r in files)
    packages = sorted({r.split("/")[1] for r in files})
    with open(os.path.join(dest, "VENDORED.md"), "w") as f:
        f.write(f"# Vendored from wac\n\nCopied by `tools/vendor_wac.py` from wac `{commit}`: {len(files)} files, "
                f"{lines:,} lines, from {len(packages)} packages ({', '.join(packages)}).\n\n"
                "Do not edit these files: change wac, then run the script again. When wac's root library exports "
                "the compiler and the `wac` command's gathering, import them that way and delete this directory.\n\n"
                + "".join(f"- `{r}`\n" for r in files))
    print(f"vendored {len(files)} files ({lines:,} lines) from {len(packages)} packages at {commit[:9]}")

main()
