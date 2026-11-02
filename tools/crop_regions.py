"""Render verified per-paper figure, table, or equation regions from a PDF."""
import argparse
import json
from pathlib import Path

import pymupdf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('regions', type=Path, help='JSON list with file, page and bbox')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(args.pdf)
    for item in json.loads(args.regions.read_text(encoding='utf-8')):
        page = document[item['page'] - 1]
        clip = pymupdf.Rect(item['bbox']) & page.rect
        page.get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), clip=clip, alpha=False).save(args.output / item['file'])
        print(item['file'], 'p.', item['page'], 'box', list(clip))


if __name__ == '__main__':
    main()
