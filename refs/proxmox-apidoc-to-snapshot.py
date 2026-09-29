#!/usr/bin/env python3
"""
Convert Proxmox's vendored apidoc.js into the RawApiSnapshot shape that
mihailfox/proxmox-openapi's normaliser expects.

The upstream `scrape` stage uses Playwright against the live API viewer and
performs this same reshape. Doing it locally instead means sovren needs no
browser dependency to regenerate the spec, and the input is pinned to the
exact apidoc.js we already vendor in refs/.

apidoc.js node        -> RawApiTreeNode
  .info{<METHOD>: op}     -> .methods[{ httpMethod, ...op }]
  .allowtoken / .protected -> booleans (apidoc uses 0/1)
  .children                -> .children (same recursive shape)
"""
import json
import sys
import time
import hashlib
import pathlib

# Input is Proxmox's raw API schema (apidoc.js), fetched from the API viewer.
# The input is not tracked here; pass its path, or drop it at the default below.
DEFAULT_SRC = pathlib.Path(__file__).resolve().parent / "pve-apidoc.js"
DEFAULT_DEST = pathlib.Path(
    __file__).resolve().parent.parent / "var" / "cache" / "api-scraper" / "raw" \
    / "proxmox-openapi-schema.json"

SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
DEST = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DEST

BOOL_KEYS = ("allowtoken", "protected", "proxy", "download", "upload")


def as_bool(value):
    return bool(value) if isinstance(value, (int, bool)) else value


def convert_method(http_method: str, op: dict) -> dict:
    out = {"httpMethod": http_method}
    for key, value in op.items():
        if key == "method":
            continue  # replaced by httpMethod
        target = "allowToken" if key == "allowtoken" else key
        out[target] = as_bool(value) if key in BOOL_KEYS else value
    return out


def convert_node(node: dict) -> dict:
    info = node.get("info") or {}
    methods = [
        convert_method(m, op)
        for m, op in info.items()
        if isinstance(op, dict)
    ]

    children_raw = node.get("children")
    if isinstance(children_raw, dict):
        children_raw = list(children_raw.values())
    elif not isinstance(children_raw, list):
        children_raw = []

    return {
        "path": node.get("path", ""),
        "text": node.get("text", ""),
        "methods": methods,
        "children": [convert_node(c) for c in children_raw if isinstance(c, dict)],
    }


def count_methods(node: dict) -> int:
    return len(node["methods"]) + sum(count_methods(c) for c in node["children"])


def main() -> None:
    raw = SRC.read_text()
    schema = json.JSONDecoder().raw_decode(raw[raw.index("["):])[0]

    tree = [convert_node(n) for n in schema if isinstance(n, dict)]
    snapshot = {
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
        "sourceUrl": "https://pve.proxmox.com/pve-docs/api-viewer/apidoc.js",
        "documentTitle": "Proxmox VE API Documentation",
        "stats": {
            "rootGroupCount": len(tree),
            "endpointCount": sum(count_methods(t) for t in tree),
        },
        "schema": tree,
    }

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(snapshot))
    print(f"wrote {DEST}")
    print(f"  root groups: {snapshot['stats']['rootGroupCount']}")
    print(f"  endpoints:    {snapshot['stats']['endpointCount']}")
    print(f"  source sha256: {hashlib.sha256(raw.encode()).hexdigest()}")


if __name__ == "__main__":
    main()
