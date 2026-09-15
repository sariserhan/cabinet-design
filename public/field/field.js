'use strict';
const $ = (id) => document.getElementById(id),
  KEY = 'kitchen-field-device-v1';
let records = {},
  selected = '',
  storedRaw = null,
  readyOffline = false;
const photoPattern = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
function message(text) {
  $('message').textContent = text;
}
function validateCloseout(c, id) {
  if (
    !c ||
    c.format !== 'kitchen-closeout-v1' ||
    c.designId !== id ||
    !Array.isArray(c.tasks) ||
    c.tasks.length > 60 ||
    typeof c.care !== 'string' ||
    c.care.length > 4000
  )
    throw Error('Invalid closeout data.');
  const ids = new Set();
  let photos = 0;
  for (const t of c.tasks) {
    for (const [key, max] of [
      ['id', 100],
      ['room', 100],
      ['title', 160],
      ['note', 2000],
      ['assignee', 120],
    ]) {
      if (
        typeof t[key] !== 'string' ||
        t[key].length > max ||
        (['id', 'room', 'title'].includes(key) && !t[key].trim())
      )
        throw Error('Invalid field task.');
    }
    if (
      ids.has(t.id) ||
      !['open', 'done'].includes(t.status) ||
      !['check', 'punch'].includes(t.kind)
    )
      throw Error('Invalid task identifiers or status.');
    ids.add(t.id);
    if (t.photo) {
      photos++;
      if (
        typeof t.photo !== 'string' ||
        t.photo.length > 12000 ||
        !photoPattern.test(t.photo)
      )
        throw Error('Invalid photo.');
    }
  }
  if (photos > 8) throw Error('Keep at most eight photos.');
}
function validatePackage(p) {
  if (
    p?.format !== 'kitchen-field-v1' ||
    typeof p.designJson !== 'string' ||
    p.designJson.length > 500000
  )
    throw Error('Choose a Kitchen Studio field package.');
  const d = JSON.parse(p.designJson);
  if (
    d.format !== 'kitchen-studio-v1' ||
    typeof d.id !== 'string' ||
    !d.id ||
    typeof d.name !== 'string' ||
    !d.room ||
    !Array.isArray(d.items) ||
    d.items.length > 100
  )
    throw Error('Invalid project design.');
  validateCloseout(p.source, d.id);
  return d;
}
function persist(next) {
  const raw = JSON.stringify(next);
  if (raw.length > 5500000)
    throw Error(
      'Device storage limit reached. Export and remove another project.',
    );
  if (localStorage.getItem(KEY) !== storedRaw)
    throw Error(
      'Device records changed in another tab. Reload before editing.',
    );
  localStorage.setItem(KEY, raw);
  storedRaw = raw;
  records = next;
}
function connectivity() {
  $('connectivity').textContent =
    `${navigator.onLine ? 'Connection available' : 'Offline'} · ${readyOffline ? 'Ready offline: field page assets saved on this device.' : 'Offline page is not ready yet. Keep this page open online.'}`;
}
async function offlineReady() {
  try {
    if (!('serviceWorker' in navigator))
      throw Error('Offline page caching is unavailable in this browser.');
    await navigator.serviceWorker.register('/field/sw.js', {
      scope: '/field/',
    });
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      readyOffline = event.data === true;
      connectivity();
    };
    registration.active.postMessage('CHECK_READY', [channel.port2]);
  } catch (error) {
    message(error.message);
  }
  connectivity();
}
function syncLabel(record) {
  $('sync').textContent =
    record.exportedRevision === record.revision
      ? 'Return report exported. Import it in the main project to transfer findings; transfer is not verified here.'
      : 'Saved on this device · findings pending export and transfer to the main project.';
}
function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function control(label, value, type, onchange) {
  const wrap = node('label', label),
    el = node(
      type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input',
    );
  if (type === 'select') {
    for (const status of ['open', 'done']) {
      const option = node('option', status);
      option.value = status;
      el.append(option);
    }
  } else if (type !== 'textarea') el.type = type;
  el.value = value;
  el.setAttribute('aria-label', label);
  el.addEventListener('change', () => onchange(el.value));
  wrap.append(el);
  return wrap;
}
function editTask(id, change) {
  try {
    const old = records[selected];
    if (!old) throw Error('Open a project first.');
    const next = structuredClone(old);
    next.returned.tasks = next.returned.tasks.map((t) =>
      t.id === id ? { ...t, ...change } : t,
    );
    delete next.returned.signoff;
    validateCloseout(next.returned, selected);
    next.revision++;
    persist({ ...records, [selected]: next });
    message('Finding saved on this device.');
    renderProject();
  } catch (e) {
    message(e.message);
    renderProject();
  }
}
async function photo(file) {
  if (!file.type.startsWith('image/') || file.size > 10000000)
    throw Error('Choose an image smaller than 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'),
      ratio = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas
      .getContext('2d')
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const q of [0.7, 0.5, 0.3, 0.15]) {
      const result = canvas.toDataURL('image/jpeg', q);
      if (result.length <= 12000) return result;
    }
    throw Error('Crop the photo before adding it.');
  } finally {
    bitmap.close();
  }
}
function renderProject() {
  const focused = $('tasks').contains(document.activeElement)
    ? document.activeElement.getAttribute('aria-label')
    : null;
  const r = records[selected];
  $('project').hidden = !r;
  $('remove').disabled = !r;
  if (!r) return;
  const d = JSON.parse(r.package.designJson);
  $('name').textContent = d.name;
  $('room').textContent =
    `${d.room.width} × ${d.room.depth} × ${d.room.height} in · downloaded ${r.package.exportedAt}`;
  syncLabel(r);
  $('items').replaceChildren(
    ...d.items.map((i) =>
      node(
        'p',
        `${i.sku} · ${i.width}×${i.depth}×${i.height} in · item ${i.id}`,
      ),
    ),
  );
  const taskNodes = r.returned.tasks.map((t) => {
    const card = node('article');
    card.className = 'card';
    card.append(
      node('h3', `${t.room} · ${t.title}`),
      control(`Status: ${t.title}`, t.status, 'select', (value) =>
        editTask(t.id, { status: value }),
      ),
      control(`Assigned to: ${t.title}`, t.assignee, 'text', (value) =>
        editTask(t.id, { assignee: value }),
      ),
      control(`Findings: ${t.title}`, t.note, 'textarea', (value) =>
        editTask(t.id, { note: value }),
      ),
    );
    const label = node('label', `Photo: ${t.title}`),
      input = node('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('aria-label', `Photo: ${t.title}`);
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const source = records[selected],
        projectId = selected;
      try {
        const result = await photo(f);
        if (selected !== projectId || records[selected] !== source)
          throw Error('Project changed while processing photo. Try again.');
        editTask(t.id, { photo: result });
      } catch (e) {
        message(e.message);
      }
    };
    label.append(input);
    card.append(label);
    if (t.photo) {
      const img = node('img');
      img.src = t.photo;
      img.alt = `Evidence: ${t.title}`;
      const remove = node('button', 'Remove photo');
      remove.onclick = () => {
        const copy = { ...t };
        delete copy.photo;
        const current = records[selected];
        try {
          const next = structuredClone(current);
          next.returned.tasks = next.returned.tasks.map((row) =>
            row.id === t.id ? copy : row,
          );
          delete next.returned.signoff;
          next.revision++;
          persist({ ...records, [selected]: next });
          renderProject();
        } catch (e) {
          message(e.message);
        }
      };
      card.append(img, remove);
    }
    return card;
  });
  $('tasks').replaceChildren(...taskNodes);
  if (focused)
    Array.from($('tasks').querySelectorAll('[aria-label]'))
      .find((el) => el.getAttribute('aria-label') === focused)
      ?.focus();
}
function render() {
  const select = $('projects');
  select.replaceChildren(node('option', 'Choose a project'));
  select.firstChild.value = '';
  for (const [id, r] of Object.entries(records)) {
    const option = node('option', JSON.parse(r.package.designJson).name);
    option.value = id;
    select.append(option);
  }
  select.value = selected;
  renderProject();
}
$('import').onchange = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2300000) throw Error('Field package exceeds 2.3 MB.');
    const p = JSON.parse(await file.text()),
      d = validatePackage(p);
    if (records[d.id])
      throw Error(
        'This project is already on the device. Export its findings and remove the device copy before importing a newer package.',
      );
    if (Object.keys(records).length >= 3)
      throw Error('Keep at most three device projects.');
    const returned = structuredClone(p.source);
    delete returned.signoff;
    persist({
      ...records,
      [d.id]: { package: p, returned, revision: 0, exportedRevision: -1 },
    });
    selected = d.id;
    render();
    message('Project saved on this device.');
  } catch (e) {
    message(e.message);
  }
};
$('projects').onchange = (e) => {
  selected = e.target.value;
  renderProject();
};
$('add').onsubmit = (event) => {
  event.preventDefault();
  try {
    const r = records[selected];
    if (!r) throw Error('Open a project first.');
    const next = structuredClone(r);
    next.returned.tasks.push({
      id: crypto.randomUUID(),
      room: $('finding-room').value.trim(),
      title: $('finding-title').value.trim(),
      kind: $('finding-kind').value,
      status: 'open',
      note: '',
      assignee: '',
    });
    delete next.returned.signoff;
    validateCloseout(next.returned, selected);
    next.revision++;
    persist({ ...records, [selected]: next });
    $('finding-title').value = '';
    renderProject();
    message('Finding saved on this device.');
  } catch (e) {
    message(e.message);
  }
};
$('export').onclick = () => {
  try {
    const r = records[selected];
    if (!r) return;
    const report = {
      format: 'kitchen-field-report-v1',
      reportId: crypto.randomUUID(),
      designJson: r.package.designJson,
      source: r.package.source,
      returned: r.returned,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: 'application/json',
        }),
      ),
      a = node('a');
    a.href = url;
    a.download = 'kitchen-field-return.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    persist({ ...records, [selected]: { ...r, exportedRevision: r.revision } });
    syncLabel(records[selected]);
    message('Return report exported. Import it in the main project.');
  } catch (e) {
    message(e.message);
  }
};
$('remove').onclick = () => {
  if (!selected) return;
  if (
    !confirm(
      'Remove this device copy? Export its return report first; unexported findings will be lost.',
    )
  )
    return;
  try {
    const next = { ...records };
    delete next[selected];
    persist(next);
    selected = '';
    render();
    message('Device copy removed.');
  } catch (e) {
    message(e.message);
  }
};
$('print').onclick = () => window.print();
try {
  storedRaw = localStorage.getItem(KEY);
  if (storedRaw) {
    const data = JSON.parse(storedRaw);
    if (!data || Array.isArray(data) || Object.keys(data).length > 3)
      throw Error('Invalid device records.');
    for (const [id, r] of Object.entries(data)) {
      const d = validatePackage(r.package);
      if (d.id !== id) throw Error('Invalid project identifier.');
      validateCloseout(r.returned, id);
    }
    records = data;
    selected = Object.keys(records)[0] ?? '';
  }
  render();
} catch (e) {
  message(
    `Could not load device records: ${e.message}. Existing data retained.`,
  );
}
window.addEventListener('online', connectivity);
window.addEventListener('offline', connectivity);
offlineReady();
