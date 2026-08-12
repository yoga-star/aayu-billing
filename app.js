/* ================= AAYU BILLING — app logic ================= */
'use strict';

/* ---------- store ---------- */
const LS_KEY = 'aayu_billing_v2'; // v2: seed carries taxName (IGST vs GST) + bank details
let db = loadDB();

const DEFAULT_BANK = { name: 'BANK OF BARODA, BARODA MAIN BRANCH', account: '67610200002903', ifsc: 'BARB0MAINOF', holder: 'AAYU CLOTHING' };
function loadDB() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      // migrate stores seeded before bank/signature fields existed
      if (d.business && !d.business.bank) {
        d.business.bank = DEFAULT_BANK;
        d.business.signName = d.business.signName || 'Shilpa';
        d.business.terms = d.business.terms || 'Thank you for your purchase!';
        localStorage.setItem(LS_KEY, JSON.stringify(d));
      }
      return d;
    }
  } catch (e) { console.warn('load failed', e); }
  // Plain seed (local build) — seed immediately. Encrypted build seeds via unlock screen.
  if (typeof SEED_DATA !== 'undefined') {
    const d = JSON.parse(JSON.stringify(SEED_DATA));
    localStorage.setItem(LS_KEY, JSON.stringify(d));
    return d;
  }
  return null;
}

/* ---------- encrypted-build unlock (hosted version) ---------- */
function showUnlock() {
  const el = document.createElement('div');
  el.className = 'lock-screen'; el.id = 'lockScreen';
  el.innerHTML = `
    <div class="lock-card">
      <div class="firm-avatar" style="width:54px;height:54px;font-size:20px;margin:0 auto 14px">AC</div>
      <h1>AAYU CLOTHING</h1>
      <p>Enter the passcode to open your billing book</p>
      <input id="unlockPin" type="password" inputmode="numeric" placeholder="Passcode" autocomplete="off"
        onkeydown="if(event.key==='Enter')unlock()">
      <button class="btn btn-red" onclick="unlock()">Unlock</button>
      <div class="lock-err" id="lockErr"></div>
    </div>`;
  document.body.appendChild(el);
  setTimeout(() => $('#unlockPin').focus(), 80);
}
async function unlock() {
  const pass = $('#unlockPin').value.trim();
  const err = $('#lockErr');
  if (!pass) return;
  try {
    const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b(SEED_ENC.salt), iterations: 150000, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(SEED_ENC.iv) }, key, b(SEED_ENC.ct));
    localStorage.setItem(LS_KEY, new TextDecoder().decode(pt));
    location.reload();
  } catch (e) {
    err.textContent = 'Wrong passcode — try again';
    $('#unlockPin').value = ''; $('#unlockPin').focus();
  }
}
function persist() { localStorage.setItem(LS_KEY, JSON.stringify(db)); }

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function fmtM(n, dash) {
  if (n == null || isNaN(n)) return dash ? '—' : '₹ 0';
  const neg = n < 0; n = Math.abs(n);
  let s = n.toFixed(2);
  let [i, d] = s.split('.');
  let last3 = i.slice(-3), rest = i.slice(0, -3);
  if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  s = last3 + (d === '00' ? '' : '.' + d);
  return (neg ? '-₹ ' : '₹ ') + s;
}
function fmtShort(n) {
  if (n >= 10000000) return (n / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (n >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'k';
  return String(Math.round(n));
}
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtD(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m-1]} ${String(y).slice(2)}`;
}
function todayISO() { const d = new Date(); return d.toISOString().slice(0, 10); }
function fmtDMY(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; }
function fmtM2(n) { // always two decimals, Indian grouping — matches Vyapar's bill
  n = +n || 0; const neg = n < 0; n = Math.abs(n);
  let [i, d] = n.toFixed(2).split('.');
  let last3 = i.slice(-3), rest = i.slice(0, -3);
  if (rest) last3 = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return (neg ? '-' : '') + '₹ ' + last3 + '.' + d;
}
function wordsTitle(n) { return numWords(n).replace(/\b\w/g, c => c.toUpperCase()); }
function monthKey(iso) { return iso ? iso.slice(0, 7) : ''; }

function numWords(num) { // Indian system
  num = Math.round(num);
  if (num === 0) return 'zero';
  const a = ['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const b = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n/10)] + (n%10 ? ' ' + a[n%10] : '');
  const three = n => n >= 100 ? a[Math.floor(n/100)] + ' hundred' + (n%100 ? ' ' + two(n%100) : '') : two(n);
  let out = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thou = Math.floor(num / 1000); num %= 1000;
  if (crore) out += three(crore) + ' crore ';
  if (lakh) out += two(lakh) + ' lakh ';
  if (thou) out += two(thou) + ' thousand ';
  if (num) out += three(num);
  return out.trim();
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}
function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function csvCell(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

const partyById = id => db.parties.find(p => p.id === id);
const itemById = id => db.items.find(i => i.id === id);
const nextId = coll => coll.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
const GST_RATES = [0, 5, 12, 18, 28];
function payTypes() {
  const s = new Set(['Cash', 'Cheque']);
  db.invoices.concat(db.purchases, db.expenses, db.payments).forEach(t => t.paymentType && s.add(t.paymentType));
  return [...s];
}
const allSales = () => db.invoices;
function invStatus(inv) { return inv.balance <= 0.005 ? 'paid' : (inv.received > 0 ? 'partial' : 'unpaid'); }
function statusChip(inv) { const s = invStatus(inv); return `<span class="chip ${s}">${s === 'paid' ? 'Paid' : s === 'partial' ? 'Partial' : 'Unpaid'}</span>`; }
function isIntraState(party) {
  const bizCode = (db.business.gstin || '').slice(0, 2) || '29';
  if (party && party.gstin) return party.gstin.slice(0, 2) === bizCode;
  if (party && party.state) return party.state.trim().toLowerCase() === (db.business.state || 'Karnataka').trim().toLowerCase();
  return true;
}

/* ---------- navigation ---------- */
const renderers = {};
let currentView = 'dashboard';
function showView(name) {
  currentView = name;
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  renderers[name] && renderers[name]();
}
$('#nav').addEventListener('click', e => {
  const a = e.target.closest('a[data-view]');
  if (a) showView(a.dataset.view);
});

/* ---------- modal ---------- */
function openModal(html, wide) {
  const box = $('#modalBox');
  box.className = 'modal' + (wide ? ' wide' : '');
  box.innerHTML = html;
  $('#modalBackdrop').classList.add('open');
}
function closeModal() { $('#modalBackdrop').classList.remove('open'); }
$('#modalBackdrop').addEventListener('click', e => { if (e.target.id === 'modalBackdrop') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeTxn(); } });
const modalHead = (title) => `<div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" onclick="closeModal()">×</button></div>`;

/* ================= DASHBOARD ================= */
renderers.dashboard = function () {
  const today = todayISO(), mk = monthKey(today);
  const yr = today.slice(0, 4);
  const sales = allSales();
  const monthTotal = sales.filter(i => monthKey(i.date) === mk).reduce((s, i) => s + i.total, 0);
  const yearTotal = sales.filter(i => i.date.startsWith(yr)).reduce((s, i) => s + i.total, 0);
  const toCollect = sales.reduce((s, i) => s + i.balance, 0) + db.purchases.reduce((s, i) => s - (i.balance||0), 0);
  const allTotal = sales.reduce((s, i) => s + i.total, 0);

  // last 12 months series
  const now = new Date();
  const series = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    series.push({ key, label: MONTHS[d.getMonth()], year: d.getFullYear(), total: 0, count: 0 });
  }
  const byKey = Object.fromEntries(series.map(s => [s.key, s]));
  sales.forEach(i => { const s = byKey[monthKey(i.date)]; if (s) { s.total += i.total; s.count++; } });

  const recent = [...sales].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 8);

  $('#view-dashboard').innerHTML = `
    <div class="stat-row">
      <div class="card stat green"><div class="label">To Collect</div><div class="value">${fmtM(toCollect)}</div><div class="sub">receivable balance</div></div>
      <div class="card stat"><div class="label">Sale — ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div><div class="value">${fmtM(monthTotal)}</div><div class="sub">this month</div></div>
      <div class="card stat"><div class="label">Sale — ${yr}</div><div class="value">${fmtM(yearTotal)}</div><div class="sub">calendar year</div></div>
      <div class="card stat"><div class="label">Total Sales</div><div class="value">${fmtM(allTotal)}</div><div class="sub">${sales.length} invoices since ${fmtD(sales[0] ? sales[0].date : '')}</div></div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-head"><h3>Sale — last 12 months</h3><span class="hint">hover a bar for details</span></div>
        <div class="chart-wrap" id="chartWrap">${barChartSVG(series)}<div class="chart-tip" id="chartTip"></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent transactions</h3></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Invoice</th><th>Party</th><th class="num">Amount</th></tr></thead>
        <tbody>${recent.map(i => `<tr onclick="viewInvoice(${i.id})"><td>${fmtD(i.date)}</td><td>${esc(db.business.invoicePrefix)}-${esc(i.ref)}</td><td>${esc(i.party)}</td><td class="num">${fmtM(i.total)}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </div>`;
  wireChart(series);
};

function barChartSVG(series) {
  const W = 640, H = 240, padL = 44, padR = 10, padT = 14, padB = 30;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(...series.map(s => s.total), 1);
  // nice max
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  let nice = [1, 2, 2.5, 5, 10].map(m => m * pow).find(v => v >= max) || max;
  const ticks = [0, .25, .5, .75, 1].map(f => f * nice);
  const band = iw / series.length, barW = Math.min(band * .58, 34);
  let g = ticks.map(t => {
    const y = padT + ih - (t / nice) * ih;
    return `<line class="gridline" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>` +
           `<text class="tick-label" x="${padL - 6}" y="${y + 3}" text-anchor="end">${t ? fmtShort(t) : '0'}</text>`;
  }).join('');
  let bars = series.map((s, i) => {
    const h = Math.max(s.total > 0 ? 3 : 0, (s.total / nice) * ih);
    const x = padL + i * band + (band - barW) / 2;
    const y = padT + ih - h;
    const r = Math.min(4, h);
    const d = h <= 0 ? '' : `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`;
    const lbl = `<text class="tick-label" x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle">${s.label}${s.label === 'Jan' ? ' ' + String(s.year).slice(2) : ''}</text>`;
    return (d ? `<path class="bar" d="${d}" data-i="${i}"><title></title></path>` : '') + lbl;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly sales bar chart">${g}${bars}</svg>`;
}
function wireChart(series) {
  const wrap = $('#chartWrap'), tip = $('#chartTip');
  if (!wrap) return;
  wrap.addEventListener('mousemove', e => {
    const b = e.target.closest('.bar');
    if (!b) { tip.style.display = 'none'; return; }
    const s = series[+b.dataset.i];
    const r = wrap.getBoundingClientRect();
    tip.innerHTML = `${s.label} ${s.year} — <b>${fmtM(s.total)}</b> · ${s.count} inv`;
    tip.style.left = (e.clientX - r.left) + 'px';
    tip.style.top = (e.clientY - r.top - 8) + 'px';
    tip.style.display = 'block';
  });
  wrap.addEventListener('mouseleave', () => tip.style.display = 'none');
}

/* ================= PARTIES ================= */
let selParty = null, partyQ = '';
renderers.parties = function () {
  if (selParty == null && db.parties.length) selParty = db.parties[0].id;
  const q = partyQ.toLowerCase();
  const list = db.parties.filter(p => !q || p.name.toLowerCase().includes(q) || (p.phone || '').includes(q));
  const p = partyById(selParty);
  const txns = p ? allSales().filter(i => i.partyId === p.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const total = txns.reduce((s, i) => s + i.total, 0);

  $('#view-parties').innerHTML = `
    <div class="view-head"><h1>Parties</h1><span class="hint">${db.parties.length} parties</span><span class="spacer"></span>
      <button class="btn btn-red btn-sm" onclick="partyForm()">＋ Add Party</button></div>
    <div class="split">
      <div class="card party-list">
        <div class="plist-search"><input id="partySearch" placeholder="Search party…" value="${esc(partyQ)}" oninput="partyQ=this.value;refocusRender('parties','partySearch')"></div>
        ${list.map(x => `<div class="prow ${x.id === selParty ? 'active' : ''}" onclick="selParty=${x.id};renderers.parties()">
          <span class="pname">${esc(x.name)}</span><span class="pbal ${x.balance > 0 ? 'pos' : ''}">${x.balance ? fmtM(x.balance) : ''}</span></div>`).join('') || '<div class="empty">No match</div>'}
      </div>
      <div class="card">
        ${p ? `
        <div class="party-detail-head">
          <div class="avatar">${esc(p.name.slice(0, 1).toUpperCase())}</div>
          <div><h2>${esc(p.name)}</h2>
            <div class="meta">${esc(p.phone || 'no phone')}${p.email ? ' · ' + esc(p.email) : ''}${p.gstin ? ' · GSTIN ' + esc(p.gstin) : ''}${p.address ? '<br>' + esc(p.address) : ''}</div></div>
          <div class="actions">
            <button class="btn btn-outline btn-sm" onclick="partyForm(${p.id})">Edit</button>
            <button class="btn btn-outline btn-sm" onclick="exportPartyCSV(${p.id})">⬇ Statement</button>
            <button class="btn btn-outline btn-sm" style="color:var(--red);border-color:var(--red)" onclick="deleteParty(${p.id})">Delete</button>
            <button class="btn btn-red btn-sm" onclick="openTxnForm('sale',${p.id})">＋ Sale</button>
          </div>
        </div>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Date</th><th>Invoice</th><th class="num">Amount</th><th class="num">Balance</th><th>Status</th></tr></thead>
          <tbody>${txns.map(i => `<tr onclick="viewInvoice(${i.id})"><td>${fmtD(i.date)}</td><td>${esc(db.business.invoicePrefix)}-${esc(i.ref)}</td><td class="num">${fmtM(i.total)}</td><td class="num">${fmtM(i.balance)}</td><td>${statusChip(i)}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:30px">No transactions yet</td></tr>'}</tbody>
          ${txns.length ? `<tfoot><tr><td colspan="2">Total · ${txns.length} invoices</td><td class="num">${fmtM(total)}</td><td class="num">${fmtM(p.balance)}</td><td></td></tr></tfoot>` : ''}
        </table></div>` : '<div class="empty"><div class="big">👥</div><p>No party selected</p></div>'}
      </div>
    </div>`;
};

function partyForm(id) {
  const p = id ? partyById(id) : null;
  openModal(modalHead(p ? 'Edit Party' : 'Add Party') + `
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>Party Name *</label><input id="pf_name" value="${esc(p?.name || '')}"></div>
      <div class="field"><label>Phone</label><input id="pf_phone" value="${esc(p?.phone || '')}"></div>
      <div class="field"><label>Email</label><input id="pf_email" value="${esc(p?.email || '')}"></div>
      <div class="field"><label>GSTIN</label><input id="pf_gstin" value="${esc(p?.gstin || '')}"></div>
      <div class="field"><label>State</label><input id="pf_state" value="${esc(p?.state || '')}" placeholder="Karnataka"></div>
      <div class="field full"><label>Address</label><textarea id="pf_addr">${esc(p?.address || '')}</textarea></div>
      <div class="field"><label>Opening Balance (₹)</label><input id="pf_bal" type="number" step="0.01" value="${p ? p.balance : 0}"></div>
    </div></div>
    <div class="modal-foot"><button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-red" onclick="saveParty(${id || 'null'})">Save</button></div>`);
  setTimeout(() => $('#pf_name').focus(), 50);
}
function saveParty(id) {
  const name = $('#pf_name').value.trim();
  if (!name) return toast('Party name is required');
  const data = { phone: $('#pf_phone').value.trim(), email: $('#pf_email').value.trim(), gstin: $('#pf_gstin').value.trim().toUpperCase(), state: $('#pf_state').value.trim(), address: $('#pf_addr').value.trim(), balance: +$('#pf_bal').value || 0 };
  if (id) Object.assign(partyById(id), { name }, data);
  else { const nid = nextId(db.parties); db.parties.push({ id: nid, name, createdAt: todayISO(), lastTxn: '', ...data }); selParty = nid; }
  db.parties.sort((a, b) => a.name.localeCompare(b.name));
  persist(); closeModal(); toast('Party saved'); renderers.parties && showView('parties');
}
function deleteParty(id) {
  const p = partyById(id); if (!p) return;
  const n = db.invoices.filter(i => i.partyId === id).length + db.purchases.filter(i => i.partyId === id).length;
  const msg = `Delete party "${p.name}"?` + (n ? `\n\nThey have ${n} invoice(s). The invoices stay in the app with the name as recorded — only the party's details and ledger view are removed.` : '');
  if (!confirm(msg)) return;
  db.parties = db.parties.filter(x => x.id !== id);
  if (selParty === id) selParty = null;
  persist(); toast('Party deleted'); renderers.parties();
}
function exportPartyCSV(id) {
  const p = partyById(id);
  const txns = allSales().filter(i => i.partyId === id).sort((a, b) => a.date.localeCompare(b.date));
  const rows = [['Date', 'Invoice', 'Amount', 'Received', 'Balance'], ...txns.map(i => [i.date, db.business.invoicePrefix + '-' + i.ref, i.total, i.received, i.balance])];
  download(`${p.name.replace(/\W+/g, '_')}_statement.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

/* ================= ITEMS ================= */
let itemQ = '';
renderers.items = function () {
  const q = itemQ.toLowerCase();
  const list = db.items.filter(i => !q || i.name.toLowerCase().includes(q) || (i.code || '').toLowerCase().includes(q));
  const negCount = db.items.filter(i => i.stock < 0).length;
  $('#view-items').innerHTML = `
    <div class="view-head"><h1>Items</h1><span class="hint">${db.items.length} items${negCount ? ` · ${negCount} with negative stock (purchases weren't recorded in Vyapar)` : ''}</span>
      <span class="spacer"></span>
      <input id="itemSearch" placeholder="Search items…" value="${esc(itemQ)}" oninput="itemQ=this.value;refocusRender('items','itemSearch')" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;outline:none">
      <button class="btn btn-red btn-sm" onclick="itemForm()">＋ Add Item</button></div>
    <div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>Item Name</th><th>HSN</th><th class="num">Sale Price</th><th class="num">Tax</th><th class="num">Stock</th><th>Unit</th></tr></thead>
      <tbody>${list.map(i => `<tr onclick="itemForm(${i.id})">
        <td>${esc(i.name)}</td><td>${esc(i.hsn) || '—'}</td>
        <td class="num">${fmtM(i.salePrice)}</td><td class="num">${i.taxRate ? i.taxRate + '%' : '—'}</td>
        <td class="num ${i.stock < 0 ? 'neg' : ''}">${i.stock}</td><td>${esc(i.unit) || '—'}</td></tr>`).join('')}</tbody>
    </table></div>`;
};
function itemForm(id) {
  const it = id ? itemById(id) : null;
  openModal(modalHead(it ? 'Edit Item' : 'Add Item') + `
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>Item Name *</label><input id="if_name" value="${esc(it?.name || '')}"></div>
      <div class="field"><label>Sale Price (₹, incl. tax)</label><input id="if_price" type="number" step="0.01" value="${it?.salePrice ?? ''}"></div>
      <div class="field"><label>Purchase Price (₹)</label><input id="if_pprice" type="number" step="0.01" value="${it?.purchasePrice ?? ''}"></div>
      <div class="field"><label>GST Rate</label><select id="if_tax">${GST_RATES.map(r => `<option value="${r}" ${it && it.taxRate === r ? 'selected' : (!it && r === 12 ? 'selected' : '')}>${r ? 'GST ' + r + '%' : 'Exempt'}</option>`).join('')}</select></div>
      <div class="field"><label>Unit</label><input id="if_unit" value="${esc(it?.unit || 'Pcs')}"></div>
      <div class="field"><label>Current Stock</label><input id="if_stock" type="number" step="0.01" value="${it?.stock ?? 0}"></div>
      <div class="field"><label>HSN Code</label><input id="if_hsn" value="${esc(it?.hsn || '')}"></div>
    </div></div>
    <div class="modal-foot">
    ${it ? `<button class="btn btn-outline" style="margin-right:auto;color:var(--red);border-color:var(--red)" onclick="deleteItem(${id})">Delete Item</button>` : ''}
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-red" onclick="saveItem(${id || 'null'})">Save</button></div>`);
  setTimeout(() => $('#if_name').focus(), 50);
}
function deleteItem(id) {
  const it = itemById(id); if (!it) return;
  const used = db.invoices.concat(db.purchases).reduce((s, i) => s + i.lines.filter(l => l.itemId === id).length, 0);
  const msg = `Delete item "${it.name}"?` + (used ? `\n\nIt appears on ${used} invoice line(s). Those invoices keep the item as recorded — it just won't be available for new bills.` : '');
  if (!confirm(msg)) return;
  db.items = db.items.filter(x => x.id !== id);
  persist(); closeModal(); toast('Item deleted'); renderers.items();
}
function saveItem(id) {
  const name = $('#if_name').value.trim();
  if (!name) return toast('Item name is required');
  const data = { name, salePrice: +$('#if_price').value || 0, purchasePrice: +$('#if_pprice').value || 0, taxRate: +$('#if_tax').value, unit: $('#if_unit').value.trim(), stock: +$('#if_stock').value || 0, hsn: $('#if_hsn').value.trim() };
  if (id) Object.assign(itemById(id), data);
  else db.items.push({ id: nextId(db.items), code: '', taxName: '', ...data });
  persist(); closeModal(); toast('Item saved'); renderers.items();
}

/* ================= SALE LIST ================= */
let saleFilter = { range: 'all', q: '' };
renderers.sale = function () {
  const today = todayISO();
  let list = [...allSales()];
  if (saleFilter.range === 'month') list = list.filter(i => monthKey(i.date) === monthKey(today));
  if (saleFilter.range === 'year') list = list.filter(i => i.date.startsWith(today.slice(0, 4)));
  if (saleFilter.q) { const q = saleFilter.q.toLowerCase(); list = list.filter(i => i.party.toLowerCase().includes(q) || String(i.ref).includes(q)); }
  list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const total = list.reduce((s, i) => s + i.total, 0);
  $('#view-sale').innerHTML = `
    <div class="view-head"><h1>Sale Invoices</h1><span class="spacer"></span>
      <button class="btn btn-red btn-sm" onclick="openTxnForm('sale')">＋ Add Sale</button></div>
    <div class="filter-bar">
      <select onchange="saleFilter.range=this.value;renderers.sale()">
        <option value="all" ${saleFilter.range === 'all' ? 'selected' : ''}>All time</option>
        <option value="month" ${saleFilter.range === 'month' ? 'selected' : ''}>This month</option>
        <option value="year" ${saleFilter.range === 'year' ? 'selected' : ''}>This year</option>
      </select>
      <input id="saleSearch" placeholder="Search party or invoice #…" value="${esc(saleFilter.q)}" oninput="saleFilter.q=this.value;refocusRender('sale','saleSearch')">
      <div class="filter-total">${list.length} invoices · <b>${fmtM(total)}</b></div>
    </div>
    <div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Invoice #</th><th>Party</th><th>Payment</th><th class="num">Amount</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(i => `<tr onclick="viewInvoice(${i.id})">
        <td>${fmtD(i.date)}</td><td>${esc(db.business.invoicePrefix)}-${esc(i.ref)}</td><td>${esc(i.party)}</td>
        <td>${esc(i.paymentType)}</td><td class="num">${fmtM(i.total)}</td><td class="num">${i.balance ? fmtM(i.balance) : '—'}</td>
        <td>${statusChip(i)}</td>
        <td><button class="btn-ghost btn" onclick="event.stopPropagation();printInvoice(${i.id})" title="Print">🖨</button><button class="btn-ghost btn" onclick="event.stopPropagation();deleteTxn(${i.id},'sale')" title="Delete">🗑</button></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted)">No invoices in this range</td></tr>'}</tbody>
    </table></div>`;
};

/* ================= PURCHASE ================= */
renderers.purchase = function () {
  const list = [...db.purchases].sort((a, b) => b.date.localeCompare(a.date));
  $('#view-purchase').innerHTML = `
    <div class="view-head"><h1>Purchase Bills</h1><span class="spacer"></span>
      <button class="btn btn-red btn-sm" onclick="openTxnForm('purchase')">＋ Add Purchase</button></div>
    ${list.length ? `<div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Bill #</th><th>Party</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
      <tbody>${list.map(i => `<tr onclick="viewInvoice(${i.id},'purchase')"><td>${fmtD(i.date)}</td><td>PB-${esc(i.ref)}</td><td>${esc(i.party)}</td><td class="num">${fmtM(i.total)}</td><td class="num">${i.balance ? fmtM(i.balance) : '—'}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card empty"><div class="big">🛒</div><p>No purchase bills yet.<br>The Vyapar backup had none — record purchases here to fix negative stock.</p>
       <button class="btn btn-red" onclick="openTxnForm('purchase')">＋ Add first Purchase</button></div>`}`;
};

/* ================= EXPENSES ================= */
renderers.expenses = function () {
  const list = [...db.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + e.amount, 0);
  const cats = {};
  list.forEach(e => cats[e.category] = (cats[e.category] || 0) + e.amount);
  $('#view-expenses').innerHTML = `
    <div class="view-head"><h1>Expenses</h1><span class="hint">${list.length ? fmtM(total) + ' total' : ''}</span><span class="spacer"></span>
      <button class="btn btn-red btn-sm" onclick="expenseForm()">＋ Add Expense</button></div>
    ${Object.keys(cats).length ? `<div class="acct-row">${Object.entries(cats).map(([c, v]) => `<div class="card acct"><div class="aname">${esc(c)}</div><div class="aval">${fmtM(v)}</div></div>`).join('')}</div>` : ''}
    ${list.length ? `<div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Payment</th><th class="num">Amount</th></tr></thead>
      <tbody>${list.map((e, i) => `<tr><td>${fmtD(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.desc || '—')}</td><td>${esc(e.paymentType)}</td><td class="num">${fmtM(e.amount)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card empty"><div class="big">💸</div><p>No expenses recorded yet.<br>Vyapar had categories ready: ${db.expenseCategories.map(esc).join(', ')}.</p>
       <button class="btn btn-red" onclick="expenseForm()">＋ Add first Expense</button></div>`}`;
};
function expenseForm() {
  openModal(modalHead('Add Expense') + `
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Category *</label><input id="ef_cat" list="ef_cats" placeholder="Rent, Transport…"><datalist id="ef_cats">${db.expenseCategories.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div class="field"><label>Date</label><input id="ef_date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Amount (₹) *</label><input id="ef_amt" type="number" step="0.01"></div>
      <div class="field"><label>Payment Type</label><select id="ef_pay">${payTypes().map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div class="field full"><label>Note</label><input id="ef_desc"></div>
    </div></div>
    <div class="modal-foot"><button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-red" onclick="saveExpense()">Save</button></div>`);
  setTimeout(() => $('#ef_cat').focus(), 50);
}
function saveExpense() {
  const cat = $('#ef_cat').value.trim(), amt = +$('#ef_amt').value;
  if (!cat || !amt) return toast('Category and amount are required');
  if (!db.expenseCategories.includes(cat)) db.expenseCategories.push(cat);
  db.expenses.push({ id: db.counters.expense++, date: $('#ef_date').value || todayISO(), category: cat, amount: amt, paymentType: $('#ef_pay').value, desc: $('#ef_desc').value.trim() });
  persist(); closeModal(); toast('Expense saved'); renderers.expenses();
}

/* ================= CASH & BANK ================= */
renderers.cashbank = function () {
  const accounts = {};
  allSales().forEach(i => { if (i.received) { accounts[i.paymentType] = accounts[i.paymentType] || { in: 0, out: 0 }; accounts[i.paymentType].in += i.received; } });
  db.purchases.forEach(i => { if (i.received) { accounts[i.paymentType] = accounts[i.paymentType] || { in: 0, out: 0 }; accounts[i.paymentType].out += i.received; } });
  db.expenses.forEach(e => { accounts[e.paymentType] = accounts[e.paymentType] || { in: 0, out: 0 }; accounts[e.paymentType].out += e.amount; });
  const moves = [
    ...allSales().filter(i => i.received).map(i => ({ date: i.date, kind: 'Sale receipt', ref: db.business.invoicePrefix + '-' + i.ref, who: i.party, acct: i.paymentType, amt: i.received })),
    ...db.purchases.filter(i => i.received).map(i => ({ date: i.date, kind: 'Purchase payment', ref: 'PB-' + i.ref, who: i.party, acct: i.paymentType, amt: -i.received })),
    ...db.expenses.map(e => ({ date: e.date, kind: 'Expense', ref: e.category, who: e.desc || '', acct: e.paymentType, amt: -e.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);
  $('#view-cashbank').innerHTML = `
    <div class="view-head"><h1>Cash &amp; Bank</h1><span class="hint">money in and out by account</span></div>
    <div class="acct-row">${Object.entries(accounts).map(([n, a]) => `<div class="card acct"><div class="aname">${esc(n)}</div><div class="aval">${fmtM(a.in - a.out)}</div><div class="asub">in ${fmtM(a.in)} · out ${fmtM(a.out)}</div></div>`).join('') || '<div class="hint">No money movement yet</div>'}</div>
    <div class="card tbl-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Party / Note</th><th>Account</th><th class="num">Amount</th></tr></thead>
      <tbody>${moves.map(m => `<tr><td>${fmtD(m.date)}</td><td>${m.kind}</td><td>${esc(m.ref)}</td><td>${esc(m.who)}</td><td>${esc(m.acct)}</td><td class="num ${m.amt < 0 ? 'neg' : 'pos'}">${fmtM(m.amt)}</td></tr>`).join('')}</tbody></table></div>`;
};

/* ================= REPORTS ================= */
let reportView = null;
renderers.reports = function () {
  if (reportView) return renderReport(reportView);
  const ic = p => `<div class="ric"><svg viewBox="0 0 24 24">${p}</svg></div>`;
  $('#view-reports').innerHTML = `
    <div class="view-head"><h1>Reports</h1></div>
    <div class="report-cards">
      <div class="card rcard" onclick="openReport('sale')">${ic('<path d="M4 20V9M10 20V4M16 20v-8M21 20H3"/>')}<h3>Sale Report</h3><p>All invoices in a date range with totals</p></div>
      <div class="card rcard" onclick="openReport('party')">${ic('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/>')}<h3>Party Statement</h3><p>Every transaction for one party</p></div>
      <div class="card rcard" onclick="openReport('item')">${ic('<path d="M12 3l8 4v10l-8 4-8-4V7z"/><path d="M4 7l8 4 8-4"/>')}<h3>Item Sale Summary</h3><p>Quantity sold and revenue per item</p></div>
      <div class="card rcard" onclick="openReport('tax')">${ic('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>')}<h3>GST Summary</h3><p>Taxable value and tax by rate</p></div>
      <div class="card rcard" onclick="openReport('monthly')">${ic('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>')}<h3>Monthly Summary</h3><p>Sales month by month</p></div>
    </div>`;
};
function openReport(kind) { reportView = { kind, from: '', to: '', partyId: db.parties[0]?.id }; renderReport(reportView); }
function closeReport() { reportView = null; renderers.reports(); }

function reportRows(rv) {
  let sales = allSales().filter(i => (!rv.from || i.date >= rv.from) && (!rv.to || i.date <= rv.to));
  sales.sort((a, b) => a.date.localeCompare(b.date));
  if (rv.kind === 'sale')
    return { head: ['Date', 'Invoice #', 'Party', 'Payment', 'Amount', 'Balance'], num: [4, 5],
      rows: sales.map(i => [fmtD(i.date), db.business.invoicePrefix + '-' + i.ref, i.party, i.paymentType, i.total, i.balance]),
      foot: ['', '', '', 'Total', sales.reduce((s, i) => s + i.total, 0), sales.reduce((s, i) => s + i.balance, 0)] };
  if (rv.kind === 'party') {
    const rows = sales.filter(i => i.partyId === rv.partyId);
    let run = 0;
    return { head: ['Date', 'Invoice #', 'Amount', 'Received', 'Running Total'], num: [2, 3, 4],
      rows: rows.map(i => { run += i.total; return [fmtD(i.date), db.business.invoicePrefix + '-' + i.ref, i.total, i.received, run]; }),
      foot: ['', 'Total', rows.reduce((s, i) => s + i.total, 0), rows.reduce((s, i) => s + i.received, 0), run] };
  }
  if (rv.kind === 'item') {
    const agg = {};
    sales.forEach(i => i.lines.forEach(l => { const a = agg[l.name] = agg[l.name] || { qty: 0, amt: 0 }; a.qty += l.qty; a.amt += l.amount; }));
    const rows = Object.entries(agg).sort((a, b) => b[1].amt - a[1].amt);
    return { head: ['Item', 'Qty Sold', 'Revenue'], num: [1, 2],
      rows: rows.map(([n, a]) => [n, a.qty, a.amt]),
      foot: ['Total', rows.reduce((s, r) => s + r[1].qty, 0), rows.reduce((s, r) => s + r[1].amt, 0)] };
  }
  if (rv.kind === 'tax') {
    const agg = {};
    sales.forEach(i => { const partyIntra = isIntraState(partyById(i.partyId)); i.lines.forEach(l => {
      const intra = l.taxName ? !/^IGST/i.test(l.taxName) : partyIntra;
      const k = l.taxRate + '|' + (intra ? 'intra' : 'inter');
      const a = agg[k] = agg[k] || { rate: l.taxRate, intra, taxable: 0, tax: 0 };
      a.taxable += l.amount - l.taxAmount; a.tax += l.taxAmount; }); });
    const rows = Object.values(agg).sort((a, b) => a.rate - b.rate);
    return { head: ['GST Rate', 'Type', 'Taxable Value', 'CGST', 'SGST', 'IGST'], num: [2, 3, 4, 5],
      rows: rows.map(a => [a.rate + '%', a.intra ? 'Intra-state' : 'Inter-state', a.taxable, a.intra ? a.tax / 2 : 0, a.intra ? a.tax / 2 : 0, a.intra ? 0 : a.tax]),
      foot: ['Total', '', rows.reduce((s, a) => s + a.taxable, 0), rows.reduce((s, a) => s + (a.intra ? a.tax / 2 : 0), 0), rows.reduce((s, a) => s + (a.intra ? a.tax / 2 : 0), 0), rows.reduce((s, a) => s + (a.intra ? 0 : a.tax), 0)] };
  }
  // monthly
  const agg = {};
  sales.forEach(i => { const k = monthKey(i.date); const a = agg[k] = agg[k] || { n: 0, amt: 0 }; a.n++; a.amt += i.total; });
  const rows = Object.entries(agg).sort();
  return { head: ['Month', 'Invoices', 'Sale Amount'], num: [1, 2],
    rows: rows.map(([k, a]) => { const [y, m] = k.split('-'); return [MONTHS[+m - 1] + ' ' + y, a.n, a.amt]; }),
    foot: ['Total', rows.reduce((s, r) => s + r[1].n, 0), rows.reduce((s, r) => s + r[1].amt, 0)] };
}
const REPORT_TITLES = { sale: 'Sale Report', party: 'Party Statement', item: 'Item Sale Summary', tax: 'GST Summary', monthly: 'Monthly Summary' };
function renderReport(rv) {
  const d = reportRows(rv);
  const cell = (v, ci) => d.num.includes(ci) && typeof v === 'number' ? `<td class="num">${fmtM(v)}</td>` : `<td>${esc(v)}</td>`;
  $('#view-reports').innerHTML = `
    <div class="view-head"><button class="btn btn-outline btn-sm" onclick="closeReport()">← Reports</button><h1>${REPORT_TITLES[rv.kind]}</h1><span class="spacer"></span>
      <button class="btn btn-outline btn-sm" onclick="exportReportCSV()">⬇ CSV</button>
      <button class="btn btn-red btn-sm" onclick="printReport()">🖨 Print</button></div>
    <div class="filter-bar">
      ${rv.kind === 'party' ? `<select onchange="reportView.partyId=+this.value;renderReport(reportView)">${db.parties.map(p => `<option value="${p.id}" ${p.id === rv.partyId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
      <label class="hint">From</label><input type="date" value="${rv.from}" onchange="reportView.from=this.value;renderReport(reportView)">
      <label class="hint">To</label><input type="date" value="${rv.to}" onchange="reportView.to=this.value;renderReport(reportView)">
      <div class="filter-total">${d.rows.length} rows</div>
    </div>
    <div class="card tbl-wrap"><table class="tbl" id="reportTable">
      <thead><tr>${d.head.map((h, i) => `<th class="${d.num.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
      <tbody>${d.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${d.head.length}" style="text-align:center;padding:30px;color:var(--muted)">No data in range</td></tr>`}</tbody>
      ${d.rows.length ? `<tfoot><tr>${d.foot.map(cell).join('')}</tr></tfoot>` : ''}
    </table></div>`;
}
function exportReportCSV() {
  const d = reportRows(reportView);
  const rows = [d.head, ...d.rows, d.foot].map(r => r.map(v => csvCell(typeof v === 'number' ? v.toFixed(2) : v)).join(','));
  download(REPORT_TITLES[reportView.kind].replace(/\W+/g, '_') + '.csv', rows.join('\n'), 'text/csv');
}
function printReport() {
  const d = reportRows(reportView);
  const cell = (v, ci) => `<td class="${d.num.includes(ci) ? 'num' : ''}">${typeof v === 'number' ? fmtM(v) : esc(v)}</td>`;
  $('#printArea').innerHTML = `<div class="inv">
    <div class="inv-head"><div class="co"><h1>${esc(db.business.name)}</h1><div class="addr">${esc(db.business.address)}<br>GSTIN: ${esc(db.business.gstin)}</div></div>
    <div class="doc"><div class="t">${REPORT_TITLES[reportView.kind].toUpperCase()}</div><div class="m">${reportView.from || 'start'} → ${reportView.to || 'today'}</div></div></div>
    <table class="inv-lines" style="margin-top:16px"><thead><tr>${d.head.map((h, i) => `<th class="${d.num.includes(i) ? 'num' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody>${d.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}<tr style="font-weight:700">${d.foot.map(cell).join('')}</tr></tbody></table></div>`;
  window.print();
}

/* ================= SETTINGS ================= */
renderers.settings = function () {
  const b = db.business;
  const used = Math.round((localStorage.getItem(LS_KEY) || '').length / 1024);
  $('#view-settings').innerHTML = `
    <div class="view-head"><h1>Settings</h1></div>
    <div class="settings-grid">
      <div class="card settings-card">
        <h3>Business Profile</h3>
        <div class="form-grid">
          <div class="field full"><label>Business Name</label><input id="sb_name" value="${esc(b.name)}"></div>
          <div class="field"><label>Phone</label><input id="sb_phone" value="${esc(b.phone)}"></div>
          <div class="field"><label>Email</label><input id="sb_email" value="${esc(b.email)}"></div>
          <div class="field"><label>GSTIN</label><input id="sb_gstin" value="${esc(b.gstin)}"></div>
          <div class="field"><label>Invoice Prefix</label><input id="sb_prefix" value="${esc(b.invoicePrefix)}"></div>
          <div class="field full"><label>Address</label><textarea id="sb_addr">${esc(b.address)}</textarea></div>
          <div class="field full"><label>Bank Name (on invoice)</label><input id="sb_bankname" value="${esc(b.bank?.name || '')}"></div>
          <div class="field"><label>Bank Account No.</label><input id="sb_bankacct" value="${esc(b.bank?.account || '')}"></div>
          <div class="field"><label>Bank IFSC</label><input id="sb_bankifsc" value="${esc(b.bank?.ifsc || '')}"></div>
          <div class="field"><label>Account Holder</label><input id="sb_bankholder" value="${esc(b.bank?.holder || '')}"></div>
          <div class="field"><label>Signature Name</label><input id="sb_signname" value="${esc(b.signName || '')}"></div>
        </div>
        <div class="row-btns"><button class="btn btn-red" onclick="saveBusiness()">Save Profile</button></div>
      </div>
      <div class="card settings-card">
        <h3>Data</h3>
        <p class="hint">Everything is stored in this browser (localStorage) — ${used} KB used. Take a backup regularly: it downloads a JSON file you can restore on any machine.</p>
        <div class="row-btns">
          <button class="btn btn-outline" onclick="exportBackup()">⬇ Download Backup</button>
          <button class="btn btn-outline" onclick="$('#importFile').click()">⬆ Restore Backup</button>
          <input type="file" id="importFile" accept=".json" style="display:none" onchange="importBackup(this)">
        </div>
        <div class="danger-note">Reset restores the original data converted from the Vyapar backup (12 Aug 2026) — anything added after that in this app is lost.</div>
        <div class="row-btns"><button class="btn btn-outline" style="color:var(--red);border-color:var(--red)" onclick="resetSeed()">Reset to Vyapar data</button></div>
      </div>
    </div>`;
};
function saveBusiness() {
  Object.assign(db.business, { name: $('#sb_name').value.trim(), phone: $('#sb_phone').value.trim(), email: $('#sb_email').value.trim(), gstin: $('#sb_gstin').value.trim(), invoicePrefix: $('#sb_prefix').value.trim() || 'SR', address: $('#sb_addr').value.trim(),
    bank: { name: $('#sb_bankname').value.trim(), account: $('#sb_bankacct').value.trim(), ifsc: $('#sb_bankifsc').value.trim(), holder: $('#sb_bankholder').value.trim() },
    signName: $('#sb_signname').value.trim() });
  persist(); toast('Profile saved');
  $('#firmName').textContent = db.business.name; $('#firmPhone').textContent = db.business.phone;
  $('#firmAvatar').textContent = db.business.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function exportBackup() {
  download('aayu_billing_backup_' + todayISO() + '.json', JSON.stringify(db, null, 1), 'application/json');
  toast('Backup downloaded');
}
function importBackup(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d.business || !d.invoices) throw new Error('not a valid backup');
      db = d; persist(); toast('Backup restored'); showView('dashboard');
    } catch (e) { toast('Invalid backup file'); }
  };
  r.readAsText(f); input.value = '';
}
function resetSeed() {
  if (!confirm('Reset all data back to the Vyapar backup (12 Aug 2026)? Anything added since will be lost.')) return;
  if (typeof SEED_DATA !== 'undefined') {
    db = JSON.parse(JSON.stringify(SEED_DATA)); persist(); toast('Data reset'); showView('dashboard');
  } else { // encrypted build — clear and go back through the unlock screen
    localStorage.removeItem(LS_KEY); location.reload();
  }
}

/* ================= INVOICE VIEW & PRINT ================= */
function invoiceHTML(inv, kind) {
  const b = db.business, p = partyById(inv.partyId);
  const bank = b.bank || {};
  const intra = isIntraState(p);
  const taxable = inv.lines.reduce((s, l) => s + l.amount - l.taxAmount, 0);
  const qtyTotal = inv.lines.reduce((s, l) => s + l.qty, 0);
  const taxTotal = inv.lines.reduce((s, l) => s + l.taxAmount, 0);
  const taxRows = {};
  inv.lines.forEach(l => {
    if (!l.taxRate) return;
    const igst = l.taxName ? /^IGST/i.test(l.taxName) : !intra;
    const k = l.taxRate + '|' + igst;
    taxRows[k] = taxRows[k] || { rate: +l.taxRate, igst, amt: 0 };
    taxRows[k].amt += l.taxAmount;
  });
  const invNo = (kind === 'purchase' ? 'PB' : b.invoicePrefix) + inv.ref;
  return `<div class="inv">
    <div class="iv-co">
      <h1>${esc(b.name)}</h1>
      <div>${esc(b.address)}</div>
      <div><b>Phone no.:</b> ${esc(b.phone)}</div>
      <div><b>Email:</b> ${esc(b.email)}</div>
      <div><b>GSTIN:</b> ${esc(b.gstin)}</div>
      <div><b>State:</b> ${esc((b.gstin || '').slice(0, 2))}-${esc(b.state)}</div>
    </div>
    <div class="iv-title">${kind === 'purchase' ? 'Purchase Bill' : 'Tax Invoice'}</div>
    <div class="iv-meta">
      <div>
        <h3>Bill To</h3>
        <div class="iv-who">${esc(inv.party)}</div>
        ${p && p.address ? `<div class="iv-addr">${esc(p.address)}</div>` : ''}
        ${p && p.phone ? `<div class="iv-addr">Contact No.: ${esc(p.phone)}</div>` : ''}
        ${p && p.gstin ? `<div class="iv-addr">GSTIN: ${esc(p.gstin)}</div>` : ''}
      </div>
      <div class="iv-right">
        <h3>Invoice Details</h3>
        <div><b>Invoice No.:</b> ${esc(invNo)}</div>
        <div><b>Date:</b> ${fmtDMY(inv.date)}</div>
      </div>
    </div>
    <table class="iv-items">
      <thead><tr><th style="width:5%">#</th><th>Item name</th><th class="num">Quantity</th><th class="num">Price/ Unit</th><th class="num">GST</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${inv.lines.map((l, i) => `<tr>
          <td>${i + 1}</td><td>${esc(l.name)}</td><td class="num">${l.qty}</td>
          <td class="num">${fmtM2(l.rateExcl != null ? l.rateExcl : l.rate)}</td>
          <td class="num">${fmtM2(l.taxAmount)}<br><span class="iv-rate">(${(l.taxRate || 0).toFixed(1)}%)</span></td>
          <td class="num">${fmtM2(l.amount)}</td></tr>`).join('')}
        <tr class="iv-total-row"><td></td><td><b>Total</b></td><td class="num"><b>${qtyTotal}</b></td><td></td><td class="num"><b>${fmtM2(taxTotal)}</b></td><td class="num"><b>${fmtM2(inv.total)}</b></td></tr>
      </tbody>
    </table>
    <div class="iv-bottom">
      <div class="iv-left">
        <h3>Invoice Amount In Words</h3>
        <div class="iv-words">${wordsTitle(inv.total)} Rupees only</div>
        <h3>Terms And Conditions</h3>
        <div>${esc(b.terms || 'Thank you for your purchase!')}</div>
      </div>
      <div class="iv-sum">
        <div class="iv-srow"><span>Sub Total</span><span>${fmtM2(taxable)}</span></div>
        ${Object.values(taxRows).map(t => t.igst
          ? `<div class="iv-srow"><span>IGST@${t.rate.toFixed(1)}%</span><span>${fmtM2(t.amt)}</span></div>`
          : `<div class="iv-srow"><span>CGST@${(t.rate / 2).toFixed(1)}%</span><span>${fmtM2(t.amt / 2)}</span></div><div class="iv-srow"><span>SGST@${(t.rate / 2).toFixed(1)}%</span><span>${fmtM2(t.amt / 2)}</span></div>`).join('')}
        ${inv.roundOff ? `<div class="iv-srow"><span>Round Off</span><span>${fmtM2(inv.roundOff)}</span></div>` : ''}
        <div class="iv-srow iv-band"><span>Total</span><span>${fmtM2(inv.total)}</span></div>
        <div class="iv-srow"><span>Received</span><span>${fmtM2(inv.received)}</span></div>
        <div class="iv-srow"><span>Balance</span><span>${fmtM2(inv.balance)}</span></div>
      </div>
    </div>
    <div class="iv-foot">
      ${bank.account ? `<div class="iv-payto">
        <h3>Pay To:</h3>
        <div><b>Bank Name:</b> ${esc(bank.name)}</div>
        <div><b>Bank Account No.:</b> ${esc(bank.account)}</div>
        <div><b>Bank IFSC code:</b> ${esc(bank.ifsc)}</div>
        <div><b>Account Holder's Name:</b> ${esc(bank.holder)}</div>
      </div>` : '<div></div>'}
      <div class="iv-sign">
        <div class="iv-for">For: ${esc(b.name)}</div>
        ${b.signature ? `<img src="${b.signature}" alt="signature">` : ''}
        <div class="iv-signer">${esc(b.signName || '')}</div>
      </div>
    </div>
  </div>`;
}
function findTxn(id, kind) { return (kind === 'purchase' ? db.purchases : db.invoices).find(i => i.id === id); }
function deleteTxn(id, kind) {
  const isSale = kind !== 'purchase';
  const coll = isSale ? db.invoices : db.purchases;
  const inv = coll.find(i => i.id === id); if (!inv) return;
  const label = (isSale ? db.business.invoicePrefix + '-' : 'PB-') + inv.ref;
  if (!confirm(`Delete ${isSale ? 'invoice' : 'purchase'} ${label} — ${inv.party}, ${fmtM(inv.total)}?\n\nItem stock and the party balance will be adjusted back. This cannot be undone.`)) return;
  // reverse stock movement
  inv.lines.forEach(l => { const it = itemById(l.itemId); if (it) it.stock = +(it.stock + (isSale ? l.qty : -l.qty)).toFixed(2); });
  // reverse the unpaid portion on the party ledger
  const p = partyById(inv.partyId);
  if (p && inv.balance) p.balance = +(p.balance - (isSale ? inv.balance : -inv.balance)).toFixed(2);
  coll.splice(coll.indexOf(inv), 1);
  // free the number again if this was the latest invoice
  const c = isSale ? 'sale' : 'purchase';
  if (String(db.counters[c] - 1) === String(inv.ref)) db.counters[c]--;
  persist(); closeModal(); toast(label + ' deleted');
  showView(currentView);
}
function viewInvoice(id, kind) {
  const inv = findTxn(id, kind); if (!inv) return;
  openModal(modalHead((kind === 'purchase' ? 'Purchase PB-' : 'Invoice ' + db.business.invoicePrefix + '-') + inv.ref) +
    invoiceHTML(inv, kind) +
    `<div class="modal-foot">
     <button class="btn btn-outline" style="margin-right:auto;color:var(--red);border-color:var(--red)" onclick="deleteTxn(${id},'${kind || 'sale'}')">Delete</button>
     <button class="btn btn-outline" onclick="closeModal()">Close</button>
     <button class="btn btn-red" onclick="printInvoice(${id},'${kind || 'sale'}')">🖨 Print</button></div>`, true);
}
function printInvoice(id, kind) {
  const inv = findTxn(id, kind); if (!inv) return;
  $('#printArea').innerHTML = invoiceHTML(inv, kind);
  window.print();
}

/* ================= ADD SALE / PURCHASE FORM ================= */
let txn = null; // working state
function openTxnForm(type, partyId) {
  txn = { type, date: todayISO(), partyId: partyId || null, partyName: partyId ? partyById(partyId).name : '', lines: [], received: 0, full: true, paymentType: 'Cash' };
  addLine(); addLine();
  renderTxnForm();
  $('#txnOverlay').classList.add('open');
  setTimeout(() => $('#tx_party')?.focus(), 60);
}
function closeTxn() { $('#txnOverlay').classList.remove('open'); txn = null; }
function addLine() { txn.lines.push({ itemId: null, name: '', qty: 1, unit: 'Pcs', rate: 0, taxRate: 12, amount: 0 }); }

function lineTax(l) { return l.amount - l.amount / (1 + l.taxRate / 100); }
function txnTotals() {
  const gross = txn.lines.reduce((s, l) => s + l.amount, 0);
  const tax = txn.lines.reduce((s, l) => s + lineTax(l), 0);
  const total = Math.round(gross);
  const roundOff = total - gross;
  return { gross, tax, taxable: gross - tax, roundOff: Math.abs(roundOff) > 0.004 ? roundOff : 0, total };
}

function renderTxnForm() {
  const t = txnTotals();
  const isSale = txn.type === 'sale';
  const ref = isSale ? db.business.invoicePrefix + '-' + db.counters.sale : 'PB-' + db.counters.purchase;
  const received = txn.full ? t.total : txn.received;
  $('#txnOverlay').innerHTML = `
    <div class="txn-head">
      <button class="btn btn-outline btn-sm" onclick="closeTxn()">← Back</button>
      <h1>${isSale ? 'Add Sale' : 'Add Purchase'}</h1><span class="ref">${ref} · ${fmtD(txn.date)}</span>
    </div>
    <div class="txn-body">
      <div class="txn-top">
        <div class="field item-picker"><label>${isSale ? 'Customer' : 'Supplier'} *</label>
          <input id="tx_party" placeholder="Search or add party…" value="${esc(txn.partyName)}" autocomplete="off"
            oninput="partyPick(this.value)" onfocus="partyPick(this.value)">
          <div class="picker-drop" id="partyDrop"></div>
        </div>
        <div class="field"><label>Phone</label><input value="${esc(txn.partyId ? (partyById(txn.partyId)?.phone || '') : '')}" disabled></div>
        <div class="field"><label>Date</label><input type="date" value="${txn.date}" onchange="txn.date=this.value;renderTxnForm()"></div>
      </div>
      <table class="lines">
        <thead><tr><th style="width:38%">Item</th><th style="width:10%">Qty</th><th style="width:9%">Unit</th><th style="width:13%">Rate (incl. GST)</th><th style="width:10%">GST %</th><th style="width:14%;text-align:right">Amount</th><th></th></tr></thead>
        <tbody>
        ${txn.lines.map((l, i) => `<tr>
          <td class="item-picker"><input id="li_${i}" placeholder="Type item name…" value="${esc(l.name)}" autocomplete="off"
              oninput="itemPick(${i},this.value)" onfocus="itemPick(${i},this.value)"><div class="picker-drop" id="itemDrop_${i}"></div></td>
          <td class="num"><input type="number" min="0" step="any" value="${l.qty}" onchange="setLine(${i},'qty',+this.value)"></td>
          <td><input value="${esc(l.unit)}" onchange="setLine(${i},'unit',this.value)"></td>
          <td class="num"><input type="number" min="0" step="any" value="${l.rate || ''}" onchange="setLine(${i},'rate',+this.value)" onkeydown="if(event.key==='Enter'){addLine();renderTxnForm();setTimeout(()=>document.getElementById('li_'+(txn.lines.length-1)).focus(),40)}"></td>
          <td><select onchange="setLine(${i},'taxRate',+this.value)">${GST_RATES.map(r => `<option value="${r}" ${l.taxRate === r ? 'selected' : ''}>${r}%</option>`).join('')}</select></td>
          <td class="amt-cell">${fmtM(l.amount)}</td>
          <td><button class="rm" onclick="txn.lines.splice(${i},1);if(!txn.lines.length)addLine();renderTxnForm()" title="Remove">×</button></td>
        </tr>`).join('')}
        </tbody>
      </table>
      <button class="btn btn-outline btn-sm add-line" onclick="addLine();renderTxnForm();setTimeout(()=>document.getElementById('li_'+(txn.lines.length-1)).focus(),40)">＋ Add Row (or press Enter in Rate)</button>
      <div class="txn-bottom">
        <div></div>
        <div class="card totals-card">
          <div class="trow muted"><span>Taxable value</span><span class="tval">${fmtM(t.taxable)}</span></div>
          <div class="trow muted"><span>GST</span><span class="tval">${fmtM(t.tax)}</span></div>
          ${t.roundOff ? `<div class="trow muted"><span>Round off</span><span class="tval">${fmtM(t.roundOff)}</span></div>` : ''}
          <div class="trow grand"><span>Total</span><span class="tval">${fmtM(t.total)}</span></div>
          <div class="trow"><span>${isSale ? 'Received' : 'Paid'} <label style="font-weight:400;color:var(--muted)"><input type="checkbox" ${txn.full ? 'checked' : ''} onchange="txn.full=this.checked;renderTxnForm()"> full</label></span>
            <input type="number" min="0" step="any" value="${received.toFixed(2)}" ${txn.full ? 'disabled' : ''} onchange="txn.received=+this.value;renderTxnForm()"></div>
          <div class="trow"><span>Payment type</span>
            <select style="width:150px" onchange="txn.paymentType=this.value">${payTypes().map(p => `<option ${txn.paymentType === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
          <div class="trow muted"><span>Balance</span><span class="tval">${fmtM(t.total - received)}</span></div>
        </div>
      </div>
    </div>
    <div class="txn-actions">
      <button class="btn btn-outline" onclick="closeTxn()">Cancel</button>
      <button class="btn btn-outline-blue" onclick="saveTxn(true)">Save &amp; Print</button>
      <button class="btn btn-red" onclick="saveTxn(false)">Save ${isSale ? 'Sale' : 'Purchase'}</button>
    </div>`;
}
function setLine(i, k, v) { const l = txn.lines[i]; l[k] = v; l.amount = +(l.qty * l.rate).toFixed(2); renderTxnForm(); }

function partyPick(q) {
  txn.partyName = q; txn.partyId = null;
  const drop = $('#partyDrop'); const ql = q.toLowerCase();
  const hits = db.parties.filter(p => p.name.toLowerCase().includes(ql));
  drop.innerHTML = hits.map(p => `<div class="pd-item" onmousedown="chooseParty(${p.id})"><span>${esc(p.name)}</span><span class="m">${esc(p.phone)}</span></div>`).join('') +
    (q.trim() && !hits.some(h => h.name.toLowerCase() === ql) ? `<div class="pd-new" onmousedown="quickAddParty()">＋ Add "${esc(q.trim())}" as new party</div>` : '');
  drop.classList.toggle('open', !!(hits.length || q.trim()));
}
function chooseParty(id) { const p = partyById(id); txn.partyId = id; txn.partyName = p.name; renderTxnForm(); setTimeout(() => $('#li_0')?.focus(), 40); }
function quickAddParty() {
  const name = txn.partyName.trim(); if (!name) return;
  const id = nextId(db.parties);
  db.parties.push({ id, name, phone: '', email: '', address: '', gstin: '', state: '', balance: 0, createdAt: todayISO(), lastTxn: '' });
  db.parties.sort((a, b) => a.name.localeCompare(b.name));
  persist(); chooseParty(id); toast('Party added');
}
function itemPick(i, q) {
  const l = txn.lines[i]; l.name = q; l.itemId = null;
  const drop = $('#itemDrop_' + i); const ql = q.toLowerCase();
  const hits = db.items.filter(it => it.name.toLowerCase().includes(ql));
  drop.innerHTML = hits.map(it => `<div class="pd-item" onmousedown="chooseItem(${i},${it.id})"><span>${esc(it.name)}</span><span class="m">${fmtM(it.salePrice)} · stk ${it.stock}</span></div>`).join('') +
    (q.trim() && !hits.some(h => h.name.toLowerCase() === ql) ? `<div class="pd-new" onmousedown="quickAddItem(${i})">＋ Add "${esc(q.trim())}" as new item</div>` : '');
  drop.classList.toggle('open', !!(hits.length || q.trim()));
}
function chooseItem(i, itemId) {
  const it = itemById(itemId), l = txn.lines[i];
  l.itemId = itemId; l.name = it.name; l.unit = it.unit || 'Pcs'; l.taxRate = it.taxRate || 0;
  l.rate = txn.type === 'purchase' && it.purchasePrice ? it.purchasePrice : it.salePrice;
  l.amount = +(l.qty * l.rate).toFixed(2);
  renderTxnForm();
}
function quickAddItem(i) {
  const l = txn.lines[i]; const name = l.name.trim(); if (!name) return;
  const id = nextId(db.items);
  db.items.push({ id, name, salePrice: 0, purchasePrice: 0, stock: 0, unit: 'Pcs', hsn: '', code: '', taxRate: 12, taxName: '' });
  persist(); chooseItem(i, id); toast('Item added — set its price in the row');
}

function saveTxn(print) {
  const isSale = txn.type === 'sale';
  if (!txn.partyId && !txn.partyName.trim()) return toast('Select a ' + (isSale ? 'customer' : 'supplier'));
  if (!txn.partyId) { quickAddParty(); }
  const lines = txn.lines.filter(l => l.name.trim() && l.amount > 0);
  if (!lines.length) return toast('Add at least one item');
  const t = txnTotals();
  const received = txn.full ? t.total : Math.min(txn.received, t.total);
  const inv = {
    id: nextId(isSale ? db.invoices : db.purchases),
    type: txn.type,
    ref: String(isSale ? db.counters.sale++ : db.counters.purchase++),
    date: txn.date, partyId: txn.partyId, party: txn.partyName.trim(),
    total: t.total, received, balance: +(t.total - received).toFixed(2),
    tax: +t.tax.toFixed(2), discount: 0, roundOff: +t.roundOff.toFixed(2),
    taxInclusive: true, paymentType: txn.paymentType, desc: '',
    lines: lines.map(l => ({ itemId: l.itemId, name: l.name.trim(), qty: l.qty, unit: l.unit, rate: l.rate, rateExcl: +(l.rate / (1 + l.taxRate / 100)).toFixed(2), amount: l.amount, taxRate: l.taxRate, taxAmount: +lineTax(l).toFixed(2), discount: 0 })),
  };
  (isSale ? db.invoices : db.purchases).push(inv);
  // stock & party balance
  lines.forEach(l => { const it = itemById(l.itemId); if (it) it.stock = +(it.stock + (isSale ? -l.qty : l.qty)).toFixed(2); });
  const p = partyById(txn.partyId);
  if (p) { p.balance = +(p.balance + (isSale ? inv.balance : -inv.balance)).toFixed(2); p.lastTxn = txn.date; }
  persist();
  closeTxn();
  toast((isSale ? 'Sale ' + db.business.invoicePrefix + '-' : 'Purchase PB-') + inv.ref + ' saved');
  showView(isSale ? 'sale' : 'purchase');
  if (print) printInvoice(inv.id, txn ? txn.type : inv.type);
}

/* ================= GLOBAL SEARCH ================= */
const gs = $('#globalSearch'), gr = $('#searchResults');
gs.addEventListener('input', () => {
  const q = gs.value.trim().toLowerCase();
  if (!q) { gr.classList.remove('open'); return; }
  const ps = db.parties.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 5);
  const its = db.items.filter(i => i.name.toLowerCase().includes(q)).slice(0, 5);
  const invs = allSales().filter(i => String(i.ref).includes(q) || i.party.toLowerCase().includes(q)).slice(0, 5);
  gr.innerHTML =
    (ps.length ? `<div class="sr-group">Parties</div>` + ps.map(p => `<div class="sr-item" onmousedown="gotoParty(${p.id})"><span>${esc(p.name)}</span><span class="amt">${esc(p.phone)}</span></div>`).join('') : '') +
    (its.length ? `<div class="sr-group">Items</div>` + its.map(i => `<div class="sr-item" onmousedown="gotoItem(${i.id})"><span>${esc(i.name)}</span><span class="amt">${fmtM(i.salePrice)}</span></div>`).join('') : '') +
    (invs.length ? `<div class="sr-group">Invoices</div>` + invs.map(i => `<div class="sr-item" onmousedown="viewInvoice(${i.id})"><span>${esc(db.business.invoicePrefix)}-${esc(i.ref)} · ${esc(i.party)}</span><span class="amt">${fmtM(i.total)}</span></div>`).join('') : '') ||
    `<div class="sr-group">No results for "${esc(q)}"</div>`;
  gr.classList.add('open');
});
gs.addEventListener('blur', () => setTimeout(() => gr.classList.remove('open'), 150));
function gotoParty(id) { selParty = id; partyQ = ''; showView('parties'); gs.value = ''; }
function gotoItem(id) { const it = itemById(id); itemQ = it ? it.name : ''; showView('items'); gs.value = ''; }
function refocusRender(view, id) {
  renderers[view]();
  const el = document.getElementById(id);
  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

/* ================= INIT ================= */
$('#btnAddSale').addEventListener('click', () => openTxnForm('sale'));
$('#btnAddPurchase').addEventListener('click', () => openTxnForm('purchase'));
(function init() {
  if (!db) { showUnlock(); return; }
  $('#firmName').textContent = db.business.name;
  $('#firmPhone').textContent = db.business.phone;
  $('#firmAvatar').textContent = db.business.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const h = location.hash.slice(1);
  showView(renderers[h] ? h : 'dashboard');
})();
