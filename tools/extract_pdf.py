"""Extract a PDF's page text, layout candidates, and review images into work/."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess

import pymupdf
import pymupdf4llm


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('output', type=Path, help='Working directory for the extraction')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    previews = args.output / 'pages'
    previews.mkdir(exist_ok=True)
    images = args.output / 'layout_assets'
    images.mkdir(exist_ok=True)

    pdf = pymupdf.open(args.pdf)
    raw_pages = []
    if shutil.which('pdftotext'):
        result = subprocess.run(
            ['pdftotext', '-raw', '-enc', 'UTF-8', str(args.pdf), '-'],
            capture_output=True, check=False,
        )
        if result.returncode == 0:
            raw_pages = result.stdout.decode('utf-8').split('\f')
    needs_ocr = any(len(page.get_text().strip()) < 80 for page in pdf)
    chunks = pymupdf4llm.to_markdown(
        pdf, page_chunks=True, write_images=True, image_path=str(images),
        show_progress=False, use_ocr=needs_ocr,
    )
    pages = []
    for index, page in enumerate(pdf):
        preview = previews / f'page_{index + 1:03}.png'
        page.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25), alpha=False).save(preview)
        text = page.get_text()
        pages.append({
            'page': index + 1,
            'width': page.rect.width,
            'height': page.rect.height,
            'native_text': text,
            'raw_text': raw_pages[index].strip() if index < len(raw_pages) else '',
            'markdown': chunks[index]['text'],
            'page_boxes': chunks[index].get('page_boxes', []),
            'figure_captions': re.findall(r'(?im)^\s*(?:Fig\.|Figure)\s*(\d+)\s*[.:]', text),
            'table_captions': re.findall(r'(?m)^\s*TABLE\s+([IVX]+)(?:\s*:|\s*$)', text),
            'equation_numbers': re.findall(r'(?m)^\s*\((\d{1,3})\)\s*$', text),
            'preview': str(preview),
        })
    extraction = {'source': str(args.pdf), 'metadata': pdf.metadata, 'page_count': len(pdf), 'needs_ocr': needs_ocr, 'pages': pages}
    (args.output / 'extraction.json').write_text(json.dumps(extraction, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Extracted {len(pdf)} pages to {args.output}')
    for page in pages:
        print(f"p.{page['page']}: {len(page['native_text'])} characters, figures {page['figure_captions']}, tables {page['table_captions']}, equations {page['equation_numbers']}")


if __name__ == '__main__':
    main()
