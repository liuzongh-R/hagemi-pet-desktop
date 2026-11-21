// Local HTTP + SSE bridge for the Electron desktop overlay window.
// Zero extra dependencies: serves the transparent desktop page, renderer bundle, art,
// custom sounds, an SSE event stream, and a POST message inbox.
import { createServer } from 'node:http';
import { readArt, rendererSource } from './renderer-source.mjs';
import { readSoundFile } from './sounds.mjs';

const MAX_BODY_BYTES = 1024 * 1024;

function desktopPageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Hagemi Pet Desktop</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: transparent !important;
    user-select: none;
    -webkit-user-select: none;
  }
</style>
</head>
<body>
<script>
(() => {
  'use strict';
  const pending = [];
  const post = payload => {
    fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  };

  window.__hagemiCall = json => {
    try {
      const m = JSON.parse(json);
      if (m.type === 'art') {
        fetch('/art?name=' + encodeURIComponent(m.name))
          .then(r => (r.ok ? r.text() : ''))
          .then(data => {
            const msg = { t: 'art', name: m.name, data };
            if (window.__hagemiPet) window.__hagemiPet.receive(msg);
            else pending.push(msg);
          })
          .catch(() => {
            const msg = { t: 'art', name: m.name, data: null };
            if (window.__hagemiPet) window.__hagemiPet.receive(msg);
            else pending.push(msg);
          });
        return;
      }
    } catch {}
    post(json);
  };

  function connectEvents() {
    const es = new EventSource('/events');
    es.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (window.__hagemiPet) {
        if (pending.length) {
          for (const item of pending.splice(0)) window.__hagemiPet.receive(item);
        }
        window.__hagemiPet.receive(message);
      } else {
        pending.push(message);
      }
    };
    es.onerror = () => {
      es.close();
      setTimeout(connectEvents, 1500);
    };
  }
  connectEvents();
})();
</script>
<script src="/pet.js"></script>
</body>
</html>`;
}

export class DesktopBridge {
  constructor({ onMessage, soundDir, port = 0, log = () => {} }) {
    this.onMessage = onMessage;
    this.soundDir = soundDir;
    this.requestedPort = port;
    this.log = log;
    this.clients = new Set();
    this.server = null;
    this.port = null;
    this.active = false;
  }

  get url() {
    return this.port ? `http://127.0.0.1:${this.port}` : null;
  }

  async start() {
    if (this.server) return this.url;
    this.server = createServer((req, res) => this.handleRequest(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.requestedPort, '127.0.0.1', () => {
        this.server.off('error', reject);
        this.port = this.server.address().port;
        this.active = true;
        resolve();
      });
    });
    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        try { client.res.write(': ping\n\n'); } catch { this.clients.delete(client); }
      }
    }, 20000);
    this.heartbeat.unref?.();
    this.log(`desktop bridge listening at ${this.url}`);
    return this.url;
  }

  async stop() {
    this.active = false;
    clearInterval(this.heartbeat);
    for (const client of this.clients) {
      try {
        client.res.write(`data: ${JSON.stringify({ t: 'bye' })}\n\n`);
        client.res.end();
      } catch {}
    }
    this.clients.clear();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise(resolve => server.close(() => resolve()));
  }

  post(session, message) {
    if (!session || session.closed) return;
    try {
      session.res.write(`data: ${JSON.stringify(message)}\n\n`);
    } catch {
      session.closed = true;
      this.clients.delete(session);
    }
  }

  broadcast(message) {
    for (const client of this.clients) {
      if (client.ready) this.post(client, message);
    }
  }

  broadcastAll(message) {
    for (const client of this.clients) this.post(client, message);
  }

  handleRequest(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(desktopPageHtml());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/pet.js') {
      const { source } = rendererSource({ standalone: true, desktop: true });
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(source);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/art') {
      const data = readArt(url.searchParams.get('name'));
      res.writeHead(data ? 200 : 404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end(data || '');
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/sounds/')) {
      const fileName = decodeURIComponent(url.pathname.slice('/sounds/'.length));
      const asset = readSoundFile(this.soundDir, fileName);
      if (!asset) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-store' });
      res.end(asset.data);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      const client = { kind: 'desktop', res, ready: true, closed: false };
      this.clients.add(client);
      req.on('close', () => {
        client.closed = true;
        this.clients.delete(client);
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/message') {
      let body = '';
      let overflow = false;
      req.setEncoding('utf8');
      req.on('data', chunk => {
        if (body.length + chunk.length > MAX_BODY_BYTES) { overflow = true; return; }
        body += chunk;
      });
      req.on('end', () => {
        if (overflow) { res.writeHead(413); res.end(); return; }
        let message;
        try { message = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
        res.writeHead(204);
        res.end();
        // Deliver reply target as all active desktop SSE clients.
        const session = {
          kind: 'desktop',
          ready: true,
          closed: false,
          broadcast: msg => this.broadcastAll(msg),
        };
        this.onMessage(message, session);
      });
      return;
    }

    res.writeHead(404);
    res.end();
  }
}
