const API = 'http://localhost:5000';
let adminToken = sessionStorage.getItem('admin_token') || '';
let adminUser  = null;
try { adminUser = JSON.parse(sessionStorage.getItem('admin_user') || 'null'); } catch(e) { adminUser = null; }
let charts = {};

function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function timeAgo(s) {
  const m = Math.floor((Date.now() - new Date(s)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

// ── Boot: show login or dashboard ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Always start with login screen visible
  // Only auto-login if we have valid-looking credentials
  if (adminToken && adminUser && adminUser.role === 'admin') {
    showDashboard();
  }
  // else login screen stays visible by default
});

// adminLogin is defined inline in admin.html for reliability

function showDashboard() {
  document.getElementById('admin-login-screen').style.display = 'none';
  document.getElementById('admin-name-top').textContent = adminUser.name || 'Admin';
  // Small delay to ensure DOM is ready before loading data
  setTimeout(() => {
    loadOverview();
    setInterval(loadOverview, 10000);
  }, 100);
}

function adminLogout() {
  sessionStorage.clear();
  adminToken = '';
  adminUser  = null;
  document.getElementById('admin-login-screen').style.display = 'flex';
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken };
}

// ── Navigation ────────────────────────────────────────────────────────────────
const TITLES = { overview:'Dashboard', alerts:'Alert Management', users:'Tourist Management', map:'Live Map', analytics:'Analytics', surveillance:'Surveillance' };

function navigate(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelector(`[data-section="${name}"]`).classList.add('active');
  document.getElementById('topbar-title').textContent = TITLES[name];
  if (name === 'alerts')       loadAlerts();
  if (name === 'users')        loadUsers();
  if (name === 'map')          initMap();
  if (name === 'analytics')    loadAnalytics();
  if (name === 'surveillance') { loadCameras(); loadIncidents(); initSurvMap(); }
}

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    navigate(a.dataset.section);
    if (window.innerWidth <= 768) toggleSidebar();
  });
});

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ── Theme ─────────────────────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('theme-icon').textContent = dark ? '🌙' : '☀️';
  document.querySelector('.theme-toggle span:last-child').textContent = dark ? 'Dark Mode' : 'Light Mode';
  if (leafletMap) leafletMap.invalidateSize();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(title, msg, type = 'alert') {
  const icons = { alert:'🚨', success:'✅', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'success' : type === 'info' ? 'info' : ''}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span>
    <div class="toast-content"><div class="toast-title">${title}</div><div class="toast-msg">${msg}</div></div>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ── Overview ──────────────────────────────────────────────────────────────────
let prevPending = -1;

async function loadOverview() {
  try {
    const [ar, ur] = await Promise.all([
      fetch(`${API}/alerts`, { headers: authHeaders() }),
      fetch(`${API}/users`,  { headers: authHeaders() })
    ]);
    const alerts = await ar.json();
    const users  = await ur.json();

    const pending  = alerts.filter(a => a.status === 'Pending').length;
    const resolved = alerts.filter(a => a.status === 'Resolved').length;

    document.getElementById('s-users').textContent    = users.length;
    document.getElementById('s-pending').textContent  = pending;
    document.getElementById('s-resolved').textContent = resolved;
    document.getElementById('s-total').textContent    = alerts.length;
    document.getElementById('last-updated-time').textContent = new Date().toLocaleTimeString();

    const badge = document.getElementById('pending-badge');
    badge.textContent = pending;
    badge.classList.toggle('show', pending > 0);

    if (prevPending >= 0 && pending > prevPending) {
      showToast('🚨 New SOS Alert!', `${pending - prevPending} new emergency alert(s)`, 'alert');
    }
    prevPending = pending;

    renderRecentAlerts(alerts.slice(0, 6));
    renderTodayChart(alerts);
  } catch (e) { console.error(e); }
}

// ── Chart view switcher ───────────────────────────────────────────────────────
let cachedAlerts = [];
let currentChartView = 'today';

function switchChart(view) {
  currentChartView = view;
  // Update button styles
  ['today','week','month'].forEach(v => {
    const btn = document.getElementById('chart-btn-' + v);
    if (!btn) return;
    btn.className = v === view ? 'btn-sm btn-primary' : 'btn-sm btn-outline';
  });
  renderTodayChart(cachedAlerts);
}

function renderTodayChart(alerts) {
  cachedAlerts = alerts;
  if (typeof Chart === 'undefined') return; // Chart.js not loaded yet
  if (currentChartView === 'week')  { renderWeekChart(alerts); return; }
  if (currentChartView === 'month') { renderMonthChart(alerts); return; }

  // Today — by hour
  if (charts['chart-today']) charts['chart-today'].destroy();
  const today = new Date().toISOString().slice(0, 10);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#8892b0' : '#64748b', gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  charts['chart-today'] = new Chart(document.getElementById('chart-today'), {
    type: 'line',
    data: {
      labels: hours.map(h => `${h}:00`),
      datasets: [{
        label: 'Alerts Today',
        data: hours.map(h => alerts.filter(a => a.created_at.startsWith(today) && new Date(a.created_at).getHours() === h).length),
        borderColor: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)',
        fill: true, tension: 0.4, pointRadius: 3
      }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: tc } } },
      scales: { x: { ticks: { color: tc, maxTicksLimit: 8 }, grid: { color: gc } }, y: { ticks: { color: tc }, grid: { color: gc }, beginAtZero: true } } }
  });
}

function renderWeekChart(alerts) {
  if (charts['chart-today']) charts['chart-today'].destroy();
  const days = getLast7Days();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#8892b0' : '#64748b', gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  charts['chart-today'] = new Chart(document.getElementById('chart-today'), {
    type: 'bar',
    data: {
      labels: days.map(d => { const dt = new Date(d); return dt.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'}); }),
      datasets: [{
        label: 'Alerts This Week',
        data: days.map(d => alerts.filter(a => a.created_at.startsWith(d)).length),
        backgroundColor: 'rgba(26,115,232,0.7)', borderColor: '#1a73e8', borderWidth: 2, borderRadius: 6
      }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: tc } } },
      scales: { x: { ticks: { color: tc }, grid: { color: gc } }, y: { ticks: { color: tc }, grid: { color: gc }, beginAtZero: true } } }
  });
}

function renderMonthChart(alerts) {
  if (charts['chart-today']) charts['chart-today'].destroy();
  const days = getLast30Days();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#8892b0' : '#64748b', gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  charts['chart-today'] = new Chart(document.getElementById('chart-today'), {
    type: 'bar',
    data: {
      labels: days.map(d => d.slice(5)), // MM-DD
      datasets: [{
        label: 'Alerts This Month',
        data: days.map(d => alerts.filter(a => a.created_at.startsWith(d)).length),
        backgroundColor: 'rgba(139,92,246,0.7)', borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 4
      }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: tc } } },
      scales: { x: { ticks: { color: tc, maxTicksLimit: 10 }, grid: { color: gc } }, y: { ticks: { color: tc }, grid: { color: gc }, beginAtZero: true } } }
  });
}

function getLast30Days() {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
}

function renderRecentAlerts(alerts) {
  const tbody = document.getElementById('recent-alerts-body');
  if (!alerts.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No alerts yet</td></tr>'; return; }
  tbody.innerHTML = alerts.map(a => `
    <tr class="${a.status === 'Pending' ? 'row-pending' : ''}">
      <td><div style="display:flex;align-items:center;gap:0.5rem">
        <div class="avatar" style="width:26px;height:26px;font-size:0.72rem">${a.name[0].toUpperCase()}</div>${a.name}
      </div></td>
      <td>${a.message}</td>
      <td><span class="badge badge-${a.status.toLowerCase()}">${a.status === 'Pending' ? '🔴' : '✅'} ${a.status}</span></td>
      <td style="font-size:0.78rem;color:var(--muted)">${timeAgo(a.created_at)}</td>
      <td>${a.status === 'Pending'
        ? `<button class="btn-sm btn-success" onclick="resolveAlert(${a.id}, this)">✅ Resolve</button>`
        : '<span style="color:var(--muted);font-size:0.8rem">Done</span>'}</td>
    </tr>`).join('');
}

// ── Alerts ────────────────────────────────────────────────────────────────────
let allAlerts = [], alertPage = 1;
const PAGE_SIZE = 10;

async function loadAlerts() {
  try {
    const res = await fetch(`${API}/alerts`, { headers: authHeaders() });
    allAlerts = await res.json();
    alertPage = 1;
    applyFilters();
  } catch {
    document.getElementById('alerts-body').innerHTML = '<tr><td colspan="8" class="empty">Failed to load</td></tr>';
  }
}

function applyFilters() {
  const q      = (document.getElementById('search-input')?.value || '').toLowerCase();
  const status = document.getElementById('filter-status')?.value || 'all';
  const date   = document.getElementById('filter-date')?.value || '';
  const filtered = allAlerts.filter(a =>
    (!q      || a.name.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)) &&
    (status === 'all' || a.status === status) &&
    (!date   || a.created_at.startsWith(date))
  );
  renderAlertsTable(filtered);
}

function clearFilters() {
  const si = document.getElementById('search-input');
  const fs = document.getElementById('filter-status');
  const fd = document.getElementById('filter-date');
  if (si) si.value = '';
  if (fs) fs.value = 'all';
  if (fd) fd.value = '';
  // Always reload from server to guarantee fresh data
  loadAlerts();
}

function renderAlertsTable(alerts) {
  const tbody = document.getElementById('alerts-body');
  const pages = Math.ceil(alerts.length / PAGE_SIZE);
  const slice = alerts.slice((alertPage - 1) * PAGE_SIZE, alertPage * PAGE_SIZE);

  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No alerts found</td></tr>';
    document.getElementById('alerts-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = slice.map((a, i) => {
    const loc = a.latitude
      ? `<a href="https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}" target="_blank" style="color:#1a73e8;font-size:0.78rem">📍 ${parseFloat(a.latitude).toFixed(4)}, ${parseFloat(a.longitude).toFixed(4)}</a>`
      : '<span style="color:var(--muted)">N/A</span>';
    return `
    <tr class="${a.status === 'Pending' ? 'row-pending' : ''}">
      <td style="color:var(--muted)">${(alertPage-1)*PAGE_SIZE+i+1}</td>
      <td><div style="display:flex;align-items:center;gap:0.4rem">
        <div class="avatar" style="width:26px;height:26px;font-size:0.72rem">${a.name[0].toUpperCase()}</div>${a.name}
      </div></td>
      <td style="color:var(--muted);font-size:0.8rem">${a.email}</td>
      <td>${a.message}</td>
      <td>${loc}</td>
      <td><span class="badge badge-${a.status.toLowerCase()}">${a.status === 'Pending' ? '🔴' : '✅'} ${a.status}</span></td>
      <td style="font-size:0.78rem;color:var(--muted);white-space:nowrap">${new Date(a.created_at).toLocaleString()}</td>
      <td>${a.status === 'Pending'
        ? `<button class="btn-sm btn-success" onclick="resolveAlert(${a.id}, this)">✅ Resolve</button>`
        : '<span style="color:var(--muted);font-size:0.8rem">Done</span>'}</td>
    </tr>`;
  }).join('');

  document.getElementById('alerts-pagination').innerHTML =
    Array.from({ length: pages }, (_, i) =>
      `<button class="page-btn ${i+1===alertPage?'active':''}" onclick="goPage(${i+1})">${i+1}</button>`
    ).join('');
}

function goPage(p) { alertPage = p; applyFilters(); }

async function resolveAlert(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    // support both endpoints
    await fetch(`${API}/update-alert`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ id, status: 'Resolved' })
    });
    showToast('Resolved', `Alert #${id} marked as resolved`, 'success');
    await loadAlerts();
    await loadOverview();
  } catch {
    showToast('Error', 'Failed to resolve alert', 'info');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Resolve'; }
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────
let allUsers = [];

async function loadUsers() {
  try {
    const [ur, ar] = await Promise.all([
      fetch(`${API}/users`,  { headers: authHeaders() }),
      fetch(`${API}/alerts`, { headers: authHeaders() })
    ]);
    allUsers  = await ur.json();
    const alerts = await ar.json();
    allUsers = allUsers.map(u => ({
      ...u,
      alertCount:   alerts.filter(a => a.user_id === u.id).length,
      pendingCount: alerts.filter(a => a.user_id === u.id && a.status === 'Pending').length
    }));
    filterUsers();
  } catch {
    document.getElementById('users-body').innerHTML = '<tr><td colspan="6" class="empty">Failed to load</td></tr>';
  }
}

function filterUsers() {
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  renderUsersTable(allUsers.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-body');
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No tourists found</td></tr>'; return; }
  tbody.innerHTML = users.map((u, i) => `
    <tr>
      <td style="color:var(--muted)">${i+1}</td>
      <td><div style="display:flex;align-items:center;gap:0.5rem">
        <div class="avatar" style="width:28px;height:28px;font-size:0.78rem">${u.name[0].toUpperCase()}</div>
        <span style="font-weight:600">${u.name}</span>
      </div></td>
      <td style="color:var(--muted);font-size:0.85rem">${u.email}</td>
      <td style="font-size:0.82rem;color:var(--muted)">${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        ${u.pendingCount > 0 ? `<span class="badge badge-pending">🔴 ${u.pendingCount} pending</span> ` : ''}
        <span class="badge badge-resolved">${u.alertCount} total</span>
      </td>
      <td style="display:flex;gap:0.4rem">
        <button class="btn-sm btn-info" onclick="viewUser(${u.id})">👁 View</button>
        <button class="btn-sm btn-outline" onclick="viewUserLocation(${u.id})">📍 Locate</button>
      </td>
    </tr>`).join('');
}

async function viewUser(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  document.getElementById('modal-title').textContent = '👤 Tourist Details';
  document.getElementById('modal-body').innerHTML = `
    <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${u.name}</span></div>
    <div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${u.email}</span></div>
    <div class="detail-row"><span class="detail-label">Registered</span><span class="detail-value">${new Date(u.created_at).toLocaleString()}</span></div>
    <div class="detail-row"><span class="detail-label">Total Alerts</span><span class="detail-value">${u.alertCount}</span></div>
    <div class="detail-row"><span class="detail-label">Pending</span><span class="detail-value" style="color:${u.pendingCount>0?'#ef5350':'inherit'}">${u.pendingCount}</span></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function viewUserLocation(userId) {
  try {
    const res = await fetch(`${API}/location/${userId}`, { headers: authHeaders() });
    const loc = await res.json();
    if (!loc || !loc.latitude) { showToast('No Location', 'Tourist has no location data yet', 'info'); return; }
    navigate('map');
    setTimeout(() => {
      if (leafletMap) {
        leafletMap.setView([loc.latitude, loc.longitude], 15);
        L.popup().setLatLng([loc.latitude, loc.longitude])
          .setContent(`<b>Tourist #${userId}</b><br>📍 ${parseFloat(loc.latitude).toFixed(5)}, ${parseFloat(loc.longitude).toFixed(5)}`)
          .openOn(leafletMap);
      }
    }, 400);
  } catch { showToast('Error', 'Failed to fetch location', 'info'); }
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

// ── Map ───────────────────────────────────────────────────────────────────────
let leafletMap = null, mapMarkers = [];

async function initMap() {
  if (!leafletMap) {
    leafletMap = L.map('leaflet-map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);
  }
  refreshMap();
}

async function refreshMap() {
  if (!leafletMap) return;
  try {
    const res   = await fetch(`${API}/users`, { headers: authHeaders() });
    const users = await res.json();
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];
    const listEl = document.getElementById('map-user-list');
    listEl.innerHTML = '';

    const results = await Promise.all(users.map(u =>
      fetch(`${API}/location/${u.id}`, { headers: authHeaders() })
        .then(r => r.json()).then(loc => ({ ...u, loc })).catch(() => ({ ...u, loc: null }))
    ));

    results.filter(r => r.loc && r.loc.latitude).forEach(r => {
      const m = L.marker([r.loc.latitude, r.loc.longitude]).addTo(leafletMap)
        .bindPopup(`<b>${r.name}</b><br>${r.email}<br>📍 ${parseFloat(r.loc.latitude).toFixed(5)}, ${parseFloat(r.loc.longitude).toFixed(5)}`);
      mapMarkers.push(m);

      const item = document.createElement('div');
      item.className = 'map-user-item';
      item.innerHTML = `<div class="avatar">${r.name[0].toUpperCase()}</div>
        <div class="info"><div class="name">${r.name}</div>
        <div class="coords">📍 ${parseFloat(r.loc.latitude).toFixed(4)}, ${parseFloat(r.loc.longitude).toFixed(4)}</div></div>`;
      item.onclick = () => { leafletMap.setView([r.loc.latitude, r.loc.longitude], 15); m.openPopup(); };
      listEl.appendChild(item);
    });

    if (!listEl.children.length)
      listEl.innerHTML = '<div style="padding:1rem;color:var(--muted);font-size:0.85rem;text-align:center">No location data yet</div>';
  } catch (e) { console.error(e); }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

async function loadAnalytics() {
  try {
    const res    = await fetch(`${API}/alerts`, { headers: authHeaders() });
    const alerts = await res.json();
    const days   = getLast7Days();

    renderChart('chart-weekly', 'bar', days.map(d => d.slice(5)),
      days.map(d => alerts.filter(a => a.created_at.startsWith(d)).length), 'Alerts', '#1a73e8');

    const p = alerts.filter(a => a.status === 'Pending').length;
    const r = alerts.filter(a => a.status === 'Resolved').length;
    renderDonut('chart-donut', ['Pending','Resolved'], [p, r], ['#e53935','#43a047']);

    renderChart('chart-bar', 'bar', days.map(d => d.slice(5)),
      days.map(d => {
        const day = alerts.filter(a => a.created_at.startsWith(d));
        return day.length ? Math.round(day.filter(a => a.status==='Resolved').length / day.length * 100) : 0;
      }), 'Resolution %', '#43a047');
  } catch (e) { console.error(e); }
}

function renderChart(id, type, labels, data, label, color) {
  if (charts[id]) charts[id].destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#8892b0' : '#64748b', gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  charts[id] = new Chart(document.getElementById(id), {
    type, data: { labels, datasets: [{ label, data, backgroundColor: color+'aa', borderColor: color, borderWidth:2, borderRadius:6 }] },
    options: { responsive:true, plugins:{ legend:{ labels:{ color:tc } } },
      scales: { x:{ ticks:{color:tc}, grid:{color:gc} }, y:{ ticks:{color:tc}, grid:{color:gc}, beginAtZero:true } } }
  });
}

function renderDonut(id, labels, data, colors) {
  if (charts[id]) charts[id].destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  charts[id] = new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth:0 }] },
    options: { responsive:true, plugins:{ legend:{ labels:{ color: dark?'#8892b0':'#64748b' } } } }
  });
}

function renderTodayChart(alerts) {
  if (charts['chart-today']) charts['chart-today'].destroy();
  const today = new Date().toISOString().slice(0,10);
  const hours = Array.from({length:24},(_,i)=>i);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#8892b0' : '#64748b', gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  charts['chart-today'] = new Chart(document.getElementById('chart-today'), {
    type: 'line',
    data: { labels: hours.map(h=>`${h}:00`),
      datasets: [{ label:'Alerts', data: hours.map(h => alerts.filter(a => a.created_at.startsWith(today) && new Date(a.created_at).getHours()===h).length),
        borderColor:'#e53935', backgroundColor:'rgba(229,57,53,0.1)', fill:true, tension:0.4, pointRadius:3 }] },
    options: { responsive:true, plugins:{ legend:{ labels:{ color:tc } } },
      scales: { x:{ ticks:{color:tc, maxTicksLimit:8}, grid:{color:gc} }, y:{ ticks:{color:tc}, grid:{color:gc}, beginAtZero:true } } }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getLast7Days() {
  return Array.from({length:7},(_,i) => { const d=new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10); });
}

function timeAgo(s) {
  const m = Math.floor((Date.now() - new Date(s)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}

// ── Surveillance ──────────────────────────────────────────────────────────────

let allCameras = [], survMap = null, survMarkers = [];

async function loadCameras() {
  try {
    const [cr, ir] = await Promise.all([
      fetch(`${API}/cameras`,   { headers: authHeaders() }),
      fetch(`${API}/incidents`, { headers: authHeaders() })
    ]);
    allCameras = await cr.json();
    const incidents = await ir.json();

    const active   = allCameras.filter(c => c.status === 'Active').length;
    const inactive = allCameras.filter(c => c.status === 'Inactive').length;
    const today    = new Date().toISOString().slice(0, 10);
    const todayInc = incidents.filter(i => i.created_at.startsWith(today)).length;
    const openInc  = incidents.filter(i => i.status === 'Open').length;

    document.getElementById('cam-active').textContent   = active;
    document.getElementById('cam-inactive').textContent = inactive;
    document.getElementById('cam-incidents').textContent = todayInc;
    document.getElementById('cam-open').textContent     = openInc;

    renderCamerasTable(allCameras);
    updateSurvMap(allCameras);
  } catch (e) {
    document.getElementById('cameras-body').innerHTML =
      '<tr><td colspan="5" class="empty">Failed to load cameras</td></tr>';
  }
}

function renderCamerasTable(cameras) {
  const tbody = document.getElementById('cameras-body');
  if (!cameras.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No cameras found</td></tr>';
    return;
  }
  tbody.innerHTML = cameras.map((c, i) => `
    <tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td>
        <div style="font-weight:600;font-size:0.875rem">${c.location}</div>
        <div style="font-size:0.75rem;color:var(--muted)">📍 ${parseFloat(c.latitude).toFixed(4)}, ${parseFloat(c.longitude).toFixed(4)}</div>
      </td>
      <td><span class="badge" style="background:rgba(26,115,232,0.15);color:#42a5f5">${c.zone}</span></td>
      <td>
        <span class="cam-status-${c.status.toLowerCase()}">
          ${c.status === 'Active' ? '🟢' : '⚫'} ${c.status}
        </span>
      </td>
      <td style="display:flex;gap:0.35rem;flex-wrap:wrap">
        <button class="btn-sm btn-primary" onclick="simulateDetect(${c.id})" ${c.status === 'Inactive' ? 'disabled' : ''} title="Simulate incident detection">🔍 Detect</button>
        <button class="btn-sm btn-outline" onclick="toggleCamera(${c.id})" title="Toggle status">${c.status === 'Active' ? '⏸' : '▶'}</button>
        <button class="btn-sm" style="background:rgba(229,57,53,0.15);color:#ef5350" onclick="deleteCamera(${c.id})" title="Remove camera">🗑</button>
      </td>
    </tr>`).join('');
}

async function simulateDetect(cameraId) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const res  = await fetch(`${API}/detect-incident`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ camera_id: cameraId })
    });
    const data = await res.json();
    if (!res.ok) { showToast('Error', data.error, 'info'); return; }

    const color = data.severity === 'High' ? 'alert' : data.severity === 'Medium' ? 'info' : 'success';
    showToast(
      `⚠️ ${data.severity} — ${data.type}`,
      `Camera #${cameraId}: ${data.camera}`,
      color
    );
    await loadCameras();
    await loadIncidents();
    await loadOverview(); // refresh alert counts
  } catch {
    showToast('Error', 'Detection failed', 'info');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Detect';
  }
}

async function toggleCamera(id) {
  try {
    const res  = await fetch(`${API}/cameras/${id}/toggle`, { method: 'PUT', headers: authHeaders() });
    const data = await res.json();
    showToast('Camera Updated', data.message, 'success');
    await loadCameras();
  } catch { showToast('Error', 'Failed to toggle camera', 'info'); }
}

async function deleteCamera(id) {
  if (!confirm('Remove this camera?')) return;
  try {
    await fetch(`${API}/cameras/${id}`, { method: 'DELETE', headers: authHeaders() });
    showToast('Removed', `Camera #${id} removed`, 'success');
    await loadCameras();
  } catch { showToast('Error', 'Failed to remove camera', 'info'); }
}

async function loadIncidents() {
  try {
    const res       = await fetch(`${API}/incidents`, { headers: authHeaders() });
    const incidents = await res.json();
    const el        = document.getElementById('incident-list');

    if (!incidents.length) {
      el.innerHTML = '<div class="empty">No incidents recorded yet</div>';
      return;
    }

    el.innerHTML = incidents.slice(0, 20).map(i => `
      <div class="incident-card ${i.severity.toLowerCase()} ${i.status === 'Resolved' ? 'resolved' : ''}">
        <div class="inc-header">
          <span class="inc-type">${i.type}</span>
          <div style="display:flex;gap:0.4rem;align-items:center">
            <span class="badge severity-${i.severity.toLowerCase()}">${i.severity}</span>
            ${i.status === 'Open'
              ? `<button class="btn-sm btn-success" style="padding:0.2rem 0.5rem;font-size:0.72rem" onclick="resolveIncident(${i.id})">✅</button>`
              : '<span style="font-size:0.75rem;color:var(--muted)">Resolved</span>'}
          </div>
        </div>
        <div class="inc-desc">${i.description}</div>
        <div class="inc-meta">📹 ${i.location} &nbsp;|&nbsp; ${timeAgo(i.created_at)}</div>
      </div>`).join('');
  } catch (e) {
    document.getElementById('incident-list').innerHTML = '<div class="empty">Failed to load incidents</div>';
  }
}

async function resolveIncident(id) {
  try {
    await fetch(`${API}/incidents/${id}/resolve`, { method: 'PUT', headers: authHeaders() });
    showToast('Resolved', `Incident #${id} resolved`, 'success');
    await loadIncidents();
    await loadCameras();
  } catch { showToast('Error', 'Failed to resolve', 'info'); }
}

// ── Surveillance Map ──────────────────────────────────────────────────────────

function initSurvMap() {
  if (!survMap) {
    survMap = L.map('surv-map').setView([22.5, 78.9], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(survMap);
  }
  if (allCameras.length) updateSurvMap(allCameras);
  else loadCameras();
}

function updateSurvMap(cameras) {
  if (!survMap) return;
  survMarkers.forEach(m => m.remove());
  survMarkers = [];

  const activeIcon = L.divIcon({
    html: '<div style="background:#43a047;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(67,160,71,0.8)"></div>',
    className: '', iconSize: [14, 14], iconAnchor: [7, 7]
  });
  const inactiveIcon = L.divIcon({
    html: '<div style="background:#607d8b;width:12px;height:12px;border-radius:50%;border:2px solid #fff"></div>',
    className: '', iconSize: [12, 12], iconAnchor: [6, 6]
  });

  cameras.forEach(c => {
    const icon   = c.status === 'Active' ? activeIcon : inactiveIcon;
    const marker = L.marker([c.latitude, c.longitude], { icon })
      .addTo(survMap)
      .bindPopup(`
        <b>📹 ${c.location}</b><br>
        Zone: ${c.zone}<br>
        Status: <b style="color:${c.status === 'Active' ? '#43a047' : '#607d8b'}">${c.status}</b><br>
        📍 ${parseFloat(c.latitude).toFixed(5)}, ${parseFloat(c.longitude).toFixed(5)}
      `);
    survMarkers.push(marker);
  });

  if (cameras.length) {
    const bounds = L.latLngBounds(cameras.map(c => [c.latitude, c.longitude]));
    survMap.fitBounds(bounds, { padding: [40, 40] });
  }
}

// ── Add Camera Modal ──────────────────────────────────────────────────────────

function openAddCamera() {
  document.getElementById('add-camera-modal').classList.add('open');
}

function closeAddCamera() {
  document.getElementById('add-camera-modal').classList.remove('open');
  document.getElementById('add-cam-error').style.display = 'none';
}

async function submitAddCamera() {
  const location  = document.getElementById('cam-location').value.trim();
  const latitude  = parseFloat(document.getElementById('cam-lat').value);
  const longitude = parseFloat(document.getElementById('cam-lng').value);
  const status    = document.getElementById('cam-status').value;
  const zone      = document.getElementById('cam-zone').value;
  const errEl     = document.getElementById('add-cam-error');

  if (!location || isNaN(latitude) || isNaN(longitude)) {
    errEl.textContent = 'Please fill in all fields with valid coordinates.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res  = await fetch(`${API}/add-camera`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ location, latitude, longitude, status, zone })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }

    showToast('Camera Added', `${location} added to network`, 'success');
    closeAddCamera();
    // clear form
    ['cam-location','cam-lat','cam-lng'].forEach(id => document.getElementById(id).value = '');
    await loadCameras();
  } catch {
    errEl.textContent = 'Failed to add camera. Is Flask running?';
    errEl.style.display = 'block';
  }
}
