"""Render a source_map.json as an offline HTML/Markdown reading package."""
import argparse
from collections import Counter
from html import escape
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent


def markdown_table(rows):
    def line(row):
        return '| ' + ' | '.join(str(v).replace('|', '\\|') for v in row) + ' |'
    return '\n'.join([line(rows[0]), line(['---'] * len(rows[0]))] + [line(row) for row in rows[1:]])


def html_table(rows):
    header = ''.join(f'<th>{escape(str(value))}</th>' for value in rows[0])
    body = ''.join('<tr>' + ''.join(f'<td>{escape(str(value))}</td>' for value in row) + '</tr>' for row in rows[1:])
    return f'<div class="table-scroll"><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></div>'


def render(data, out):
    counters = Counter()
    prefixes = {'section': 'H', 'paragraph': 'S', 'reference': 'R', 'figure': 'F', 'table': 'T', 'equation': 'E'}
    incomplete = [b for b in data['blocks'] if not b.get('en') or not b.get('zh')]
    if incomplete:
        data['status'] = 'draft'
        warning = f'草稿：有 {len(incomplete)} 个内容块缺少可靠原文或中文翻译，请回查对应页码。'
        if warning not in data.setdefault('notes', []):
            data['notes'].append(warning)
    for order, block in enumerate(data['blocks'], 1):
        kind = block['type']
        counters[kind] += 1
        block['id'] = block.get('id') or f'{prefixes[kind]}{counters[kind]:03}'
        block['reading_order'] = order
        if kind in ('figure', 'table'):
            counters['caption'] += 1
            block['caption_id'] = block.get('caption_id') or f'C{counters["caption"]:03}'

    ref_ids = {b['id'] for b in data['blocks'] if b['type'] == 'reference'}

    def html_text(value):
        value = escape(value)
        return re.sub(r'\[(\d{1,3})\]', lambda m: f'<a class="citation" href="#R{int(m.group(1)):03}">{m.group(0)}</a>' if f'R{int(m.group(1)):03}' in ref_ids else m.group(0), value)

    def page_link(page, label):
        match = re.search(r'\d+', str(page))
        return f'<a href="source.pdf#page={match.group(0)}">{escape(label)}</a>' if match else escape(label)

    title = data['title']
    title_zh = data.get('title_zh', '')
    authors = data.get('authors', '')
    md = [f'# {title}\n\n# {title_zh}', f'**Authors / 作者：** {authors}',
          f'**来源：** 本阅读包中的原始 PDF，共 {data["source_pdf_pages"]} 页。']
    sections = [b for b in data['blocks'] if b['type'] == 'section']
    md.append('## 目录\n\n' + '\n'.join(f'- [{b["zh"]} / {b["en"]}](#{b["id"]})' for b in sections))
    html_blocks = []
    for block in data['blocks']:
        kind, page, ident = block['type'], str(block['page']), block['id']
        source = f'p.{page} · {ident}'
        en = block.get('en') or '[原文尚未可靠识别]'
        zh = block.get('zh') or '[中文翻译待完成]'
        if kind == 'section':
            level = block.get('level', 2)
            md.append(f'<a id="{ident}"></a>\n\n' + '#' * level + f' {en}\n\n' + '#' * level + f' {zh}')
            tag = 'h2' if level == 2 else 'h3'
            html_blocks.append(f'<header class="section-heading" id="{ident}"><{tag}>{escape(en)}</{tag}><div class="section-zh">{escape(zh)}</div><span class="section-page">{page_link(page, "p." + page)}</span></header>')
        elif kind in ('paragraph', 'reference'):
            md.append(f'<a id="{ident}"></a>\n\n**Source:** p.{page} {ident}\n\n**Original:** {en}\n\n**中文:** {zh}')
            html_blocks.append(f'<article class="pair {kind}" id="{ident}"><div class="source">{page_link(page, source)}</div><div class="en"><div class="lang-label">ORIGINAL</div><p>{html_text(en)}</p></div><div class="zh"><div class="lang-label">中文翻译</div><p>{html_text(zh)}</p></div></article>')
        else:
            asset = block['asset']
            if not (out / asset).is_file():
                raise FileNotFoundError(out / asset)
            labels = {'figure': ('Figure', '图'), 'table': ('Table', '表'), 'equation': ('Equation', '公式')}
            english, chinese = labels[kind]
            label = f'{english} {block.get("number", "")}'.strip()
            label_zh = f'{chinese} {block.get("number", "")}'.strip()
            caption_id = block.get('caption_id', ident)
            caption_attr = f' id="{caption_id}"' if caption_id != ident else ''
            md_entry = f'<a id="{ident}"></a>\n\n### {label} / {label_zh}\n\n**Source:** p.{page} {ident} · {caption_id}\n\n![{label}]({asset})\n\n**Original:** {en}\n\n**中文:** {zh}'
            extra = ''
            if block.get('rows'):
                md_entry += '\n\n**表格中文对照：**\n\n' + markdown_table(block['rows'])
                extra = '<div class="transcribed-table"><h4>表格中文对照</h4>' + html_table(block['rows']) + '</div>'
            md.append(md_entry)
            html_blocks.append(f'<figure class="figure" id="{ident}"><div class="figure-title"><span>{escape(label)} <b>{escape(label_zh)}</b></span><small>{page_link(page, source)} / {caption_id}</small></div><img src="{escape(asset)}" alt="{escape(label)}" loading="lazy"><figcaption{caption_attr}><div class="en"><span class="lang-label">ORIGINAL</span><p>{html_text(en)}</p></div><div class="zh"><span class="lang-label">中文</span><p>{html_text(zh)}</p></div></figcaption>{extra}</figure>')

    notes = data.get('notes', [])
    if data.get('glossary'):
        rows = [['英文', '中文']] + data['glossary']
        md.append('## 术语对照\n\n' + markdown_table(rows))
        html_blocks.append('<section class="glossary"><h2>术语对照</h2>' + html_table(rows) + '</section>')
    if notes:
        md.append('## 阅读说明\n\n' + '\n'.join(f'- {note}' for note in notes))
        html_blocks.append('<aside class="endnote"><h2>阅读说明</h2><ul>' + ''.join(f'<li>{escape(note)}</li>' for note in notes) + '</ul></aside>')
    (out / 'paper.md').write_text('\n\n'.join(md) + '\n', encoding='utf-8')
    (out / 'translation_notes.md').write_text('# 翻译与整理说明\n\n' + '\n'.join(f'- {note}' for note in notes) + '\n', encoding='utf-8')
    toc = ''.join(f'<a class="toc-{b.get("level", 2)}" href="#{b["id"]}">{escape(b["zh"])}</a>' for b in sections)
    meta = f'<span class="chip">{data["source_pdf_pages"]} 页原文</span><span class="chip">{counters["figure"]} 幅图 · {counters["table"]} 个表</span><span class="chip">英文原文 + 中文翻译</span>'
    template = (ROOT / 'reader_template.html').read_text(encoding='utf-8')
    replacements = {'PAGE_TITLE': escape(title_zh or title), 'TOC': toc, 'TITLE_EN': escape(title), 'TITLE_ZH': escape(title_zh), 'AUTHORS': escape(authors), 'META': meta, 'CONTENT': '\n'.join(html_blocks), 'EXTRAS': ''}
    for key, value in replacements.items():
        template = template.replace('{{' + key + '}}', value)
    (out / 'reader.html').write_text(template, encoding='utf-8')
    (out / 'source_map.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return counters


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_map', type=Path)
    parser.add_argument('--source', type=Path, required=True)
    args = parser.parse_args()
    out = args.source_map.parent
    source = out / 'source.pdf'
    if args.source.resolve() != source.resolve():
        shutil.copy2(args.source, source)
    data = json.loads(args.source_map.read_text(encoding='utf-8'))
    counts = render(data, out)
    print('Created', out / 'reader.html', out / 'paper.md')
    print('Block counts:', dict(counts))


if __name__ == '__main__':
    main()
