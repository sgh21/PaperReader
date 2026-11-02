"""Copy a selected paper figure to its library cover and record its source."""
import argparse
import json
from pathlib import Path
import shutil

import pymupdf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('paper', type=Path, help='Paper folder containing source_map.json')
    parser.add_argument('figure_id', help='Figure block identifier, for example F002')
    parser.add_argument('--reason', required=True, help='Why this figure represents the paper')
    parser.add_argument('--crop', type=int, nargs=4, metavar=('X0', 'Y0', 'X1', 'Y1'),
                        help='Selected area in source-image pixels')
    args = parser.parse_args()
    path = args.paper / 'source_map.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    figure = next((block for block in data['blocks'] if block.get('type') == 'figure' and block.get('id') == args.figure_id), None)
    if figure is None:
        parser.error(f'未找到图表 {args.figure_id}。')
    source = args.paper / figure['asset']
    image = pymupdf.Pixmap(str(source))
    bounds = pymupdf.IRect(image.irect)
    crop = pymupdf.IRect(args.crop) if args.crop else bounds
    if crop.is_empty or not bounds.contains(crop):
        parser.error('裁剪区域必须位于原图内，且宽高均大于 0。')
    ratio = crop.width / crop.height
    if not 1.6 <= ratio <= 2.6:
        parser.error(f'代表图宽高比为 {ratio:.2f}；请选择或裁取宽高比在 1.6–2.6 的代表区域。')
    target = args.paper / 'assets' / 'library_cover.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    if args.crop:
        pymupdf.Pixmap(image, image.width, image.height, crop).save(str(target))
    elif source.resolve() != target.resolve() and source.suffix.lower() == '.png':
        shutil.copy2(source, target)
    elif source.resolve() != target.resolve():
        image.save(str(target))
    data['library_cover'] = {
        'asset': 'assets/library_cover.png',
        'source_asset': figure['asset'],
        'source_page': figure['page'],
        'source_figure': figure['id'],
        'source_figure_number': figure.get('number'),
        'crop_pixels': list(crop) if args.crop else None,
        'description': args.reason,
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'已设置代表图：{target}，来源 {figure["id"]}（p.{figure["page"]}）')


if __name__ == '__main__':
    main()
