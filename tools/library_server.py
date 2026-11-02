"""Serve the local paper library and persist virtual folder membership."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import sys
from threading import Lock
import time
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import urlopen
import uuid
import webbrowser

from note_store import NoteStore

ROOT = Path(__file__).resolve().parent.parent


class Library:
    def __init__(self, root):
        self.root = root
        self.papers = root / 'papers'
        self.folders_path = root / 'library_data' / 'folders.json'
        self.tags_path = root / 'library_data' / 'tags.json'
        self.lock = Lock()
        self.notes = NoteStore(self.papers, self.lock)

    def folders(self):
        if not self.folders_path.exists():
            return []
        return json.loads(self.folders_path.read_text(encoding='utf-8'))['folders']

    def save_folders(self, folders):
        self.folders_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.folders_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'folders': folders}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(self.folders_path)

    def tags(self):
        if not self.tags_path.exists():
            return {'tags': [], 'paper_tags': {}}
        return json.loads(self.tags_path.read_text(encoding='utf-8'))

    def change_tag(self, action, payload):
        with self.lock:
            data = self.tags()
            tags, paper_tags = data['tags'], data['paper_tags']
            if action in ('create', 'membership'):
                paper = str(payload.get('paper_id', ''))
                folder = (self.papers / paper).resolve()
                if folder.parent != self.papers.resolve() or not (folder / 'reader.html').is_file():
                    raise ValueError('论文不存在，请刷新后重试。')
            if action == 'create':
                name = str(payload.get('name', '')).strip()
                if not name:
                    raise ValueError('请输入标签名称。')
                if any(tag['name'].casefold() == name.casefold() for tag in tags):
                    raise ValueError('已存在同名标签，请直接选择。')
                color = str(payload.get('color', ''))
                if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
                    raise ValueError('请选择有效的标签颜色。')
                tag = {'id': uuid.uuid4().hex, 'name': name, 'color': color.lower()}
                tags.append(tag)
                paper_tags.setdefault(paper, []).append(tag['id'])
            else:
                tag = next((item for item in tags if item['id'] == payload.get('tag_id')), None)
                if tag is None:
                    raise ValueError('标签不存在，请刷新后重试。')
                if action == 'membership':
                    assigned = paper_tags.get(paper, [])
                    if payload.get('selected') and tag['id'] not in assigned:
                        paper_tags.setdefault(paper, []).append(tag['id'])
                    elif not payload.get('selected') and tag['id'] in assigned:
                        assigned.remove(tag['id'])
                        if not assigned:
                            paper_tags.pop(paper, None)
                        if not any(tag['id'] in items for items in paper_tags.values()):
                            tags.remove(tag)
                elif action == 'color':
                    color = str(payload.get('color', ''))
                    if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
                        raise ValueError('请选择有效的标签颜色。')
                    tag['color'] = color.lower()
                else:
                    raise ValueError('不支持的标签操作。')
            self.tags_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.tags_path.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            temporary.replace(self.tags_path)
        return {'ok': True}

    def scan(self):
        papers = []
        for folder in sorted(self.papers.iterdir(), key=lambda p: p.name.casefold()):
            if not folder.is_dir() or not (folder / 'reader.html').is_file():
                continue
            metadata_path = folder / 'source_map.json'
            metadata = json.loads(metadata_path.read_text(encoding='utf-8')) if metadata_path.exists() else {}
            cover_info = metadata.get('library_cover') or {}
            cover_path = folder / cover_info.get('asset', 'assets/library_cover.png')
            cover = f'/papers/{quote(folder.name)}/assets/library_cover.png' if cover_path.is_file() else None
            if cover and cover_path.name != 'library_cover.png':
                cover = f'/papers/{quote(folder.name)}/{quote(cover_info["asset"], safe="/")}'
            if cover:
                cover += f'?v={cover_path.stat().st_mtime_ns}'
            papers.append({
                'id': folder.name,
                'title': metadata.get('title') or folder.name,
                'title_zh': metadata.get('title_zh') or '',
                'authors': metadata.get('authors') or '',
                'cover': cover,
                'reader': f'/papers/{quote(folder.name)}/reader.html',
            })
        with self.lock:
            folders = self.folders()
            tags = self.tags()
        return {'papers': papers, 'folders': folders, **tags}

    def change(self, action, payload):
        with self.lock:
            folders = self.folders()
            if action == 'create':
                name = str(payload.get('name', '')).strip()
                if not name:
                    raise ValueError('请输入文件夹名称。')
                if any(f['name'].casefold() == name.casefold() for f in folders):
                    raise ValueError('已存在同名文件夹。')
                folders.append({'id': uuid.uuid4().hex, 'name': name, 'papers': []})
            else:
                folder = next((f for f in folders if f['id'] == payload.get('folder_id')), None)
                if folder is None:
                    raise ValueError('文件夹不存在，请刷新后重试。')
                if action == 'rename':
                    name = str(payload.get('name', '')).strip()
                    if not name:
                        raise ValueError('请输入文件夹名称。')
                    if any(f['id'] != folder['id'] and f['name'].casefold() == name.casefold() for f in folders):
                        raise ValueError('已存在同名文件夹。')
                    folder['name'] = name
                elif action == 'delete':
                    folders.remove(folder)
                elif action == 'membership':
                    paper = str(payload.get('paper_id', ''))
                    if not (self.papers / paper / 'reader.html').is_file():
                        raise ValueError('论文不存在，请刷新后重试。')
                    if payload.get('selected'):
                        if paper not in folder['papers']:
                            folder['papers'].append(paper)
                    elif paper in folder['papers']:
                        folder['papers'].remove(paper)
                else:
                    raise ValueError('不支持的操作。')
            self.save_folders(folders)
        return {'ok': True}


class Handler(BaseHTTPRequestHandler):
    def json_response(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def send_file(self, path, heartbeat=False):
        if not path.is_file():
            self.send_error(404)
            return
        content = None
        if heartbeat:
            content = path.read_bytes()
            script = (b'<link rel="stylesheet" href="/reader_notes.css">'
                      b'<script src="/reader_notes.js" defer></script>'
                      b"<script>setInterval(()=>fetch('/api/pulse',{cache:'no-store'}).catch(()=>{}),5000)</script>")
            position = content.rfind(b'</body>')
            content = content[:position] + script + content[position:] if position >= 0 else content + script
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(path.name)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content) if content is not None else path.stat().st_size))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if content is not None:
            self.wfile.write(content)
        else:
            with path.open('rb') as f:
                shutil.copyfileobj(f, self.wfile)

    def do_GET(self):
        self.server.last_activity = time.monotonic()
        url = urlsplit(self.path)
        path = unquote(url.path)
        if path == '/api/library':
            self.json_response(200, self.server.library.scan())
        elif path == '/api/pulse':
            self.json_response(200, {'service': 'paper-reader-library'})
        elif path == '/api/notes':
            try:
                paper_id = parse_qs(url.query).get('paper', [''])[0]
                self.json_response(200, {'notes': self.server.library.notes.get(paper_id)})
            except (ValueError, OSError) as exc:
                self.json_response(400, {'error': str(exc)})
        elif path == '/':
            self.send_file(ROOT / 'library' / 'index.html')
        elif path in ('/library.css', '/library.js', '/reader_notes.css', '/reader_notes.js'):
            self.send_file(ROOT / 'library' / path.lstrip('/'))
        elif path.startswith('/papers/'):
            base = self.server.library.papers.resolve()
            target = (base / path.removeprefix('/papers/')).resolve()
            if not target.is_relative_to(base):
                self.send_error(404)
                return
            self.send_file(target, heartbeat=target.name == 'reader.html')
        else:
            self.send_error(404)

    def do_POST(self):
        self.server.last_activity = time.monotonic()
        path = urlsplit(self.path).path
        if not path.startswith(('/api/folders/', '/api/tags/')) and path != '/api/notes':
            self.send_error(404)
            return
        if self.headers.get('Content-Type', '').split(';', 1)[0].strip().lower() != 'application/json':
            self.json_response(400, {'error': '请求格式无效。'})
            return
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            if path == '/api/notes':
                result = {'notes': self.server.library.notes.change(payload.get('paper_id', ''), payload.get('action'), payload.get('note', {}))}
            elif path.startswith('/api/tags/'):
                result = self.server.library.change_tag(path.rsplit('/', 1)[-1], payload)
            else:
                result = self.server.library.change(path.rsplit('/', 1)[-1], payload)
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            self.json_response(400, {'error': str(exc)})
            return
        self.json_response(200, result)

    def log_message(self, format, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--idle-timeout', type=int, default=120, help='Seconds without an open reader before shutdown')
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}/'
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        try:
            with urlopen(url + 'api/pulse', timeout=2) as response:
                status = json.load(response)
                running = isinstance(status, dict) and status.get('service') == 'paper-reader-library'
        except (OSError, ValueError):
            running = False
        if running:
            if not args.no_open:
                webbrowser.open(url)
        else:
            message = f'端口 {args.port} 已被其他程序占用，无法启动文献库。'
            if sys.stderr is not None:
                print(message, file=sys.stderr)
            elif sys.platform == 'win32':
                import ctypes
                ctypes.windll.user32.MessageBoxW(None, message, '文献库', 0x10)
        return
    server.library = Library(ROOT)
    server.timeout = 1
    server.last_activity = time.monotonic()
    url = f'http://127.0.0.1:{server.server_port}/'
    if sys.stdout is not None:
        print(f'文献库已启动：{url}', flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        while time.monotonic() - server.last_activity < args.idle_timeout:
            server.handle_request()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
