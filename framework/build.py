#!/usr/bin/env python3
"""Report Kit inliner — assembles a self-contained, offline report .html.

Dev-only tool. End users never run this; they open the built .html directly.
It expands `@include <path>@` directives (path relative to the repo root) by
splicing the referenced file's contents in place, so the shared kit CSS/JS and
the vendored SheetJS live in ONE place (framework/) yet each report ships as a
single file with no external requests.

Usage:
  python3 framework/build.py                 # build every reports/*.src.html
  python3 framework/build.py reports/x.src.html [...]   # build specific sources
  python3 framework/build.py --check         # build to memory, fail if any
                                             # committed .html is out of date

Source conventions:
  - Put the report source at reports/<name>.src.html
  - Optional first-line directive `<!-- @out: <path> -->` sets the output file;
    otherwise it defaults to <name>.html at the repo root.
  - Use `/*@include framework/report-kit.css@*/` inside a <style> block,
    `/*@include framework/vendor/sheetjs.js@*/` and
    `/*@include framework/report-kit.js@*/` inside <script> blocks.
    The whole line containing the directive is replaced by the file's contents.
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# `@include PATH@`, optionally wrapped in a /* */ or <!-- --> comment. The whole
# token (including the wrapper) is replaced by the file's contents, so a directive
# can sit alone on a line or inline (e.g. inside <script>...</script>).
INCLUDE = re.compile(r"(?:/\*|<!--)?\s*@include\s+(\S+?)\s*@\s*(?:\*/|-->)?")
OUT_DIRECTIVE = re.compile(r"@out:\s*(\S+)")


def read(path):
    with open(path, "r", encoding="utf-8", errors="surrogatepass") as f:
        return f.read()


def expand(src_text, seen=None):
    """Replace each @include directive with the target file's contents
    (recursively), preserving anything else on the same line."""
    seen = seen or []

    def repl(m):
        rel = m.group(1)
        path = os.path.join(REPO, rel)
        if not os.path.isfile(path):
            raise SystemExit(f"include not found: {rel}")
        if rel in seen:
            raise SystemExit(f"circular include: {rel}")
        return expand(read(path), seen + [rel]).rstrip("\n")

    return INCLUDE.sub(repl, src_text)


def out_path(src_path, src_text):
    m = OUT_DIRECTIVE.search(src_text)
    if m:
        return os.path.join(REPO, m.group(1))
    base = os.path.basename(src_path)
    if base.endswith(".src.html"):
        base = base[:-len(".src.html")] + ".html"
    return os.path.join(REPO, base)


def sources(args):
    paths = [a for a in args if not a.startswith("--")]
    if paths:
        return paths
    d = os.path.join(REPO, "reports")
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith(".src.html"))


def main(argv):
    check = "--check" in argv
    srcs = sources(argv)
    if not srcs:
        raise SystemExit("no sources found (reports/*.src.html)")
    stale = []
    for src in srcs:
        text = read(src)
        dist = out_path(src, text)
        built = expand(text)
        if not built.endswith("\n"):
            built += "\n"
        rel_out = os.path.relpath(dist, REPO)
        if check:
            current = read(dist) if os.path.isfile(dist) else None
            status = "ok" if current == built else "STALE"
            if current != built:
                stale.append(rel_out)
            print(f"[check] {rel_out}: {status}")
        else:
            with open(dist, "w", encoding="utf-8", errors="surrogatepass") as f:
                f.write(built)
            print(f"[build] {os.path.relpath(src, REPO)} -> {rel_out} ({len(built)//1024} KB)")
    if check and stale:
        raise SystemExit("out of date (run: python3 framework/build.py): " + ", ".join(stale))


if __name__ == "__main__":
    main(sys.argv[1:])
