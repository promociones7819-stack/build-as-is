'use strict';

const STORAGE_KEY = 'bilbobus_hours_dashboard_v1';
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const PAYROLL_DEFAULTS = { base: 47.14, complement: 12.18, settlement: 3.23, cash: 1.26, saturday: 25.70, nightDay: 14.10, holiday: 51.47, nightHour: 3.21, splitDinner: 10.09 };
const $ = (id) => document.getElementById(id);
let state = loadState();
let currentMonday = startISOWeek(new Date());
let lastFocusedElement = null;
let toastTimer;
let folderHandle = null;
let folderSaveTimer;

function emptyState() { return { contracts: [], days: {}, payroll: { ...PAYROLL_DEFAULTS }, payrollQuantities: {}, holidays: [] }; }

function normalizeState(value) {
  const clean = emptyState();
  if (!value || typeof value !== 'object') return clean;
  if (Array.isArray(value.contracts)) {
    clean.contracts = value.contracts.filter((c) => c && typeof c === 'object').map((c) => ({
      ...c,
      id: String(c.id || uid()),
      start: String(c.start || ''),
      end: String(c.end || ''),
      weekly: parseDecimal(c.weekly),
      name: String(c.name || '')
    })).filter((c) => validDateKey(c.start) && validDateKey(c.end) && c.start <= c.end && c.weekly > 0);
  }
  if (value.days && typeof value.days === 'object' && !Array.isArray(value.days)) {
    Object.entries(value.days).forEach(([key, entry]) => {
      if (!validDateKey(key) || !entry || typeof entry !== 'object') return;
      clean.days[key] = {
        shift: String(entry.shift || ''), start1: String(entry.start1 || ''), end1: String(entry.end1 || ''),
        start2: String(entry.start2 || ''), end2: String(entry.end2 || ''), note: String(entry.note || '')
      };
    });
  }
  if (value.payroll && typeof value.payroll === 'object') Object.keys(PAYROLL_DEFAULTS).forEach((key) => { clean.payroll[key] = parseDecimal(value.payroll[key] ?? PAYROLL_DEFAULTS[key]); });
  if (value.payrollQuantities && typeof value.payrollQuantities === 'object' && !Array.isArray(value.payrollQuantities)) clean.payrollQuantities = value.payrollQuantities;
  if (Array.isArray(value.holidays)) clean.holidays = value.holidays.filter((item) => item && validDateKey(String(item.date || ''))).map((item) => ({ date: String(item.date), name: String(item.name || 'Festivo') }));
  return clean;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : emptyState();
  } catch (error) {
    console.warn('No se pudieron cargar los datos guardados.', error);
    return emptyState();
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); scheduleFolderSave(); }
  catch (error) { showToast('No se han podido guardar los cambios en este navegador.'); }
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bilbobus_local_files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeFolderHandle(handle) { const db = await openHandleDatabase(); await new Promise((resolve, reject) => { const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(handle, 'dataFolder'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
async function readFolderHandle() { const db = await openHandleDatabase(); const handle = await new Promise((resolve, reject) => { const request = db.transaction('handles').objectStore('handles').get('dataFolder'); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error); }); db.close(); return handle; }
async function removeFolderHandle() { const db = await openHandleDatabase(); await new Promise((resolve, reject) => { const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').delete('dataFolder'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close(); }
function folderAccessSupported() { return 'showDirectoryPicker' in window && 'indexedDB' in window; }
function updateFolderStatus(message = '') {
  if (!folderAccessSupported()) { $('folderStatus').textContent = 'Este navegador no permite vincular carpetas. Puedes usar la copia manual.'; $('chooseFolder').disabled = true; return; }
  $('folderStatus').textContent = message || (folderHandle ? `Carpeta vinculada: ${folderHandle.name}` : 'No hay ninguna carpeta vinculada.');
  $('saveFolderNow').disabled = !folderHandle; $('disconnectFolder').hidden = !folderHandle; $('chooseFolder').textContent = folderHandle ? 'Cambiar carpeta' : 'Elegir carpeta';
}
async function writeFolderCopy({ requestPermission = false, quiet = false } = {}) {
  if (!folderHandle) return false;
  try {
    let permission = await folderHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await folderHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') { updateFolderStatus(`Carpeta vinculada: ${folderHandle.name} · permiso pendiente`); if (!quiet) showToast('Autoriza la carpeta para poder guardar.'); return false; }
    const fileHandle = await folderHandle.getFileHandle('bilbobus-datos.json', { create: true });
    const writable = await fileHandle.createWritable(); await writable.write(JSON.stringify(state, null, 2)); await writable.close();
    updateFolderStatus(`Carpeta vinculada: ${folderHandle.name} · guardado ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`); if (!quiet) showToast('Datos guardados en la carpeta.'); return true;
  } catch (error) { if (error?.name !== 'AbortError') { updateFolderStatus('No se pudo escribir en la carpeta vinculada.'); if (!quiet) showToast('No se pudo guardar en la carpeta.'); } return false; }
}
function scheduleFolderSave() { if (!folderHandle) return; clearTimeout(folderSaveTimer); folderSaveTimer = setTimeout(() => writeFolderCopy({ quiet: true }), 350); }
async function chooseFolder() { if (!folderAccessSupported()) return; try { const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bilbobus-data-folder' }); folderHandle = handle; await storeFolderHandle(handle); updateFolderStatus(); await writeFolderCopy({ requestPermission: true }); } catch (error) { if (error?.name !== 'AbortError') showToast('No se pudo vincular la carpeta.'); } }
async function disconnectFolder() { folderHandle = null; await removeFolderHandle(); updateFolderStatus(); showToast('Carpeta desvinculada.'); }
async function initializeFolderStorage() { updateFolderStatus(); if (!folderAccessSupported()) return; try { folderHandle = await readFolderHandle(); updateFolderStatus(); if (folderHandle && await folderHandle.queryPermission({ mode: 'readwrite' }) === 'granted') await writeFolderCopy({ quiet: true }); } catch { folderHandle = null; updateFolderStatus(); } }

function pad(number) { return String(number).padStart(2, '0'); }
function cloneDate(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date, amount) { const copy = cloneDate(date); copy.setDate(copy.getDate() + amount); return copy; }
function dateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function validDateKey(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseKey(key)) === key; }
function parseKey(key) { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day); }
function fmtDate(value) { const date = typeof value === 'string' ? parseKey(value) : value; return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`; }
function startISOWeek(date) { const copy = cloneDate(date); const day = copy.getDay() || 7; copy.setDate(copy.getDate() - day + 1); return copy; }
function isoWeek(date) { const copy = cloneDate(date); const day = copy.getDay() || 7; copy.setDate(copy.getDate() + 4 - day); const first = new Date(copy.getFullYear(), 0, 1); return Math.ceil((((copy - first) / 86400000) + 1) / 7); }
function daysInclusive(start, end) {
  const [sy, sm, sd] = start.split('-').map(Number); const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
}
function parseDecimal(value) { const number = Number(String(value ?? '').trim().replace(',', '.')); return Number.isFinite(number) && number >= 0 ? number : 0; }
function sex(minutes) { const sign = minutes < 0 ? '-' : ''; const absolute = Math.abs(Math.round(minutes)); return `${sign}${Math.floor(absolute / 60)}:${pad(absolute % 60)} h`; }
function sexNoH(minutes) { return sex(minutes).replace(' h', ''); }
function dec(minutes, plus = false) { const sign = plus && minutes > 0 ? '+' : ''; return `${sign}${(minutes / 60).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`; }
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function clockMinutes(value) { if (!/^\d{2}:\d{2}$/.test(value || '')) return null; const [h, m] = value.split(':').map(Number); return h < 24 && m < 60 ? h * 60 + m : null; }
function interval(start, end) {
  const first = clockMinutes(start); let last = clockMinutes(end);
  if (first === null || last === null) return 0;
  if (last < first) last += 1440;
  return last - first;
}
function entryMinutes(entry) { return entry ? interval(entry.start1, entry.end1) + interval(entry.start2, entry.end2) : 0; }
function intervalNightMinutes(start, end) {
  const first = clockMinutes(start); let last = clockMinutes(end); if (first === null || last === null) return 0;
  if (last < first) last += 1440;
  let total = 0;
  for (let day = -1; day <= 2; day += 1) {
    const from = day * 1440 + 1320; const to = day * 1440 + 1800;
    total += Math.max(0, Math.min(last, to) - Math.max(first, from));
  }
  return total;
}
function entryNightMinutes(entry) { return entry ? intervalNightMinutes(entry.start1, entry.end1) + intervalNightMinutes(entry.start2, entry.end2) : 0; }
function validateEntry(entry) {
  if (clockMinutes(entry.start1) === null || clockMinutes(entry.end1) === null) return 'Completa la entrada y la salida del tramo 1.';
  if (entry.start1 === entry.end1) return 'La entrada y la salida del tramo 1 no pueden coincidir.';
  const hasStart2 = clockMinutes(entry.start2) !== null; const hasEnd2 = clockMinutes(entry.end2) !== null;
  if (hasStart2 !== hasEnd2) return 'Completa el tramo 2 o déjalo vacío.';
  if (!hasStart2) return '';
  if (entry.start2 === entry.end2) return 'La entrada y la salida del tramo 2 no pueden coincidir.';
  const start1 = clockMinutes(entry.start1); let end1 = clockMinutes(entry.end1); let start2 = clockMinutes(entry.start2); let end2 = clockMinutes(entry.end2);
  if (end1 < start1) end1 += 1440;
  while (start2 < start1) start2 += 1440;
  while (end2 < start2) end2 += 1440;
  if (start2 < end1) return 'El tramo 2 se solapa con el tramo 1.';
  if (end2 - start1 > 2880) return 'La jornada supera el límite de dos días. Revisa los horarios.';
  return '';
}

function contractForDate(key) { return state.contracts.find((contract) => key >= contract.start && key <= contract.end) || null; }
function contractTarget(contract) { return contract ? Math.round(contract.weekly * 60 * daysInclusive(contract.start, contract.end) / 7) : 0; }
function contractWorked(contract) { return contract ? Object.entries(state.days).reduce((sum, [key, entry]) => sum + (key >= contract.start && key <= contract.end ? entryMinutes(entry) : 0), 0) : 0; }
function contractStatus(contract) { const today = dateKey(new Date()); return today < contract.start ? 'Próximo' : today > contract.end ? 'Finalizado' : 'Activo'; }
function statusClass(contract) { const value = contractStatus(contract); return value === 'Próximo' ? 'upcoming' : value === 'Finalizado' ? 'finished' : ''; }
function preferredContract() {
  const today = dateKey(new Date()); const active = contractForDate(today); if (active) return active;
  const past = state.contracts.filter((c) => c.end < today).sort((a, b) => b.end.localeCompare(a.end))[0];
  return past || state.contracts.filter((c) => c.start > today).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
}

function render() { renderSummary(); renderWeek(); renderRecent(); renderContracts(); renderReports(); renderPayroll(); }

function renderSummary() {
  const contract = preferredContract();
  if (!contract) {
    $('summaryContent').innerHTML = `<span class="eyebrow">Control de jornada</span><h2 id="summaryTitle">Resumen</h2><p class="sub">Crea tu primer contrato para comenzar.</p><div class="summary-actions"><button class="button primary" data-action="new-contract">＋ Nuevo contrato</button></div>`;
    return;
  }
  const target = contractTarget(contract); const worked = contractWorked(contract); const difference = worked - target;
  $('summaryContent').innerHTML = `<span class="eyebrow">Resumen del contrato</span><h2 id="summaryTitle">${esc(contract.name || 'Contrato')}</h2><div class="contract-meta">${fmtDate(contract.start)} → ${fmtDate(contract.end)} <span class="badge ${statusClass(contract)}">${contractStatus(contract)}</span></div><p class="sub">Jornada contratada: ${String(contract.weekly).replace('.', ',')} h/semana</p>
  <div class="cards">
    ${statCard('▧', 'Horas contratadas<br>en el periodo', target)}
    ${statCard('◷', 'Horas realizadas', worked, 'positive')}
    ${statCard('↗', 'Diferencia', difference, difference > 0 ? 'positive' : difference < 0 ? 'negative' : '', true)}
    ${statCard('✓', difference >= 0 ? 'Exceso acumulado' : 'Saldo pendiente', Math.abs(difference), difference >= 0 ? 'positive' : 'negative')}
  </div><div class="summary-actions"><button class="button" data-action="new-contract">＋ Nuevo contrato</button><button class="button" data-action="open-report" data-id="${esc(contract.id)}">▤ Exportar informe</button></div>`;
}
function statCard(icon, label, minutes, css = '', signed = false) { const prefix = signed && minutes > 0 ? '+' : ''; return `<article class="stat-card"><span class="icon">${icon}</span><span class="label">${label}</span><strong class="${css}">${prefix}${sexNoH(minutes)} h</strong><small class="${css}">${dec(minutes, signed)}</small></article>`; }

function renderWeek() {
  const sunday = addDays(currentMonday, 6); const startKey = dateKey(currentMonday); const endKey = dateKey(sunday);
  $('weekTitle').textContent = `Semana ${isoWeek(currentMonday)}`; $('weekRange').textContent = `${fmtDate(currentMonday)} → ${fmtDate(sunday)}`;
  const overlaps = state.contracts.filter((c) => c.end >= startKey && c.start <= endKey);
  $('weekContractInfo').innerHTML = overlaps.length ? `<span>${overlaps.length > 1 ? 'Contratos que coinciden esta semana' : 'Jornada semanal del contrato'}</span><strong>${overlaps.map((c) => `${esc(c.name || 'Contrato')}: ${String(c.weekly).replace('.', ',')} h/semana`).join(' · ')}</strong>` : '<span>Semana sin contrato asignado</span><strong>—</strong>';
  $('daysGrid').innerHTML = ''; let week = 0; const today = dateKey(new Date());
  DOW.forEach((name, index) => {
    const date = addDays(currentMonday, index); const key = dateKey(date); const entry = state.days[key]; const minutes = entryMinutes(entry); week += minutes;
    const button = document.createElement('button'); button.type = 'button'; button.className = `day${key === today ? ' today' : ''}`; button.dataset.date = key; button.setAttribute('aria-label', `${name} ${fmtDate(key)}, ${entry ? sex(minutes) : 'sin jornada'}`);
    button.innerHTML = `<div class="day-head"><strong>${name}</strong><span>${fmtDate(key).slice(0, 5)}</span></div>${entry ? `<div class="shift"><span class="dot"></span>${esc(entry.shift || 'Turno')}</div><div class="time">${esc(entry.start1)} → ${esc(entry.end1)}</div>${entry.start2 && entry.end2 ? `<div class="time">${esc(entry.start2)} → ${esc(entry.end2)}</div>` : ''}<div class="note">${esc(entry.note)}</div>` : '<div class="shift muted">Descanso</div><div class="time muted">—</div>'}<div class="day-total"><strong>${sexNoH(minutes)}</strong><span>${dec(minutes)}</span></div>`;
    $('daysGrid').appendChild(button);
  });
  $('weekTotal').textContent = sex(week); $('weekTotalDec').textContent = dec(week);
}

function renderRecent() {
  const rows = Object.entries(state.days).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  $('recentDays').innerHTML = rows.length ? `<table class="data-table"><thead><tr><th>Día</th><th>Turno</th><th>Tramos</th><th>Total</th><th>Decimal</th></tr></thead><tbody>${rows.map(([key, entry]) => `<tr data-date="${key}" tabindex="0"><td>${fmtDate(key).slice(0, 5)}</td><td>${esc(entry.shift || 'Turno')}</td><td>${esc(entry.start1)}→${esc(entry.end1)}${entry.start2 && entry.end2 ? `<br>${esc(entry.start2)}→${esc(entry.end2)}` : ''}</td><td><strong>${sexNoH(entryMinutes(entry))}</strong></td><td>${dec(entryMinutes(entry))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin jornadas registradas.</div>';
}

function renderContracts() {
  const sorted = [...state.contracts].sort((a, b) => b.start.localeCompare(a.start));
  $('contractsList').innerHTML = sorted.length ? sorted.map((contract) => { const worked = contractWorked(contract); const target = contractTarget(contract); const diff = worked - target; return `<button class="contract-row" data-contract-id="${esc(contract.id)}"><div><strong>${fmtDate(contract.start)} → ${fmtDate(contract.end)}</strong><span class="contract-name">${esc(contract.name || 'Contrato sin nombre')}</span></div><div class="metric">${String(contract.weekly).replace('.', ',')} h/semana<small>${sex(target)} totales</small></div><div class="metric ${diff >= 0 ? 'positive' : 'negative'}">${diff > 0 ? '+' : ''}${sex(diff)}<small>Diferencia</small></div><span class="badge ${statusClass(contract)}">${contractStatus(contract)}</span></button>`; }).join('') : '<div class="empty">No hay contratos. Crea el primero para comenzar.</div>';
}

function renderReports() {
  const select = $('reportContract'); const previous = select.value; const sorted = [...state.contracts].sort((a, b) => b.start.localeCompare(a.start));
  select.innerHTML = sorted.length ? sorted.map((c) => `<option value="${esc(c.id)}">${fmtDate(c.start)} → ${fmtDate(c.end)} · ${esc(c.name || 'Contrato')}</option>`).join('') : '<option value="">No hay contratos</option>';
  if (sorted.some((c) => c.id === previous)) select.value = previous; else select.value = preferredContract()?.id || sorted[0]?.id || '';
  updateReportPreview(); $('exportPdf').disabled = !select.value;
}
function updateReportPreview() { const contract = state.contracts.find((c) => c.id === $('reportContract').value); if (!contract) { $('reportPreview').textContent = 'Crea un contrato para poder generar informes.'; return; } const target = contractTarget(contract); const worked = contractWorked(contract); const difference = worked - target; $('reportPreview').innerHTML = `Contratadas: <strong>${sex(target)}</strong> · Realizadas: <strong>${sex(worked)}</strong> · Diferencia: <strong class="${difference >= 0 ? 'positive' : 'negative'}">${difference > 0 ? '+' : ''}${sex(difference)}</strong>`; }

function money(value) { return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function payrollMonthBounds(value) { const [year, month] = value.split('-').map(Number); const start = `${year}-${pad(month)}-01`; const last = new Date(year, month, 0).getDate(); return { start, end: `${year}-${pad(month)}-${pad(last)}` }; }
function renderPayroll() {
  const month = $('payrollMonth').value || dateKey(new Date()).slice(0, 7); $('payrollMonth').value = month;
  const { start, end } = payrollMonthBounds(month); const entries = Object.entries(state.days).filter(([key]) => key >= start && key <= end && entryMinutes(state.days[key]) > 0);
  const workedDays = entries.length; const workedMinutes = entries.reduce((sum, [, entry]) => sum + entryMinutes(entry), 0); const nightMinutes = entries.reduce((sum, [, entry]) => sum + entryNightMinutes(entry), 0);
  const nightDays = entries.filter(([, entry]) => entryNightMinutes(entry) > 0).length; const saturdays = entries.filter(([key]) => parseKey(key).getDay() === 6).length; const splitDays = entries.filter(([, entry]) => entry.start2 && entry.end2).length;
  const holidayDates = new Set(state.holidays.map((item) => item.date)); const festiveDays = entries.filter(([key]) => parseKey(key).getDay() === 0 || holidayDates.has(key)).length;
  const lines = [
    ['0001', 'SALARIO BASE', 'base', workedDays], ['0011', 'COMPLEMENTO SALARIAL', 'complement', workedDays], ['0063', 'LIQUIDACIÓN Y JORNADA CON', 'settlement', workedDays], ['00A2', 'QUEBRANTO DE MONEDA', 'cash', workedDays],
    ['1074', 'PLUS SÁBADO', 'saturday', saturdays], ['10M7', 'PLUS NOCTURNIDAD', 'nightDay', nightDays], ['10M9', 'FESTIVOS', 'holiday', festiveDays], ['10N3', 'HORAS NOCTURNAS', 'nightHour', nightMinutes / 60], ['1455', 'DIETAS CENA JORN. PARTIDA', 'splitDinner', splitDays]
  ];
  const overrides = state.payrollQuantities[month] || {};
  let gross = 0;
  $('payrollLines').innerHTML = lines.map(([code, label, key, automatic]) => { const quantity = Object.hasOwn(overrides, key) ? parseDecimal(overrides[key]) : automatic; const amount = state.payroll[key] * quantity; gross += amount; return `<tr><td>${code}</td><td>${label}<small class="auto-hint">Auto: ${automatic.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</small></td><td><label class="price-field"><span class="sr-only">Precio ${label}</span><input data-payroll-price="${key}" inputmode="decimal" value="${String(state.payroll[key]).replace('.', ',')}"></label></td><td><label class="quantity-field"><span class="sr-only">Cantidad ${label}</span><input data-payroll-quantity="${key}" inputmode="decimal" value="${String(quantity).replace('.', ',')}"></label></td><td><strong>${money(amount)}</strong></td></tr>`; }).join('');
  $('payrollStats').innerHTML = `<article><span>Días trabajados</span><strong>${workedDays}</strong></article><article><span>Horas trabajadas</span><strong>${sexNoH(workedMinutes)}</strong></article><article><span>Horas nocturnas</span><strong>${sexNoH(nightMinutes)}</strong></article><article><span>Días con nocturnidad</span><strong>${nightDays}</strong></article>`;
  $('payrollGross').textContent = money(gross);
  renderHolidays(month);
}
function renderHolidays(month) { const year = month.slice(0, 4); const items = state.holidays.filter((item) => item.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date)); $('holidayDate').min = `${year}-01-01`; $('holidayDate').max = `${year}-12-31`; $('holidayList').innerHTML = items.length ? items.map((item) => `<span class="holiday-chip">${fmtDate(item.date)} · ${esc(item.name)}<button type="button" data-remove-holiday="${item.date}" aria-label="Eliminar festivo ${esc(item.name)}">×</button></span>`).join('') : '<span class="muted">No hay festivos adicionales para este año.</span>'; }
function addHoliday() { const date = $('holidayDate').value; const name = $('holidayName').value.trim() || 'Festivo'; if (!validDateKey(date)) { showToast('Selecciona una fecha festiva válida.'); return; } const existing = state.holidays.find((item) => item.date === date); if (existing) existing.name = name; else state.holidays.push({ date, name }); $('holidayDate').value = ''; $('holidayName').value = ''; persist(); renderPayroll(); showToast('Festivo guardado.'); }
function savePayrollAdjustments() { const month = $('payrollMonth').value; state.payrollQuantities[month] ||= {}; document.querySelectorAll('[data-payroll-price]').forEach((input) => { state.payroll[input.dataset.payrollPrice] = parseDecimal(input.value); }); document.querySelectorAll('[data-payroll-quantity]').forEach((input) => { state.payrollQuantities[month][input.dataset.payrollQuantity] = parseDecimal(input.value); }); persist(); renderPayroll(); showToast('Precios y cantidades guardados.'); }

function showModal(id) { lastFocusedElement = document.activeElement; const modal = $(id); modal.hidden = false; document.body.style.overflow = 'hidden'; modal.querySelector('input:not([type="hidden"]), button')?.focus(); }
function hideModal(id) { $(id).hidden = true; if (![...document.querySelectorAll('.modal')].some((m) => !m.hidden)) document.body.style.overflow = ''; lastFocusedElement?.focus?.(); }
function showToast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2800); }
function setView(name) { document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${name}View`)); document.querySelectorAll('.nav button').forEach((button) => { const active = button.dataset.view === name; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function openContractModal(id = '') { const contract = state.contracts.find((c) => c.id === id); $('contractId').value = contract?.id || ''; $('contractStart').value = contract?.start || ''; $('contractEnd').value = contract?.end || ''; $('contractWeekly').value = contract ? String(contract.weekly).replace('.', ',') : ''; $('contractName').value = contract?.name || ''; $('contractModalTitle').textContent = contract ? 'Editar contrato' : 'Nuevo contrato'; $('deleteContract').hidden = !contract; updateContractPreview(); showModal('contractModal'); }
function updateContractPreview() { const start = $('contractStart').value; const end = $('contractEnd').value; const weekly = parseDecimal($('contractWeekly').value); const preview = $('contractPreview'); preview.classList.remove('error'); if (!start || !end || !weekly) { preview.textContent = 'Completa las fechas y las horas semanales.'; return; } if (end < start) { preview.textContent = 'La fecha de fin debe ser posterior a la de inicio.'; preview.classList.add('error'); return; } const days = daysInclusive(start, end); const minutes = Math.round(weekly * 60 * days / 7); preview.innerHTML = `Periodo: <strong>${days} días</strong> · Total contractual: <strong>${sex(minutes)}</strong> · ${dec(minutes)}`; }
function saveContract(event) { event.preventDefault(); const id = $('contractId').value; const start = $('contractStart').value; const end = $('contractEnd').value; const weekly = parseDecimal($('contractWeekly').value); const name = $('contractName').value.trim(); if (!validDateKey(start) || !validDateKey(end) || end < start || weekly <= 0 || weekly > 168) { showToast('Revisa el rango de fechas y las horas semanales.'); return; } const overlap = state.contracts.find((c) => c.id !== id && !(end < c.start || start > c.end)); if (overlap && !confirm(`Este contrato se solapa con “${overlap.name || 'otro contrato'}”. ¿Quieres guardarlo igualmente?`)) return; const existing = state.contracts.find((c) => c.id === id); if (existing) Object.assign(existing, { start, end, weekly, name }); else state.contracts.push({ id: uid(), start, end, weekly, name }); persist(); hideModal('contractModal'); render(); showToast('Contrato guardado.'); }
function deleteContract() { const id = $('contractId').value; if (id && confirm('¿Eliminar este contrato? Las jornadas registradas no se borrarán.')) { state.contracts = state.contracts.filter((c) => c.id !== id); persist(); hideModal('contractModal'); render(); showToast('Contrato eliminado.'); } }

function openDayModal(key) { const entry = state.days[key]; $('dayDate').value = key; $('daySubtitle').textContent = `${fmtDate(key)} · ${contractForDate(key) ? 'dentro de contrato' : 'fuera de contrato'}`; $('shiftName').value = entry?.shift || ''; $('start1').value = entry?.start1 || ''; $('end1').value = entry?.end1 || ''; $('start2').value = entry?.start2 || ''; $('end2').value = entry?.end2 || ''; $('dayNote').value = entry?.note || ''; $('deleteDay').hidden = !entry; updateDayPreview(); showModal('dayModal'); }
function formEntry() { return { shift: $('shiftName').value.trim(), start1: $('start1').value, end1: $('end1').value, start2: $('start2').value, end2: $('end2').value, note: $('dayNote').value.trim() }; }
function updateDayPreview() { const entry = formEntry(); const error = validateEntry(entry); const preview = $('dayPreview'); preview.classList.toggle('error', Boolean(error)); preview.innerHTML = error ? esc(error) : `Total jornada: <strong>${sex(entryMinutes(entry))}</strong> · ${dec(entryMinutes(entry))}`; }
function saveDay(event) { event.preventDefault(); const entry = formEntry(); const error = validateEntry(entry); if (error) { showToast(error); return; } state.days[$('dayDate').value] = entry; persist(); hideModal('dayModal'); render(); showToast('Jornada guardada.'); }
function deleteDay() { const key = $('dayDate').value; if (state.days[key] && confirm('¿Borrar esta jornada?')) { delete state.days[key]; persist(); hideModal('dayModal'); render(); showToast('Jornada borrada.'); } }

function exportPdf(contractId = $('reportContract').value) { const contract = state.contracts.find((c) => c.id === contractId) || preferredContract(); if (!contract) { showToast('No hay ningún contrato para exportar.'); return; } if (!window.jspdf?.jsPDF) { showToast('No se pudo cargar el generador de PDF. Comprueba tu conexión.'); return; } const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape' }); const target = contractTarget(contract); const worked = contractWorked(contract); const difference = worked - target; doc.setFillColor(160, 8, 15); doc.rect(0, 0, 297, 25, 'F'); doc.setTextColor(255); doc.setFontSize(18); doc.text('CONTROL DE HORAS · BILBOBUS', 14, 16); doc.setTextColor(30); doc.setFontSize(11); doc.text(`${contract.name || 'Contrato'} | ${fmtDate(contract.start)} - ${fmtDate(contract.end)} | ${String(contract.weekly).replace('.', ',')} h/semana`, 14, 35); doc.text(`Contratadas: ${sex(target)} (${dec(target)})   Realizadas: ${sex(worked)} (${dec(worked)})   Diferencia: ${difference > 0 ? '+' : ''}${sex(difference)} (${dec(difference, true)})`, 14, 44); const body = []; let date = parseKey(contract.start); const end = parseKey(contract.end); while (date <= end) { const key = dateKey(date); const entry = state.days[key]; if (entry) body.push([fmtDate(key), entry.shift || '-', entry.start1 || '-', entry.end1 || '-', entry.start2 || '-', entry.end2 || '-', sexNoH(entryMinutes(entry)), dec(entryMinutes(entry)).replace(' h', ''), entry.note || '']); date = addDays(date, 1); } if (!body.length) body.push(['Sin jornadas registradas', '-', '-', '-', '-', '-', '0:00', '0,00', '']); doc.autoTable({ startY: 51, head: [['Fecha', 'Turno', 'E1', 'S1', 'E2', 'S2', 'Horas', 'Decimal', 'Nota']], body, styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: [160, 8, 15] }, columnStyles: { 8: { cellWidth: 75 } } }); doc.save(`bilbobus-horas-${contract.start}-${contract.end}.pdf`); }

function backupData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `bilbobus-copia-${dateKey(new Date())}.json`; link.click(); URL.revokeObjectURL(url); showToast('Copia de seguridad descargada.'); }
async function restoreData(event) { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { const parsed = JSON.parse(await file.text()); const restored = normalizeState(parsed); if (!confirm(`Se restaurarán ${restored.contracts.length} contratos y ${Object.keys(restored.days).length} jornadas, sustituyendo los datos actuales. ¿Continuar?`)) return; state = restored; persist(); render(); showToast('Copia restaurada.'); } catch { showToast('El archivo no contiene una copia válida.'); } }

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-view]'); if (nav) setView(nav.dataset.view);
  const close = event.target.closest('[data-close]'); if (close) hideModal(close.dataset.close);
  const day = event.target.closest('[data-date]'); if (day) openDayModal(day.dataset.date);
  const contract = event.target.closest('[data-contract-id]'); if (contract) openContractModal(contract.dataset.contractId);
  const action = event.target.closest('[data-action]'); if (action?.dataset.action === 'new-contract') openContractModal(); if (action?.dataset.action === 'open-report') { setView('reports'); $('reportContract').value = action.dataset.id; updateReportPreview(); }
  if (event.target.classList.contains('modal')) hideModal(event.target.id);
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach((modal) => hideModal(modal.id)); if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-date]')) { event.preventDefault(); openDayModal(event.target.dataset.date); } });
$('prevWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, -7); renderWeek(); });
$('nextWeek').addEventListener('click', () => { currentMonday = addDays(currentMonday, 7); renderWeek(); });
$('currentWeek').addEventListener('click', () => { currentMonday = startISOWeek(new Date()); renderWeek(); });
$('addToday').addEventListener('click', () => openDayModal(dateKey(new Date())));
$('newContract').addEventListener('click', () => openContractModal());
$('contractForm').addEventListener('submit', saveContract); $('deleteContract').addEventListener('click', deleteContract);
$('dayForm').addEventListener('submit', saveDay); $('deleteDay').addEventListener('click', deleteDay);
['contractStart', 'contractEnd', 'contractWeekly'].forEach((id) => $(id).addEventListener('input', updateContractPreview));
['start1', 'end1', 'start2', 'end2'].forEach((id) => $(id).addEventListener('input', updateDayPreview));
$('reportContract').addEventListener('change', updateReportPreview); $('exportPdf').addEventListener('click', () => exportPdf());
$('payrollMonth').addEventListener('change', renderPayroll);
document.addEventListener('focusout', (event) => { const priceKey = event.target.dataset.payrollPrice; if (priceKey) { state.payroll[priceKey] = parseDecimal(event.target.value); persist(); renderPayroll(); return; } const quantityKey = event.target.dataset.payrollQuantity; if (quantityKey) { const month = $('payrollMonth').value; state.payrollQuantities[month] ||= {}; state.payrollQuantities[month][quantityKey] = parseDecimal(event.target.value); persist(); renderPayroll(); } });
$('addHoliday').addEventListener('click', addHoliday);
$('savePayrollAdjustments').addEventListener('click', savePayrollAdjustments);
$('resetPayrollQuantities').addEventListener('click', () => { delete state.payrollQuantities[$('payrollMonth').value]; persist(); renderPayroll(); showToast('Cantidades automáticas restauradas.'); });
document.addEventListener('click', (event) => { const date = event.target.dataset.removeHoliday; if (!date) return; state.holidays = state.holidays.filter((item) => item.date !== date); persist(); renderPayroll(); });
$('backupData').addEventListener('click', backupData); $('restoreData').addEventListener('change', restoreData);
$('chooseFolder').addEventListener('click', chooseFolder); $('saveFolderNow').addEventListener('click', () => writeFolderCopy({ requestPermission: true })); $('disconnectFolder').addEventListener('click', disconnectFolder);

render();
initializeFolderStorage();
