"""Store a paper's annotations in a readable, ordered Markdown file."""
from datetime import datetime
import json
import uuid


HEADER = '# 论文阅读批注\n\n'
START = '<!-- paper-reader-note '
TYPES = ('疑问', '收获', '评论')
COLORS = ('yellow', 'green', 'blue', 'purple', 'pink')
COLOR_NAMES = {'yellow': '黄色', 'green': '绿色', 'blue': '蓝色', 'purple': '紫色', 'pink': '粉色'}
TITLE_ID = '__paper_title__'


def read_notes(path):
    if not path.exists():
        return []
    content = path.read_text(encoding='utf-8').replace('\r\n', '\n')
    if not content.startswith(HEADER):
        raise ValueError('note.md 的格式无法识别，未修改文件。')
    rest = content[len(HEADER):]
    notes = []
    while rest.strip():
        rest = rest.lstrip('\n')
        if not rest.startswith(START) or ' -->\n' not in rest:
            raise ValueError('note.md 含有无法识别的内容，未修改文件。')
        header, rest = rest[len(START):].split(' -->\n', 1)
        try:
            note = json.loads(header)
            required = ('id', 'block_id', 'page', 'language', 'start', 'end', 'type', 'color', 'revision')
            if not isinstance(note, dict) or any(key not in note for key in required) or note['type'] not in TYPES or note['color'] not in COLORS:
                raise ValueError('invalid metadata')
            closing = f'\n<!-- /paper-reader-note:{note["id"]} -->'
            section, rest = rest.split(closing, 1)
            _, section = section.split('\n\n**选中文本：**\n', 1)
            selected, body = section.split('\n\n**批注：**\n', 1)
            lines = selected.split('\n')
            if not all(line.startswith('> ') for line in lines):
                raise ValueError('invalid quotation')
            note['quote'] = '\n'.join(line[2:] for line in lines)
            note['content'] = body
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError('note.md 的批注格式无法识别，未修改文件。') from exc
        notes.append(note)
    return notes


def markdown(notes):
    if not notes:
        return HEADER
    parts = [HEADER.rstrip()]
    for note in notes:
        metadata = {key: value for key, value in note.items() if key not in ('quote', 'content')}
        encoded = json.dumps(metadata, ensure_ascii=False, separators=(',', ':')).replace('>', '\\u003e')
        language = '中文' if note['language'] == 'zh' else '英文'
        location = f'PDF 第 {note["page"]} 页' if note['page'] else '论文标题'
        quote = '\n'.join('> ' + line for line in note['quote'].split('\n'))
        parts.append(
            f'{START}{encoded} -->\n'
            f'### {note["type"]} · {location} · {language} · {COLOR_NAMES[note["color"]]}\n\n'
            f'**选中文本：**\n{quote}\n\n'
            f'**批注：**\n{note["content"]}\n'
            f'<!-- /paper-reader-note:{note["id"]} -->'
        )
    return '\n\n'.join(parts) + '\n'


class NoteStore:
    def __init__(self, papers, lock):
        self.papers = papers
        self.lock = lock

    def paper(self, paper_id):
        base = self.papers.resolve()
        folder = (base / paper_id).resolve()
        if folder.parent != base or not (folder / 'source_map.json').is_file() or not (folder / 'reader.html').is_file():
            raise ValueError('论文不存在，请从文献库重新打开。')
        return folder

    def ordered(self, folder, notes):
        source = json.loads((folder / 'source_map.json').read_text(encoding='utf-8'))
        order = {block['id']: index for index, block in enumerate(source['blocks']) if block.get('id')}
        order[TITLE_ID] = -1
        return sorted(notes, key=lambda note: (order.get(note['block_id'], len(order)), note['language'] != 'en', note['start'], note['id']))

    def get(self, paper_id):
        folder = self.paper(paper_id)
        with self.lock:
            return self.ordered(folder, read_notes(folder / 'note.md'))

    def change(self, paper_id, action, payload):
        folder = self.paper(paper_id)
        with self.lock:
            path = folder / 'note.md'
            notes = read_notes(path)
            if action == 'create':
                source = json.loads((folder / 'source_map.json').read_text(encoding='utf-8'))
                if payload.get('block_id') == TITLE_ID:
                    block = {'id': TITLE_ID, 'type': 'title', 'page': source.get('title_page') or ''}
                else:
                    block = next((item for item in source['blocks'] if item.get('id') == payload.get('block_id')), None)
                if block is None or block['type'] not in ('title', 'section', 'paragraph', 'reference', 'figure', 'table', 'equation'):
                    raise ValueError('找不到对应段落，请刷新阅读页。')
                if payload.get('language') not in ('en', 'zh'):
                    raise ValueError('请选择英文或中文段落。')
                start, end = payload.get('start'), payload.get('end')
                if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start or not payload.get('quote', '').strip():
                    raise ValueError('请重新选择要批注的文字。')
                now = datetime.now().astimezone().isoformat(timespec='seconds')
                note = {'id': uuid.uuid4().hex, 'block_id': block['id'], 'page': str(block['page']),
                        'language': payload['language'], 'start': start, 'end': end,
                        'prefix': payload.get('prefix', ''), 'suffix': payload.get('suffix', ''),
                        'quote': payload['quote'].replace('\r\n', '\n'), 'created_at': now}
                notes.append(note)
            else:
                note = next((item for item in notes if item['id'] == payload.get('id')), None)
                if note is None:
                    raise ValueError('批注不存在，请刷新后重试。')
                if note.get('revision') != payload.get('revision') or note.get('content') != payload.get('previous_content'):
                    raise ValueError('这条批注已被修改，请刷新后重试。')
                if action == 'delete':
                    notes.remove(note)
                elif action != 'update':
                    raise ValueError('不支持的批注操作。')
            if action in ('create', 'update'):
                if payload.get('type') not in TYPES or payload.get('color') not in COLORS:
                    raise ValueError('请选择批注类型和颜色。')
                content = payload.get('content', '').replace('\r\n', '\n').strip()
                if not content:
                    raise ValueError('请输入批注内容。')
                if f'<!-- /paper-reader-note:{note["id"]} -->' in content:
                    raise ValueError('批注内容包含保留的结束标记。')
                note.update(type=payload['type'], color=payload['color'], content=content, revision=uuid.uuid4().hex)
            notes = self.ordered(folder, notes)
            temporary = path.with_suffix('.tmp')
            temporary.write_text(markdown(notes), encoding='utf-8')
            temporary.replace(path)
            return notes
