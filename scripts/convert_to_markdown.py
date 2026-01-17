#!/usr/bin/env python3
"""
Convert selected project files into a single Markdown file.

- Gathers all `.ts` and `.tsx` files under `worker/src` (recursively).
- Also includes `wrangler.toml` and `vitest.config.ts` from the repo root (if present).
- Writes a single Markdown file with headers and fenced code blocks.

Usage:
    python scripts/convert_to_markdown.py --output worker_sources.md

Options:
    --root    Path to repository root (default: current working directory)
    --output  Output Markdown file path (default: worker_sources.md)
    --skip-dot-types  Skip `.d.ts` files (default: True)

"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
import sys
from typing import Iterable, List


def find_files(root: Path, skip_dot_types: bool = True) -> List[Path]:
    files: List[Path] = []

    worker_dir = root / "worker" / "src"
    if worker_dir.exists() and worker_dir.is_dir():
        for pat in ("**/*.ts", "**/*.tsx"):
            for p in worker_dir.glob(pat):
                if skip_dot_types and p.name.endswith(".d.ts"):
                    continue
                files.append(p)

    # Include additional top-level files if they exist
    for extra in ("wrangler.toml", "vitest.config.ts"):
        p = root / extra
        if p.exists():
            files.append(p)

    # Sort files for consistent output
    files = sorted(files, key=lambda p: str(p).lower())
    return files


def file_language_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".toml":
        return "toml"
    if suffix in (".ts", ".tsx"):
        return "ts"
    return "text"


def write_markdown(files: Iterable[Path], out_path: Path) -> None:
    header = f"# Combined source files\n\nGenerated: {datetime.utcnow().isoformat()}Z\n\n"
    with out_path.open("w", encoding="utf-8") as out:
        out.write(header)
        for path in files:
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                print(f"Warning: skipping non-text file {path}", file=sys.stderr)
                continue

            rel = path.relative_to(Path.cwd()) if path.exists() else path
            out.write(f"---\n\n")
            out.write(f"## `{rel}`\n\n")
            out.write(f"_Size: {len(text.splitlines())} lines_  \n\n")

            lang = file_language_for(path)
            out.write(f"```{lang}\n")
            out.write(text.rstrip() + "\n")
            out.write("```\n\n")

    print(f"Wrote {out_path} with {len(list(files))} files.")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Combine project source files into one Markdown document.")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Repository root (default: current working directory)")
    parser.add_argument("--output", type=Path, default=Path.cwd() / "worker_sources.md", help="Output Markdown file path")
    parser.add_argument("--skip-dot-types", action="store_true", default=True, help="Skip .d.ts files (default: True)")

    args = parser.parse_args(argv)

    files = find_files(args.root, skip_dot_types=args.skip_dot_types)
    if not files:
        print("No files found to include.", file=sys.stderr)
        return 2

    write_markdown(files, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
