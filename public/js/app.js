/* === Planning Rhéophérèse - Main App === */

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const SLOT_LABELS = { 1: '6h', 2: '11h', 3: '17h' };
const CANCEL_REASONS_FR = {
  medical: 'Raison médicale',
  patient_absence: 'Absence patient',
  staff_absence: 'Absence personnel'
};

// === State ===
let currentYear, currentMonth;
let sessions = [];
let patients = [];
let allLines = [];
let analyticsMode = 'monthly';
let analyticsYear, analyticsMonth;
let chartTypes = null, chartCancellations = null, chartActivity = null;

// === Socket.IO ===
const socket = io();

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  analyticsYear = currentYear;
  analyticsMonth = currentMonth;

  setupNavigation();
  setupCalendarControls();
  setupFilters();
  setupSessionModal();
  setupCancelModal();
  setupPatientModal();
  setupLineModal();
  setupContextMenu();
  setupAnalytics();
  setupExports();

  loadMonth();
  loadPatients();
  loadLines();

  socket.on('session:created', (s) => { updateSessionInList(s); renderCalendar(); });
  socket.on('session:updated', (s) => { updateSessionInList(s); renderCalendar(); });
  socket.on('session:deleted', (s) => { sessions = sessions.filter(x => x.id !== s.id); renderCalendar(); });
});

function updateSessionInList(s) {
  const idx = sessions.findIndex(x => x.id === s.id);
  if (idx >= 0) sessions[idx] = s;
  else sessions.push(s);
}

// === API helpers ===
async function api(url, options = {}) {
  if (options.body && typeof options.body === 'object') {
    options.body = JSON.stringify(options.body);
    options.headers = { 'Content-Type': 'application/json', ...options.headers };
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || 'Erreur', 'error');
    throw new Error(data.error);
  }
  return data;
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// === Navigation ===
function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');

      if (btn.dataset.view === 'analytics') loadAnalytics();
      if (btn.dataset.view === 'patients') loadPatients();
      if (btn.dataset.view === 'lines') loadLines();
    });
  });
}

// === Calendar ===
function getMonthKey(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function setupCalendarControls() {
  document.getElementById('btn-prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    loadMonth();
  });
  document.getElementById('btn-next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadMonth();
  });
  document.getElementById('btn-today').addEventListener('click', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    loadMonth();
  });
}

async function loadMonth() {
  const monthKey = getMonthKey(currentYear, currentMonth);
  document.getElementById('current-month-label').textContent = `${MOIS[currentMonth]} ${currentYear}`;
  socket.emit('join-month', monthKey);

  try {
    sessions = await api(`/api/sessions?month=${monthKey}`);
  } catch (e) {
    sessions = [];
  }
  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const workDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(currentYear, currentMonth, d);
    const dow = date.getDay();
    if (dow !== 0) {
      workDays.push({
        day: d,
        dow,
        dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      });
    }
  }

  const weeks = [];
  let currentWeek = [null, null, null, null, null, null];
  for (const wd of workDays) {
    const idx = wd.dow - 1;
    if (idx <= (currentWeek.findIndex(x => x !== null) === -1 ? 5 : currentWeek.reduce((max, x, i) => x !== null ? i : max, -1))) {
      if (currentWeek[idx] !== null) {
        weeks.push(currentWeek);
        currentWeek = [null, null, null, null, null, null];
      }
    }
    currentWeek[idx] = wd;
  }
  if (currentWeek.some(x => x !== null)) weeks.push(currentWeek);

  const showTandem = document.getElementById('filter-tandem').checked;
  const showIsolee = document.getElementById('filter-isolee').checked;
  const showCancelled = document.getElementById('filter-cancelled').checked;
  const showActive = document.getElementById('filter-active').checked;

  const cornerHeader = document.createElement('div');
  cornerHeader.className = 'calendar-header';
  cornerHeader.textContent = '';
  grid.appendChild(cornerHeader);

  JOURS.forEach(j => {
    const h = document.createElement('div');
    h.className = 'calendar-header';
    h.textContent = j;
    grid.appendChild(h);
  });

  weeks.forEach(week => {
    [1, 2, 3].forEach((slot, slotIdx) => {
      if (slotIdx === 0) {
        const spacer = document.createElement('div');
        spacer.className = 'calendar-slot-label';
        spacer.style.gridRow = 'span 3';
        const firstDay = week.find(x => x !== null);
        if (firstDay) {
          spacer.textContent = `S${getWeekNumber(new Date(currentYear, currentMonth, firstDay.day))}`;
        }
        grid.appendChild(spacer);

        week.forEach(wd => {
          if (wd) {
            const dh = document.createElement('div');
            dh.className = 'calendar-day-header' + (wd.dateStr === todayStr ? ' today' : '');
            dh.innerHTML = `<span class="day-number">${wd.day}</span> <span>${JOURS[wd.dow - 1]}</span>`;
            grid.appendChild(dh);
          } else {
            const empty = document.createElement('div');
            empty.className = 'calendar-day-header';
            grid.appendChild(empty);
          }
        });
      }

      const slotLabel = document.createElement('div');
      slotLabel.className = 'calendar-slot-label';
      slotLabel.textContent = SLOT_LABELS[slot];
      grid.appendChild(slotLabel);

      week.forEach(wd => {
        const cell = document.createElement('div');
        cell.className = 'calendar-cell' + (!wd ? ' empty' : '');

        if (wd) {
          const daySessions = sessions.filter(s => s.date === wd.dateStr && s.slot === slot);
          daySessions.forEach(s => {
            const chip = createSessionChip(s, showTandem, showIsolee, showCancelled, showActive);
            cell.appendChild(chip);
          });

          cell.addEventListener('click', (e) => {
            if (e.target.closest('.session-chip')) return;
            const totalCount = daySessions.length;
            if (totalCount >= 2) {
              toast('Ce cr\u00e9neau est complet (2 patients max)', 'error');
              return;
            }
            const nextPosition = totalCount === 0 ? 1 : (daySessions.find(s => s.position === 1) ? 2 : 1);
            openSessionModal(wd.dateStr, slot, nextPosition);
          });
        }

        grid.appendChild(cell);
      });
    });
  });
}

function createSessionChip(s, showTandem, showIsolee, showCancelled, showActive) {
  const chip = document.createElement('div');
  chip.className = `session-chip ${s.type}${s.cancelled ? ' cancelled' : ''}`;
  chip.dataset.sessionId = s.id;

  if (!showTandem && s.type === 'tandem') chip.classList.add('hidden');
  if (!showIsolee && s.type === 'isolee') chip.classList.add('hidden');
  if (!showCancelled && s.cancelled) chip.classList.add('hidden');
  if (!showActive && !s.cancelled) chip.classList.add('hidden');

  let label = `${s.last_name} ${s.first_name}`;
  if (s.cancelled && s.cancel_comment) {
    label += ` (${s.cancel_comment})`;
  }
  chip.innerHTML = `<span class="chip-type">${s.type === 'tandem' ? 'T' : 'I'}</span> ${escapeHtml(label)}`;

  if (s.cancelled) {
    chip.title = `Annul\u00e9e: ${CANCEL_REASONS_FR[s.cancel_reason] || s.cancel_reason}${s.cancel_comment ? ' - ' + s.cancel_comment : ''}`;
  } else {
    chip.title = `${s.last_name} ${s.first_name} - ${s.type === 'tandem' ? 'Tandem' : 'Isol\u00e9e'}`;
  }

  chip.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(e, s);
  });

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    showContextMenu(e, s);
  });

  return chip;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// === Filters ===
function setupFilters() {
  ['filter-tandem', 'filter-isolee', 'filter-cancelled', 'filter-active'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderCalendar);
  });
}

// === Context Menu ===
function setupContextMenu() {
  document.addEventListener('click', () => {
    document.getElementById('session-context-menu').classList.remove('active');
  });
}

function showContextMenu(e, session) {
  const menu = document.getElementById('session-context-menu');
  menu.classList.add('active');

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 160);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  menu.querySelector('[data-action="cancel"]').style.display = session.cancelled ? 'none' : 'block';
  menu.querySelector('[data-action="restore"]').style.display = session.cancelled ? 'block' : 'none';

  menu.querySelector('[data-action="edit"]').onclick = (ev) => {
    ev.stopPropagation();
    menu.classList.remove('active');
    openEditSessionModal(session);
  };
  menu.querySelector('[data-action="cancel"]').onclick = (ev) => {
    ev.stopPropagation();
    menu.classList.remove('active');
    openCancelModal(session);
  };
  menu.querySelector('[data-action="restore"]').onclick = async (ev) => {
    ev.stopPropagation();
    menu.classList.remove('active');
    try {
      await api(`/api/sessions/${session.id}/restore`, { method: 'PUT' });
      toast('S\u00e9ance restaur\u00e9e', 'success');
      loadMonth();
    } catch (e) {}
  };
  menu.querySelector('[data-action="delete"]').onclick = async (ev) => {
    ev.stopPropagation();
    menu.classList.remove('active');
    if (!confirm(`Supprimer d\u00e9finitivement la s\u00e9ance de ${session.last_name} ${session.first_name} ?`)) return;
    try {
      await api(`/api/sessions/${session.id}`, { method: 'DELETE' });
      toast('S\u00e9ance supprim\u00e9e', 'success');
      loadMonth();
    } catch (e) {}
  };
}

// === Session Modal ===
function setupSessionModal() {
  const modal = document.getElementById('modal-session');
  modal.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal('modal-session'));
  });

  const searchInput = document.getElementById('session-patient-search');
  const dropdown = document.getElementById('session-patient-dropdown');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 1) { dropdown.classList.remove('active'); return; }
    const matches = patients.filter(p =>
      p.last_name.toLowerCase().includes(q) || p.first_name.toLowerCase().includes(q)
    ).slice(0, 10);
    if (matches.length === 0) { dropdown.classList.remove('active'); return; }
    dropdown.innerHTML = matches.map(p =>
      `<div class="autocomplete-item" data-id="${p.id}">${escapeHtml(p.last_name)} ${escapeHtml(p.first_name)}</div>`
    ).join('');
    dropdown.classList.add('active');

    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('session-patient-id').value = item.dataset.id;
        searchInput.value = item.textContent;
        dropdown.classList.remove('active');
      });
    });
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.remove('active'), 200);
  });

  document.getElementById('form-session').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sessionId = document.getElementById('session-id').value;
    const patientId = document.getElementById('session-patient-id').value;
    const date = document.getElementById('session-date').value;
    const slot = parseInt(document.getElementById('session-slot').value);
    const position = parseInt(document.getElementById('session-position').value);
    const type = document.querySelector('input[name="session-type"]:checked').value;

    if (!patientId) { toast('Veuillez s\u00e9lectionner un patient', 'error'); return; }

    try {
      if (sessionId) {
        await api(`/api/sessions/${sessionId}`, {
          method: 'PUT',
          body: { patient_id: parseInt(patientId), date, slot, position, type }
        });
        toast('S\u00e9ance modifi\u00e9e', 'success');
      } else {
        await api('/api/sessions', {
          method: 'POST',
          body: { patient_id: parseInt(patientId), date, slot, position, type }
        });
        toast('S\u00e9ance planifi\u00e9e', 'success');
      }
      closeModal('modal-session');
      loadMonth();
    } catch (e) {}
  });
}

function openSessionModal(date, slot, position) {
  document.getElementById('session-id').value = '';
  document.getElementById('session-date').value = date;
  document.getElementById('session-slot').value = slot;
  document.getElementById('session-position').value = position;
  document.getElementById('session-patient-id').value = '';
  document.getElementById('session-patient-search').value = '';
  document.querySelector('input[name="session-type"][value="isolee"]').checked = true;
  document.getElementById('modal-session-title').textContent = 'Planifier une s\u00e9ance';

  const dateObj = new Date(date + 'T00:00:00');
  const jourLabel = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dateObj.getDay()];
  document.getElementById('session-info-label').textContent =
    `${jourLabel} ${dateObj.getDate()} ${MOIS[dateObj.getMonth()]} ${dateObj.getFullYear()} - Cr\u00e9neau ${SLOT_LABELS[slot]} - Position ${position}`;

  openModal('modal-session');
}

function openEditSessionModal(session) {
  document.getElementById('session-id').value = session.id;
  document.getElementById('session-date').value = session.date;
  document.getElementById('session-slot').value = session.slot;
  document.getElementById('session-position').value = session.position;
  document.getElementById('session-patient-id').value = session.patient_id;
  document.getElementById('session-patient-search').value = `${session.last_name} ${session.first_name}`;
  document.querySelector(`input[name="session-type"][value="${session.type}"]`).checked = true;
  document.getElementById('modal-session-title').textContent = 'Modifier la s\u00e9ance';

  const dateObj = new Date(session.date + 'T00:00:00');
  const jourLabel = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][dateObj.getDay()];
  document.getElementById('session-info-label').textContent =
    `${jourLabel} ${dateObj.getDate()} ${MOIS[dateObj.getMonth()]} ${dateObj.getFullYear()} - Cr\u00e9neau ${SLOT_LABELS[session.slot]} - Position ${session.position}`;

  openModal('modal-session');
}

// === Cancel Modal ===
function setupCancelModal() {
  const modal = document.getElementById('modal-cancel');
  modal.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal('modal-cancel'));
  });

  document.getElementById('form-cancel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sessionId = document.getElementById('cancel-session-id').value;
    const reason = document.querySelector('input[name="cancel-reason"]:checked');
    if (!reason) { toast('Veuillez s\u00e9lectionner une raison', 'error'); return; }
    const comment = document.getElementById('cancel-comment').value;

    try {
      await api(`/api/sessions/${sessionId}/cancel`, {
        method: 'PUT',
        body: { cancel_reason: reason.value, cancel_comment: comment }
      });
      toast('S\u00e9ance annul\u00e9e', 'success');
      closeModal('modal-cancel');
      loadMonth();
    } catch (e) {}
  });
}

function openCancelModal(session) {
  document.getElementById('cancel-session-id').value = session.id;
  document.getElementById('cancel-comment').value = '';
  document.querySelectorAll('input[name="cancel-reason"]').forEach(r => r.checked = false);
  openModal('modal-cancel');
}

// === Patient Modal ===
function setupPatientModal() {
  const modal = document.getElementById('modal-patient');
  modal.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal('modal-patient'));
  });

  document.getElementById('btn-add-patient').addEventListener('click', () => {
    document.getElementById('patient-id').value = '';
    document.getElementById('patient-lastname').value = '';
    document.getElementById('patient-firstname').value = '';
    document.getElementById('patient-notes').value = '';
    document.getElementById('modal-patient-title').textContent = 'Ajouter un patient';
    openModal('modal-patient');
  });

  document.getElementById('form-patient').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('patient-id').value;
    const body = {
      last_name: document.getElementById('patient-lastname').value,
      first_name: document.getElementById('patient-firstname').value,
      notes: document.getElementById('patient-notes').value
    };
    try {
      if (id) {
        await api(`/api/patients/${id}`, { method: 'PUT', body });
        toast('Patient modifi\u00e9', 'success');
      } else {
        await api('/api/patients', { method: 'POST', body });
        toast('Patient ajout\u00e9', 'success');
      }
      closeModal('modal-patient');
      loadPatients();
    } catch (e) {}
  });

  document.getElementById('patient-search').addEventListener('input', (e) => {
    renderPatients(e.target.value);
  });
}

async function loadPatients() {
  try {
    patients = await api('/api/patients');
    renderPatients();
  } catch (e) {}
}

function renderPatients(filter = '') {
  const list = document.getElementById('patients-list');
  const filtered = filter
    ? patients.filter(p => p.last_name.toLowerCase().includes(filter.toLowerCase()) || p.first_name.toLowerCase().includes(filter.toLowerCase()))
    : patients;

  list.innerHTML = filtered.map(p => `
    <div class="patient-card">
      <h4>${escapeHtml(p.last_name)} ${escapeHtml(p.first_name)}</h4>
      <p>${p.notes ? escapeHtml(p.notes) : 'Aucune note'}</p>
      <div class="patient-actions">
        <button onclick="editPatient(${p.id})">Modifier</button>
        <button class="delete-btn" onclick="deletePatient(${p.id}, '${escapeHtml(p.last_name)}')">Supprimer</button>
      </div>
    </div>
  `).join('');
}

window.editPatient = function (id) {
  const p = patients.find(x => x.id === id);
  if (!p) return;
  document.getElementById('patient-id').value = p.id;
  document.getElementById('patient-lastname').value = p.last_name;
  document.getElementById('patient-firstname').value = p.first_name;
  document.getElementById('patient-notes').value = p.notes || '';
  document.getElementById('modal-patient-title').textContent = 'Modifier le patient';
  openModal('modal-patient');
};

window.deletePatient = async function (id, name) {
  if (!confirm(`Supprimer le patient ${name} ?`)) return;
  try {
    await api(`/api/patients/${id}`, { method: 'DELETE' });
    toast('Patient supprim\u00e9', 'success');
    loadPatients();
  } catch (e) {}
};

// === Line Modal ===
function setupLineModal() {
  const modal = document.getElementById('modal-line');
  modal.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal('modal-line'));
  });

  document.getElementById('btn-add-line').addEventListener('click', () => {
    document.getElementById('line-id').value = '';
    document.getElementById('line-label').value = '';
    document.getElementById('line-placement-date').value = '';
    document.getElementById('line-disposal-date').value = '';
    document.getElementById('line-disposal-reason').value = '';
    document.getElementById('line-notes').value = '';
    document.getElementById('modal-line-title').textContent = 'Ajouter une ligne';
    openModal('modal-line');
  });

  document.getElementById('form-line').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('line-id').value;
    const body = {
      label: document.getElementById('line-label').value,
      placement_date: document.getElementById('line-placement-date').value,
      disposal_date: document.getElementById('line-disposal-date').value || null,
      disposal_reason: document.getElementById('line-disposal-reason').value || null,
      notes: document.getElementById('line-notes').value || null
    };
    try {
      if (id) {
        await api(`/api/lines/${id}`, { method: 'PUT', body });
        toast('Ligne modifi\u00e9e', 'success');
      } else {
        await api('/api/lines', { method: 'POST', body });
        toast('Ligne ajout\u00e9e', 'success');
      }
      closeModal('modal-line');
      loadLines();
    } catch (e) {}
  });
}

async function loadLines() {
  try {
    allLines = await api('/api/lines');
    renderLines();
  } catch (e) {}
}

function renderLines() {
  const list = document.getElementById('lines-list');
  list.innerHTML = allLines.map(l => `
    <div class="line-card">
      <div class="line-info">
        <h4>${escapeHtml(l.label)}</h4>
        <p>Pos\u00e9e le ${formatDate(l.placement_date)}
          ${l.disposal_date ? ` - Retir\u00e9e le ${formatDate(l.disposal_date)}` : ''}
          ${l.disposal_reason ? ` (${escapeHtml(l.disposal_reason)})` : ''}
        </p>
        ${l.notes ? `<p>${escapeHtml(l.notes)}</p>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="line-status ${l.disposal_date ? 'disposed' : 'active'}">
          ${l.disposal_date ? 'Retir\u00e9e' : 'Active'}
        </span>
        <div class="line-actions">
          <button onclick="editLine(${l.id})">Modifier</button>
          <button onclick="deleteLine(${l.id})" style="color:var(--danger)">Supprimer</button>
        </div>
      </div>
    </div>
  `).join('');
}

window.editLine = function (id) {
  const l = allLines.find(x => x.id === id);
  if (!l) return;
  document.getElementById('line-id').value = l.id;
  document.getElementById('line-label').value = l.label;
  document.getElementById('line-placement-date').value = l.placement_date;
  document.getElementById('line-disposal-date').value = l.disposal_date || '';
  document.getElementById('line-disposal-reason').value = l.disposal_reason || '';
  document.getElementById('line-notes').value = l.notes || '';
  document.getElementById('modal-line-title').textContent = 'Modifier la ligne';
  openModal('modal-line');
};

window.deleteLine = async function (id) {
  if (!confirm('Supprimer cette ligne ?')) return;
  try {
    await api(`/api/lines/${id}`, { method: 'DELETE' });
    toast('Ligne supprim\u00e9e', 'success');
    loadLines();
  } catch (e) {}
};

// === Analytics ===
function setupAnalytics() {
  document.getElementById('btn-analytics-monthly').addEventListener('click', () => {
    analyticsMode = 'monthly';
    document.getElementById('btn-analytics-monthly').classList.add('active');
    document.getElementById('btn-analytics-yearly').classList.remove('active');
    loadAnalytics();
  });
  document.getElementById('btn-analytics-yearly').addEventListener('click', () => {
    analyticsMode = 'yearly';
    document.getElementById('btn-analytics-yearly').classList.add('active');
    document.getElementById('btn-analytics-monthly').classList.remove('active');
    loadAnalytics();
  });
  document.getElementById('btn-analytics-prev').addEventListener('click', () => {
    if (analyticsMode === 'monthly') {
      analyticsMonth--;
      if (analyticsMonth < 0) { analyticsMonth = 11; analyticsYear--; }
    } else {
      analyticsYear--;
    }
    loadAnalytics();
  });
  document.getElementById('btn-analytics-next').addEventListener('click', () => {
    if (analyticsMode === 'monthly') {
      analyticsMonth++;
      if (analyticsMonth > 11) { analyticsMonth = 0; analyticsYear++; }
    } else {
      analyticsYear++;
    }
    loadAnalytics();
  });
}

async function loadAnalytics() {
  let data;
  const label = document.getElementById('analytics-period-label');

  try {
    if (analyticsMode === 'monthly') {
      const monthKey = getMonthKey(analyticsYear, analyticsMonth);
      label.textContent = `${MOIS[analyticsMonth]} ${analyticsYear}`;
      data = await api(`/api/analytics/monthly?month=${monthKey}`);
    } else {
      label.textContent = `Ann\u00e9e ${analyticsYear}`;
      data = await api(`/api/analytics/yearly?year=${analyticsYear}`);
    }
  } catch (e) { return; }

  renderStats(data);
  renderCharts(data);
}

function renderStats(data) {
  const cards = document.getElementById('stats-cards');
  cards.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${data.total}</div>
      <div class="stat-label">S\u00e9ances totales</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value">${data.active}</div>
      <div class="stat-label">S\u00e9ances r\u00e9alis\u00e9es</div>
    </div>
    <div class="stat-card danger">
      <div class="stat-value">${data.cancelled}</div>
      <div class="stat-label">S\u00e9ances annul\u00e9es</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${data.tandem}</div>
      <div class="stat-label">Tandem</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${data.isolee}</div>
      <div class="stat-label">Isol\u00e9es</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${data.patients}</div>
      <div class="stat-label">Patients</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-value">${data.cancelRate}%</div>
      <div class="stat-label">Taux d'annulation</div>
    </div>
    ${data.occupationRate !== undefined ? `
    <div class="stat-card success">
      <div class="stat-value">${data.occupationRate}%</div>
      <div class="stat-label">Taux d'occupation</div>
    </div>` : ''}
  `;
}

function renderCharts(data) {
  if (chartTypes) chartTypes.destroy();
  if (chartCancellations) chartCancellations.destroy();
  if (chartActivity) chartActivity.destroy();

  const ctxTypes = document.getElementById('chart-types').getContext('2d');
  chartTypes = new Chart(ctxTypes, {
    type: 'doughnut',
    data: {
      labels: ['Tandem', 'Isol\u00e9e'],
      datasets: [{ data: [data.tandem, data.isolee], backgroundColor: ['#3b82f6', '#22c55e'], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  const ctxCancel = document.getElementById('chart-cancellations').getContext('2d');
  chartCancellations = new Chart(ctxCancel, {
    type: 'doughnut',
    data: {
      labels: ['Raison m\u00e9dicale', 'Absence patient', 'Absence personnel'],
      datasets: [{
        data: [data.cancelReasons.medical, data.cancelReasons.patient_absence, data.cancelReasons.staff_absence],
        backgroundColor: ['#ef4444', '#f59e0b', '#8b5cf6'], borderWidth: 0
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  const ctxActivity = document.getElementById('chart-activity').getContext('2d');
  let activityLabels, activeData, cancelledData;

  if (analyticsMode === 'monthly' && data.perDay) {
    document.getElementById('chart-activity-title').textContent = 'Activit\u00e9 par jour';
    activityLabels = data.perDay.map(d => d.date.substring(8));
    activeData = data.perDay.map(d => d.active);
    cancelledData = data.perDay.map(d => d.cancelled_count);
  } else if (data.perMonth) {
    document.getElementById('chart-activity-title').textContent = 'Activit\u00e9 par mois';
    activityLabels = data.perMonth.map(m => MOIS[parseInt(m.month.split('-')[1]) - 1].substring(0, 3));
    activeData = data.perMonth.map(m => m.active);
    cancelledData = data.perMonth.map(m => m.cancelled_count);
  } else {
    activityLabels = [];
    activeData = [];
    cancelledData = [];
  }

  chartActivity = new Chart(ctxActivity, {
    type: 'bar',
    data: {
      labels: activityLabels,
      datasets: [
        { label: 'R\u00e9alis\u00e9es', data: activeData, backgroundColor: '#22c55e' },
        { label: 'Annul\u00e9es', data: cancelledData, backgroundColor: '#ef4444' }
      ]
    },
    options: {
      responsive: true,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// === Exports ===
function setupExports() {
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (analyticsMode === 'monthly') {
      window.location = `/api/exports/csv?month=${getMonthKey(analyticsYear, analyticsMonth)}`;
    } else {
      window.location = `/api/exports/csv?year=${analyticsYear}`;
    }
  });
  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    if (analyticsMode === 'monthly') {
      window.location = `/api/exports/pdf?month=${getMonthKey(analyticsYear, analyticsMonth)}`;
    } else {
      window.location = `/api/exports/pdf?year=${analyticsYear}`;
    }
  });
  document.getElementById('btn-export-lines-csv').addEventListener('click', () => {
    window.location = `/api/exports/lines-csv?year=${analyticsYear}`;
  });
}

// === Helpers ===
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}
