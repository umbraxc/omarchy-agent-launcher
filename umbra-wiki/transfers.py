"""Resumable, verified downloads shared by Linux and Windows.

Queues are persisted at transitions, not on every packet. A failed item does
not block its neighbours. Nothing is published under its final name until
validation succeeds; pause/restart keeps the .part file.
"""
import hashlib
import http.client
import json
import os
import re
import threading
import urllib.error
import urllib.request
from pathlib import Path


class Stopped(Exception):
    pass


def fetch_file(url, target, stop, progress, *, sha256=None, pdf=False, retries=3):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    part = Path(str(target) + '.part')
    for attempt in range(retries):
        if stop.is_set():
            raise Stopped()
        try:
            have = part.stat().st_size if part.exists() else 0
            headers = {'User-Agent': 'UmbraWiki (https://github.com/umbraxc/omarchy-umbra)', 'Accept-Encoding': 'identity'}
            if have:
                headers['Range'] = f'bytes={have}-'
            try:
                response = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30)
            except urllib.error.HTTPError as e:
                if e.code == 416:
                    part.unlink(missing_ok=True)  # stale/complete partial: start clean
                raise
            with response as r:
                if r.status == 206:
                    match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+|\*)', r.headers.get('Content-Range', ''))
                    if not match or int(match[1]) != have:
                        raise ValueError('Server returned the wrong download range')
                    total = int(match[3]) if match[3] != '*' else 0
                    expected = int(match[2]) + 1
                elif r.status == 200:
                    have = 0  # source ignored Range; never append its full response
                    total = int(r.headers.get('Content-Length') or 0)
                    expected = total
                else:
                    raise ValueError(f'Unexpected download response: {r.status}')
                done = have
                progress(done, total)
                with part.open('ab' if have else 'wb') as f:
                    while True:
                        if stop.is_set():
                            raise Stopped()
                        chunk = r.read(128 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        progress(done, total)
                if expected and done != expected:
                    raise OSError('Download interrupted before the end of the file')
                if total and done < total:
                    raise OSError('Server sent only part of the file; resuming')
            if stop.is_set():
                raise Stopped()
            if pdf:
                with part.open('rb') as f:
                    start = f.read(1024)
                    f.seek(max(0, part.stat().st_size - 4096))
                    end = f.read()
                if b'%PDF-' not in start or b'%%EOF' not in end:
                    part.unlink(missing_ok=True)
                    raise ValueError('The source returned an incomplete PDF or a web page')
            if sha256:
                h = hashlib.sha256()
                with part.open('rb') as f:
                    for block in iter(lambda: f.read(1024 * 1024), b''):
                        if stop.is_set():
                            raise Stopped()
                        h.update(block)
                if h.hexdigest() != sha256:
                    part.unlink(missing_ok=True)
                    raise ValueError('Checksum mismatch; retrying a fresh copy')
            if stop.is_set():
                raise Stopped()
            os.replace(part, target)
            return
        except Stopped:
            raise
        except (OSError, ValueError, http.client.HTTPException) as exc:
            if attempt == retries - 1:
                raise exc
            if stop.wait(min(2 ** attempt, 4)):
                raise Stopped()


class Queue:
    def __init__(self, state_file, directory, catalog, *, workers=3, pdf=False, on_done=None):
        self.state_file, self.directory = Path(state_file), Path(directory)
        self.catalog, self.workers, self.pdf, self.on_done = catalog, workers, pdf, on_done
        self.lock = threading.RLock()
        self.items, self.running, self.stops = {}, set(), {}
        self.paused, self.closed = False, False

    def _save(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.state_file.with_suffix('.tmp')
        tmp.write_text(json.dumps({'paused': self.paused, 'ids': list(self.items), 'items': self.items}), encoding='utf-8')
        os.replace(tmp, self.state_file)

    def restore(self):
        with self.lock:
            try:
                saved = json.loads(self.state_file.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                return
            self.paused = bool(saved.get('paused'))
            self._add(saved.get('ids', []), saved.get('items', {}))
            self._kick()

    def _add(self, ids, previous=None):
        known = {c['id']: c for c in self.catalog()}
        for mid in dict.fromkeys(ids):
            if mid not in known or mid in self.running:
                continue
            c = known[mid]
            filename = c.get('file', mid + '.pdf')
            path = self.directory / filename
            old = (previous or {}).get(mid, {})
            part = Path(str(path) + '.part')
            self.items[mid] = {'id': mid, 'name': c.get('name', c.get('title', mid)), 'file': filename,
                               'size': c.get('size', 0), 'done': path.stat().st_size if path.exists() else part.stat().st_size if part.exists() else 0,
                               'status': 'done' if path.exists() else 'error' if old.get('status') == 'error' else 'queued',
                               'error': old.get('error', '')}
        self._save()

    def add(self, ids):
        with self.lock:
            if not self.running and not any(x['status'] in ('queued', 'downloading', 'paused') for x in self.items.values()):
                self.items = {mid: x for mid, x in self.items.items() if x['status'] != 'done'}
            self._add(ids)
            self.paused = False
            self._save()
            self._kick()
        return self.snapshot()

    def _kick(self):
        if self.paused or self.closed:
            return
        for mid, item in self.items.items():
            if len(self.running) >= self.workers:
                break
            if mid in self.running or item['status'] not in ('queued', 'paused'):
                continue
            self.running.add(mid)
            self.stops[mid] = threading.Event()
            item.update(status='downloading', error='')
            threading.Thread(target=self._work, args=(mid,), daemon=True).start()

    def _work(self, mid):
        item, event = self.items[mid], self.stops[mid]
        state, error = 'done', ''
        path = self.directory / item['file']
        def progress(done, total):
            with self.lock:
                item['done'] = done
                if total:
                    item['size'] = total
        try:
            c = next(c for c in self.catalog() if c['id'] == mid)
            fetch_file(c['url'], path, event, progress, sha256=c.get('sha256'), pdf=self.pdf)
        except Stopped:
            state = 'paused'
        except Exception as exc:
            state, error = 'error', str(exc)[:250]
        completed = False
        with self.lock:
            if item['status'] == 'cancelled':
                Path(str(path) + '.part').unlink(missing_ok=True)
                self.items.pop(mid, None)
                # A transfer that completed just before cancellation is retained.
            else:
                item.update(status=state, error=error)
                completed = state == 'done'
            self.running.discard(mid)
            self.stops.pop(mid, None)
            self._save()
            self._kick()
        if completed and self.on_done:
            try:
                self.on_done(mid)
            except Exception:
                pass  # installed bytes remain valid even if the library reload fails

    def control(self, action):
        with self.lock:
            if action == 'resume':
                self.paused = False
                for item in self.items.values():
                    if item['status'] == 'error':
                        item.update(status='queued', error='')
                self._kick()
            elif action in ('pause', 'cancel'):
                self.paused = action == 'pause'
                for mid in list(self.items):
                    item = self.items[mid]
                    if mid in self.running:
                        if action == 'cancel':
                            item['status'] = 'cancelled'
                        self.stops[mid].set()
                    elif action == 'cancel':
                        Path(str(self.directory / item['file']) + '.part').unlink(missing_ok=True)
                        del self.items[mid]
                if action == 'pause':
                    for item in self.items.values():
                        if item['status'] == 'queued':
                            item['status'] = 'paused'
            else:
                raise ValueError('Unknown download action')
            self._save()
        return self.snapshot()

    def halt(self):
        # Persist intent to resume at next launch, unlike an explicit pause.
        with self.lock:
            self.closed = True
            for event in self.stops.values():
                event.set()
            self._save()

    def forget(self, mid):
        with self.lock:
            if mid in self.running:
                raise ValueError('Pause the download and wait for it to stop before removing it')
            self.items.pop(mid, None)
            self._save()

    def snapshot(self):
        with self.lock:
            items = []
            for item in self.items.values():
                x = dict(item)
                path = self.directory / x['file']
                x['installed'] = path.is_file()
                if x['installed']:
                    x['done'] = x['size'] = path.stat().st_size
                elif x['status'] == 'done':
                    x.update(status='missing', done=0)
                items.append(x)
            total = sum(x['size'] for x in items)
            done = sum(min(x['done'], x['size']) for x in items)
            errors = [x['name'] + ': ' + x['error'] for x in items if x['error']]
            active = bool(self.running) or (not self.paused and any(x['status'] == 'queued' for x in items))
            return {'items': items, 'active': active, 'paused': self.paused,
                    'done': done, 'total': total, 'percent': round(done * 100 / total) if total else 0,
                    'error': '; '.join(errors), 'concurrency': self.workers}
