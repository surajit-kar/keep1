const searchInput = document.getElementById('searchInput');
const titleInput = document.getElementById('titleInput');
const contentInput = document.getElementById('contentInput');
const labelsInput = document.getElementById('labelsInput');
const fileInput = document.getElementById('fileInput');
const colorInput = document.getElementById('colorInput');
const pinInput = document.getElementById('pinInput');
const saveBtn = document.getElementById('saveBtn');
const pinnedGrid = document.getElementById('pinnedGrid');
const otherGrid = document.getElementById('otherGrid');
const noteTemplate = document.getElementById('noteTemplate');

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function clearEditor() {
  titleInput.value = '';
  contentInput.value = '';
  labelsInput.value = '';
  fileInput.value = '';
  colorInput.value = '#fff9c4';
  pinInput.checked = false;
}

function renderNote(note) {
  const node = noteTemplate.content.firstElementChild.cloneNode(true);
  node.style.background = note.color || '#fff9c4';
  node.querySelector('h3').textContent = note.title || 'Untitled';
  node.querySelector('.content').textContent = note.content || '';

  const labelsWrap = node.querySelector('.labels');
  (note.labels || []).forEach((label) => {
    const span = document.createElement('span');
    span.className = 'label';
    span.textContent = label;
    labelsWrap.appendChild(span);
  });

  const attachmentsWrap = node.querySelector('.attachments');
  (note.attachments || []).forEach((attachment) => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = `📎 ${attachment.name}`;
    attachmentsWrap.appendChild(link);
  });

  node.querySelector('[data-action="togglePin"]').addEventListener('click', async () => {
    await api(`/api/notes/${note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !note.pinned })
    });
    await loadNotes();
  });

  node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await api(`/api/notes/${note.id}`, { method: 'DELETE' });
    await loadNotes();
  });

  return node;
}

async function loadNotes() {
  const query = new URLSearchParams();
  if (searchInput.value.trim()) query.set('search', searchInput.value.trim());

  const notes = await api(`/api/notes?${query.toString()}`);
  pinnedGrid.innerHTML = '';
  otherGrid.innerHTML = '';

  notes.forEach((note) => {
    const card = renderNote(note);
    if (note.pinned) pinnedGrid.appendChild(card);
    else otherGrid.appendChild(card);
  });
}

saveBtn.addEventListener('click', async () => {
  const form = new FormData();
  form.append('title', titleInput.value.trim());
  form.append('content', contentInput.value.trim());
  form.append('labels', labelsInput.value);
  form.append('color', colorInput.value);
  form.append('pinned', String(pinInput.checked));
  Array.from(fileInput.files).forEach((file) => form.append('attachments', file));

  await api('/api/notes', { method: 'POST', body: form });
  clearEditor();
  await loadNotes();
});

searchInput.addEventListener('input', () => {
  loadNotes().catch((err) => console.error(err));
});

loadNotes().catch((err) => console.error(err));
