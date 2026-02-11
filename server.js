const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'notes.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ notes: [] }, null, 2));

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(body));
}

function sendFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf'
  };
  res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJsonBody(buffer) {
  if (!buffer.length) return {};
  return JSON.parse(buffer.toString('utf8'));
}

function normalizeLabels(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch (_err) {
      return raw.split(',').map((x) => x.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return { fields: {}, files: [] };
  const boundary = `--${boundaryMatch[1]}`;
  const parts = buffer.toString('binary').split(boundary).slice(1, -1);
  const fields = {};
  const files = [];

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const splitIndex = part.indexOf('\r\n\r\n');
    if (splitIndex === -1) continue;

    const headerText = part.slice(0, splitIndex);
    const contentBinary = part.slice(splitIndex + 4);
    const headers = Object.fromEntries(
      headerText.split('\r\n').map((line) => {
        const [key, ...rest] = line.split(':');
        return [key.toLowerCase(), rest.join(':').trim()];
      })
    );

    const disposition = headers['content-disposition'] || '';
    const nameMatch = disposition.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/);

    if (filenameMatch && filenameMatch[1]) {
      const originalName = path.basename(filenameMatch[1]);
      const safeName = `${Date.now()}-${randomUUID()}-${originalName}`;
      const savePath = path.join(UPLOAD_DIR, safeName);
      const fileBuffer = Buffer.from(contentBinary, 'binary');
      fs.writeFileSync(savePath, fileBuffer);
      files.push({
        id: randomUUID(),
        name: originalName,
        url: `/uploads/${safeName}`,
        size: fileBuffer.length,
        mimeType: headers['content-type'] || 'application/octet-stream',
        createdAt: new Date().toISOString()
      });
    } else {
      fields[name] = Buffer.from(contentBinary, 'binary').toString('utf8').trim();
    }
  }

  return { fields, files };
}

function filterNotes(notes, search, label) {
  return notes.filter((note) => {
    const inSearch = !search || [note.title, note.content, ...(note.labels || [])].join(' ').toLowerCase().includes(search.toLowerCase());
    const inLabel = !label || (note.labels || []).some((x) => x.toLowerCase() === label.toLowerCase());
    return inSearch && inLabel;
  });
}

function notFound(res) {
  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true });

  if (url.pathname === '/api/notes' && req.method === 'GET') {
    const { notes } = readData();
    const search = url.searchParams.get('search') || '';
    const label = url.searchParams.get('label') || '';
    const filtered = filterNotes(notes, search, label).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return json(res, 200, filtered);
  }

  if (url.pathname === '/api/notes' && req.method === 'POST') {
    const raw = await parseBody(req);
    const contentType = req.headers['content-type'] || '';
    const { fields, files } = parseMultipart(raw, contentType);

    const note = {
      id: randomUUID(),
      title: fields.title || '',
      content: fields.content || '',
      color: fields.color || '#fff9c4',
      pinned: fields.pinned === 'true',
      archived: false,
      labels: normalizeLabels(fields.labels),
      attachments: files,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const data = readData();
    data.notes.push(note);
    writeData(data);
    return json(res, 201, note);
  }

  const putNoteMatch = url.pathname.match(/^\/api\/notes\/([a-f0-9-]+)$/i);
  if (putNoteMatch && req.method === 'PUT') {
    const raw = await parseBody(req);
    const payload = parseJsonBody(raw);
    const data = readData();
    const note = data.notes.find((n) => n.id === putNoteMatch[1]);
    if (!note) return json(res, 404, { message: 'Note not found' });

    if (payload.title !== undefined) note.title = String(payload.title);
    if (payload.content !== undefined) note.content = String(payload.content);
    if (payload.color !== undefined) note.color = String(payload.color);
    if (payload.pinned !== undefined) note.pinned = Boolean(payload.pinned);
    if (payload.archived !== undefined) note.archived = Boolean(payload.archived);
    if (payload.labels !== undefined) note.labels = normalizeLabels(payload.labels);
    note.updatedAt = new Date().toISOString();

    writeData(data);
    return json(res, 200, note);
  }

  const delNoteMatch = url.pathname.match(/^\/api\/notes\/([a-f0-9-]+)$/i);
  if (delNoteMatch && req.method === 'DELETE') {
    const data = readData();
    const idx = data.notes.findIndex((n) => n.id === delNoteMatch[1]);
    if (idx === -1) return json(res, 404, { message: 'Note not found' });
    const [deleted] = data.notes.splice(idx, 1);
    for (const attachment of deleted.attachments || []) {
      const full = path.join(ROOT, attachment.url);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    writeData(data);
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  const delAttachmentMatch = url.pathname.match(/^\/api\/attachments\/([a-f0-9-]+)$/i);
  if (delAttachmentMatch && req.method === 'DELETE') {
    const data = readData();
    let removed = null;
    for (const note of data.notes) {
      const idx = (note.attachments || []).findIndex((a) => a.id === delAttachmentMatch[1]);
      if (idx !== -1) {
        [removed] = note.attachments.splice(idx, 1);
        note.updatedAt = new Date().toISOString();
        break;
      }
    }

    if (!removed) return json(res, 404, { message: 'Attachment not found' });
    const full = path.join(ROOT, removed.url);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    writeData(data);
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    res.end();
    return;
  }

  if (url.pathname.startsWith('/uploads/')) {
    return sendFile(res, path.join(ROOT, url.pathname));
  }

  if (url.pathname === '/' || url.pathname === '/index.html') return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  if (url.pathname.startsWith('/')) {
    const candidate = path.join(PUBLIC_DIR, url.pathname);
    if (candidate.startsWith(PUBLIC_DIR) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return sendFile(res, candidate);
    }
  }

  return notFound(res);
});

server.listen(PORT, () => {
  console.log(`Keep-style app running on http://localhost:${PORT}`);
});
