"""Persistent references to user-owned library files. Files are never moved or deleted."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path

SUPPORTED = {'.zim': 'zim', '.pdf': 'pdf', '.txt': 'text', '.md': 'text', '.markdown': 'text',
             '.csv': 'text', '.log': 'text', '.html': 'text', '.htm': 'text', '.json': 'text'}


class Links:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.state = self.data_dir / 'linked-library.json'
        self.index_dir = self.data_dir / 'linked-index'
        self.lock = threading.RLock()
        self.paths = []
        self.indices = {}
        try:
            saved = json.loads(self.state.read_text(encoding='utf-8'))
            self.paths = [p for p in saved.get('paths', []) if isinstance(p, str)]
            self.indices = {p: k for p, k in saved.get('indices', {}).items()
                            if p in self.paths and re.fullmatch(r'[0-9a-f]{64}', k)}
        except (OSError, ValueError, AttributeError):
            pass

    def _save(self):
        self.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.state.with_suffix('.tmp')
        tmp.write_text(json.dumps({'paths': self.paths, 'indices': self.indices}, indent=2), encoding='utf-8')
        os.replace(tmp, self.state)

    def add(self, paths):
        checked = []
        for raw in paths[:50]:
            path = str(Path(raw).expanduser().resolve())
            p = Path(path)
            if not p.is_file() or p.suffix.lower() not in SUPPORTED:
                raise ValueError(f'Unsupported or missing file: {p.name}')
            if not os.access(path, os.R_OK):
                raise ValueError(f'Cannot read: {p.name}')
            if p.suffix.lower() == '.zim':
                with p.open('rb') as f:
                    if f.read(4) != b'ZIM\x04':
                        raise ValueError(f'Not a ZIM archive: {p.name}')
            if p.suffix.lower() == '.pdf':
                with p.open('rb') as f:
                    if b'%PDF-' not in f.read(1024):
                        raise ValueError(f'Not a PDF: {p.name}')
            checked.append(path)
        with self.lock:
            for path in checked:
                if path not in self.paths:
                    self.paths.append(path)
            self._save()
        return self.list()

    def remove(self, path):
        with self.lock:
            self.paths = [p for p in self.paths if p != path]
            key = self.indices.pop(path, None)
            if key:
                (self.index_dir / (key + '.txt')).unlink(missing_ok=True)
            self._save()
        return self.list()

    def list(self):
        with self.lock:
            paths = list(self.paths)
        out = []
        for path in paths:
            p = Path(path)
            kind = SUPPORTED.get(p.suffix.lower(), '')
            available = p.is_file() and os.access(path, os.R_OK)
            out.append({'path': path, 'name': p.name, 'kind': kind, 'available': available,
                        'size': p.stat().st_size if available else 0})
        return out

    def zims(self):
        return [x['path'] for x in self.list() if x['kind'] == 'zim' and x['available']]

    def _text(self, item):
        path = item['path']
        p = Path(path)
        stamp = f'{p.stat().st_mtime_ns}:{p.stat().st_size}'
        key = hashlib.sha256((path + stamp).encode()).hexdigest()
        cache = self.index_dir / (key + '.txt')
        if cache.is_file():
            with self.lock:
                if self.indices.get(path) != key:
                    self.indices[path] = key
                    self._save()
            return cache.read_text(encoding='utf-8', errors='replace')
        if item['kind'] == 'pdf':
            if shutil.which('pdftotext'):
                proc = subprocess.run(['pdftotext', path, '-'], capture_output=True, timeout=90)
                if proc.returncode:
                    raise ValueError(f'Could not read PDF: {item["name"]}')
                body = proc.stdout.decode('utf-8', 'replace')
            else:
                try:
                    from pypdf import PdfReader
                except ImportError as exc:
                    raise ValueError('PDF search needs pypdf or pdftotext') from exc
                reader = PdfReader(path)
                body = '\n'.join(page.extract_text() or '' for page in reader.pages)
        else:
            body = p.read_bytes()[:8_000_000].decode('utf-8', 'replace')
        body = body[:8_000_000]
        self.index_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.index_dir / (key + '.' + str(threading.get_ident()) + '.tmp')
        tmp.write_text(body, encoding='utf-8')
        os.replace(tmp, cache)
        with self.lock:
            old = self.indices.get(path)
            self.indices[path] = key
            self._save()
            if old and old != key:
                (self.index_dir / (old + '.txt')).unlink(missing_ok=True)
        return body

    def search(self, terms, limit=2):
        words = [t.lower()[:5] for t in terms if len(t) > 2]
        if not words:
            return []
        found = []
        for item in self.list():
            if not item['available'] or item['kind'] == 'zim':
                continue
            try:
                body = self._text(item)
            except Exception:
                continue
            chunks = re.split(r'\n\s*\n|\f', body)
            best = None
            for chunk in chunks:
                chunk = ' '.join(chunk.split())
                if len(chunk) < 35:
                    continue
                windows = [chunk[i:i + 900] for i in range(0, len(chunk), 650)] if len(chunk) > 900 else [chunk]
                for passage in windows:
                    low = passage.lower()
                    matches = sum(1 for w in words if w in low)
                    score = matches + sum(2 for w in words if w in item['name'].lower())
                    if matches >= min(2, len(words)) and (best is None or score > best[0]):
                        best = (score, passage)
            if best:
                found.append((best[0], {'kind': 'linked', 'title': item['name'], 'archive': 'Linked file',
                                        'url': 'linked:' + hashlib.sha256(item['path'].encode()).hexdigest()[:16],
                                        'passage': best[1], 'summary': best[1][:150]}))
        found.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in found[:limit]]

    def path_for_url(self, url):
        for item in self.list():
            if 'linked:' + hashlib.sha256(item['path'].encode()).hexdigest()[:16] == url and item['available']:
                return item['path']
        return None
