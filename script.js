/* ==========================================================
   Bob Garage Tailor – logika user flow (prototipe)
   Alur: Beranda > Katalog > Form > Estimasi > Jadwal > Ringkasan
         > Verifikasi > DP > Konfirmasi > Pelacakan > Pelunasan > Penerimaan
   Hari kerja: Senin sampai Jumat (Sabtu dan Minggu tidak dihitung)
   ========================================================== */
(() => {
    'use strict';

    /* ---------- Data layanan (tarif contoh, sesuaikan dengan Laporan Tahap 1) ---------- */
    const SERVICES = [
        { id: 'a-hem', lini: 'A', nama: 'Potong hem celana', tarif: 25000, hari: 1, ket: 'Menyesuaikan panjang celana atau rok.' },
        { id: 'a-pinggang', lini: 'A', nama: 'Kecilkan atau besarkan pinggang', tarif: 35000, hari: 2, ket: 'Penyesuaian lingkar pinggang celana dan rok.' },
        { id: 'a-resleting', lini: 'A', nama: 'Ganti resleting', tarif: 30000, hari: 1, ket: 'Resleting celana, rok, atau jaket.' },
        { id: 'a-lengan', lini: 'A', nama: 'Pendekkan lengan', tarif: 40000, hari: 2, ket: 'Lengan kemeja atau jaket.' },
        { id: 'a-tambal', lini: 'A', nama: 'Tambal dan obras', tarif: 20000, hari: 1, ket: 'Sobek kecil, jahitan lepas, atau tepi kain.' },
        { id: 'b-kemeja', lini: 'B', nama: 'Kemeja standar', tarif: 180000, hari: 7, ket: 'Jahit baru dengan pola standar.' },
        { id: 'b-celana', lini: 'B', nama: 'Celana standar', tarif: 160000, hari: 6, ket: 'Jahit baru dengan pola standar.' },
        { id: 'b-rok', lini: 'B', nama: 'Rok standar', tarif: 140000, hari: 5, ket: 'Jahit baru dengan pola standar.' }
    ];
    const LINI = { A: 'Permak dan perbaikan (Lini A)', B: 'Jahit baru standar (Lini B)' };

    /* Enam tahap pelacakan. Admin tidak memperbarui status pengerjaan. */
    const STAGES = [
        { label: 'Pesanan terkonfirmasi', by: 'Sistem', desc: 'DP sudah dikonfirmasi dan pesanan masuk antrean.' },
        { label: 'Pakaian dijemput', by: 'Kurir', desc: 'Pakaian sudah diterima dari Anda.' },
        { label: 'Sedang dikerjakan', by: 'Penjahit', desc: 'Penjahit sedang mengerjakan pesanan Anda.' },
        { label: 'Siap', by: 'Penjahit', desc: 'Pesanan selesai. Lakukan pelunasan agar bisa diantar.' },
        { label: 'Dalam pengantaran', by: 'Kurir', desc: 'Kurir sedang menuju alamat Anda.' },
        { label: 'Diterima', by: 'Kurir', desc: 'Pesanan sudah sampai di tangan Anda.' }
    ];
    /* Untuk pesanan yang diserahkan langsung/diukur di workshop, tahap 2 diperbarui penjahit. */
    function stageDef(o, i) {
        const s = Object.assign({}, STAGES[i]);
        if (i === 1 && o.pickup && o.pickup.type !== 'jemput') {
            s.label = 'Pakaian diterima di workshop';
            s.by = 'Penjahit';
            s.desc = 'Pakaian sudah diterima di workshop.';
        }
        return s;
    }

    const MAX_ACTIVE = 12;
    const RANGES = ['09.00–11.00', '13.00–15.00', '15.30–17.30'];
    const STEPS = ['Layanan', 'Data', 'Estimasi', 'Jadwal', 'Ringkasan'];
    const DAY = 86400000;

    /* ---------- Helper ---------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rp = n => 'Rp' + Math.round(n).toLocaleString('id-ID');
    const fmtDate = (d, opt) => new Date(d).toLocaleDateString('id-ID', opt || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtDateTime = d => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const pad = (n, l) => String(n).padStart(l, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
    const svc = id => SERVICES.find(s => s.id === id);
    const sumTarif = ids => ids.reduce((a, id) => a + svc(id).tarif, 0);
    const cleanPhone = v => String(v).replace(/[\s-]/g, '');
    const validPhone = v => /^(\+62|62|0)8\d{7,12}$/.test(cleanPhone(v));

    /* Hari kerja Senin sampai Jumat: lewati Minggu (0) dan Sabtu (6). */
    function addWorkDays(from, n) {
        const d = new Date(from);
        while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
        return d;
    }

    /* ---------- Penyimpanan (localStorage dengan cadangan memori) ---------- */
    const KEY = 'bgt_flow_v1';
    const thumbs = {}; // URL foto hanya hidup selama sesi

    function seedOrder(seq, no, items, stage, notes, phone, name) {
        const now = Date.now();
        const total = sumTarif(items);
        const history = [];
        const by = ['Sistem', 'Kurir', 'Penjahit', 'Penjahit'];
        for (let i = 0; i <= stage; i++) history.push({ stage: i, at: now - (stage - i + 1) * DAY, by: by[i] });
        const est = addWorkDays(new Date(), stage >= 3 ? 1 : 3);
        return {
            id: 'PGJ-' + pad(seq, 4), no, source: 'website', items, notes, photos: 2,
            name, phone, address: 'Jl. Lebak Bulus Raya No. 10, Jakarta Selatan',
            jalur: '', fitting: '', pickup: { type: 'jemput', text: 'Dijemput kurir di alamat Anda' },
            total, dp: Math.round(total * 0.5), estDate: est.getTime(),
            phase: 'ordered', stage, history, lunas: 'none', createdAt: now - (stage + 2) * DAY
        };
    }

    function seedDb() {
        return {
            orders: [
                seedOrder(1, 'BGT-260001', ['a-hem', 'a-resleting'], 2, 'Hem celana chino hitam dan resleting jaket.', '081200000001', 'Pelanggan Contoh'),
                seedOrder(2, 'BGT-260002', ['a-lengan'], 3, 'Lengan kemeja putih dipendekkan.', '081200000001', 'Pelanggan Contoh')
            ],
            seq: 2, noSeq: 2, baseQueue: 4, booked: {}, activeId: null, quotaFull: false, kurirOk: true
        };
    }

    function loadDb() {
        try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { /* abaikan */ }
        return seedDb();
    }
    function saveDb() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* abaikan */ } }

    let db = loadDb();

    const activeOrder = () => db.orders.find(o => o.id === db.activeId) || null;
    const activeCount = () => db.baseQueue + db.orders.filter(o => o.phase === 'ordered' && o.stage < 5).length;
    const quotaFull = () => db.quotaFull || activeCount() >= MAX_ACTIVE;

    /* ---------- Draft pesanan (disimpan di memori selama alur) ---------- */
    const freshDraft = () => ({ items: [], photos: [], notes: '', name: '', phone: '', address: '', jalur: '', fitting: '', slot: null, ojek: false, mendesak: false, pickupAddr: '' });
    let draft = freshDraft();
    const hasB = () => draft.items.some(id => svc(id).lini === 'B');
    const draftMode = () => (hasB() && draft.jalur === 'ukur') ? 'ukur' : 'jemput';

    /* ---------- Estimasi ---------- */
    function estimate(ids) {
        const list = ids.map(svc);
        const total = list.reduce((a, s) => a + s.tarif, 0);
        const sum = list.reduce((a, s) => a + s.hari, 0);
        const longest = Math.max(...list.map(s => s.hari));
        const work = Math.max(longest, Math.ceil(sum / 2)); // dua tenaga penjahit
        const queue = Math.ceil(activeCount() / 4);
        const buffer = 1;
        const days = work + queue + buffer;
        return { total, work, queue, buffer, days, date: addWorkDays(new Date(), days) };
    }

    /* ---------- Slot jadwal (hanya Senin sampai Jumat) ---------- */
    function genSlots(type) {
        const cap = type === 'ukur' ? 2 : 4;
        const out = [];
        const d = new Date(); d.setHours(0, 0, 0, 0);
        let guard = 0;
        while (out.length < 4 && guard < 14) {
            d.setDate(d.getDate() + 1); guard++;
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const key = ymd(d);
            const dateText = fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' });
            out.push({
                key, dateText,
                slots: RANGES.map((r, i) => {
                    const id = `${type}|${key}|${i}`;
                    const base = (d.getDate() * 3 + i * 2 + cap) % (cap + 1);
                    const sisa = Math.max(0, cap - base - (db.booked[id] || 0));
                    return { id, range: r, sisa, text: `${dateText}, ${r}` };
                })
            });
        }
        return out;
    }

    /* ---------- Toast ---------- */
    let toastTimer;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
    }

    /* ---------- Router berbasis hash ---------- */
    const SCREENS = ['beranda', 'about', 'katalog', 'form', 'estimasi', 'jadwal', 'ringkasan', 'proses', 'dp', 'konfirmasi',
        'langsung', 'wa', 'cek', 'daftar', 'detail', 'status', 'pelunasan', 'terima', 'selesai'];
    const NEEDS_DRAFT = ['form', 'estimasi', 'jadwal', 'ringkasan'];
    const NEEDS_ORDER = ['proses', 'dp', 'konfirmasi', 'detail', 'status', 'pelunasan', 'terima', 'selesai', 'wa'];
    const DYNAMIC = ['proses', 'dp', 'konfirmasi', 'daftar', 'detail', 'status', 'pelunasan', 'selesai', 'wa'];
    let current = 'beranda';

    const RENDER = {
        katalog: renderKatalog, form: renderForm, estimasi: renderEstimasi, jadwal: renderJadwal,
        ringkasan: renderRingkasan, proses: renderProses, dp: renderDp, konfirmasi: renderKonfirmasi,
        langsung: renderLangsung, wa: renderWa, cek: () => { }, daftar: renderDaftar, detail: renderDetail,
        status: renderStatus, pelunasan: renderPelunasan, terima: () => { }, selesai: renderSelesai, beranda: () => { }, about: () => { }
    };

    function go(name) {
        if (location.hash === '#' + name) enter(name); else location.hash = name;
    }
    function redirect(name) { history.replaceState(null, '', '#' + name); enter(name); }

    function enter(name, soft) {
        if (!SCREENS.includes(name)) name = 'beranda';
        if (NEEDS_DRAFT.includes(name) && !draft.items.length) return redirect('katalog');
        if (name === 'jadwal' && !draft.name) return redirect('form');
        if (NEEDS_ORDER.includes(name) && !activeOrder()) return redirect('cek');
        current = name;
        document.body.dataset.screen = name;
        const na = $('#nav-about'); if (na) { if (name === 'about') na.setAttribute('aria-current', 'page'); else na.removeAttribute('aria-current'); }
        $$('.screen').forEach(s => { s.hidden = s.id !== 's-' + name; });
        const dlg = $('#dlg-cara'); if (dlg.open) dlg.close();
        $$('.stepper', $('#s-' + name)).forEach(renderStepper);
        RENDER[name]();
        renderDock();
        if (!soft) {
            window.scrollTo(0, 0);
            const h = $('#s-' + name + ' h2, #s-' + name + ' h1');
            if (h) h.focus({ preventScroll: true });
        }
    }
    window.addEventListener('hashchange', () => enter(location.hash.slice(1)));

    function refresh() { if (DYNAMIC.includes(current)) enter(current, true); else renderDock(); }

    function renderStepper(el) {
        const n = Number(el.dataset.step);
        el.innerHTML = STEPS.map((s, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}>${s}</li>`).join('');
    }

    /* ---------- 1. Katalog ---------- */
    function renderKatalog() {
        const full = quotaFull();
        $('#kuota-notice').hidden = !full;
        let html = '';
        ['A', 'B'].forEach(l => {
            html += `<h3 class="lini-title">${LINI[l]}</h3>`;
            SERVICES.filter(s => s.lini === l).forEach(s => {
                const on = draft.items.includes(s.id);
                html += `<label class="svc ${on ? 'picked' : ''} ${full ? 'disabled' : ''}">
          <input type="checkbox" value="${s.id}" ${on ? 'checked' : ''} ${full ? 'disabled' : ''}>
          <span><span class="nama">${esc(s.nama)}</span><span class="ket">${esc(s.ket)}</span><span class="durasi">Estimasi pengerjaan ${s.hari} hari kerja</span></span>
          <span class="tarif">${rp(s.tarif)}</span></label>`;
            });
        });
        $('#katalog-list').innerHTML = html;
        updateKatalogBar();
    }
    function updateKatalogBar() {
        const n = draft.items.length;
        $('#katalog-count').textContent = n ? `${n} layanan dipilih, tarif ${rp(sumTarif(draft.items))}` : 'Belum ada layanan dipilih.';
        $('#btn-katalog-lanjut').disabled = !n || quotaFull();
    }

    /* ---------- 2. Form pemesanan ---------- */
    function renderForm() {
        $('#form-layanan').textContent = 'Layanan dipilih: ' + draft.items.map(id => svc(id).nama).join(', ') + '.';
        $('#f-catatan').value = draft.notes;
        $('#f-nama').value = draft.name;
        $('#f-telp').value = draft.phone;
        $('#f-alamat').value = draft.address;
        const b = hasB();
        const a = draft.items.some(id => svc(id).lini === 'A');
        $('#opts-lini-b').hidden = !b;
        $('#note-lini-a').hidden = !a;
        $$('input[name="jalur"]').forEach(r => { r.checked = r.value === draft.jalur; });
        $$('input[name="fitting"]').forEach(r => { r.checked = r.value === draft.fitting; });
        renderFotos();
        $$('#form-pesan .error').forEach(e => { e.textContent = ''; });
    }
    function renderFotos() {
        $('#foto-preview').innerHTML = draft.photos.map((p, i) =>
            `<div class="thumb"><img src="${p.url}" alt="Foto pakaian ${i + 1}"><button type="button" data-remove-foto="${i}" aria-label="Hapus foto ${i + 1}">×</button></div>`).join('');
    }
    function saveFormToDraft() {
        draft.notes = $('#f-catatan').value.trim();
        draft.name = $('#f-nama').value.trim();
        draft.phone = $('#f-telp').value.trim();
        draft.address = $('#f-alamat').value.trim();
        const j = $('input[name="jalur"]:checked'); draft.jalur = j ? j.value : '';
        const f = $('input[name="fitting"]:checked'); draft.fitting = f ? f.value : '';
    }
    function setErr(id, msg) {
        const el = $('#' + id);
        el.textContent = msg || '';
        const wrap = el.closest('.field'); if (wrap) wrap.classList.toggle('has-error', !!msg);
    }
    function submitForm(e) {
        e.preventDefault();
        saveFormToDraft();
        let ok = true;
        const chk = (cond, id, msg) => { setErr(id, cond ? '' : msg); if (!cond) ok = false; };
        chk(draft.photos.length > 0, 'e-foto', 'Unggah minimal satu foto pakaian.');
        chk(!!draft.name, 'e-nama', 'Isi nama Anda.');
        chk(validPhone(draft.phone), 'e-telp', 'Nomor telepon belum benar. Contoh: 081234567890.');
        chk(!!draft.address, 'e-alamat', 'Isi alamat Anda.');
        if (hasB()) {
            chk(!!draft.jalur, 'e-jalur', 'Pilih cara menentukan ukuran.');
            chk(!!draft.fitting, 'e-fitting', 'Pilih apakah Anda mau fitting.');
        }
        if (!ok) { const first = $('#form-pesan .has-error input, #form-pesan .has-error textarea'); if (first) first.focus(); return; }
        go('estimasi');
    }

    /* ---------- 3. Estimasi ---------- */
    function renderEstimasi() {
        const est = estimate(draft.items);
        const rows = draft.items.map(id => `<div><dt>${esc(svc(id).nama)}</dt><dd>${rp(svc(id).tarif)}</dd></div>`).join('');
        $('#estimasi-body').innerHTML = `
      <div class="estimate-pair">
        <div class="panel"><p class="label">Perkiraan total biaya</p><p class="big-number">${rp(est.total)}</p></div>
        <div class="panel"><p class="label">Perkiraan selesai</p><p class="big-number">${fmtDate(est.date, { day: 'numeric', month: 'long' })}</p><p class="hint">${fmtDate(est.date, { weekday: 'long' })}</p></div>
      </div>
      <div class="panel"><h3>Rincian biaya</h3><dl class="rows">${rows}</dl></div>
      <div class="panel"><h3>Dari mana tanggal ini?</h3>
        <dl class="rows">
          <div><dt>Pengerjaan (dua penjahit)</dt><dd>${est.work} hari kerja</dd></div>
          <div><dt>Antrean yang sedang berjalan</dt><dd>${est.queue} hari kerja</dd></div>
          <div><dt>Jeda aman</dt><dd>${est.buffer} hari kerja</dd></div>
        </dl>
        <p class="hint">Sabtu dan Minggu tidak dihitung. Tanggal bisa bergeser bila Anda mengubah pesanan.</p>
      </div>`;
    }

    /* ---------- 4. Jadwal ---------- */
    function renderJadwal() {
        const mode = draftMode();
        const slots = genSlots(mode);
        $('#jadwal-title').textContent = mode === 'ukur' ? 'Pilih slot pengukuran di workshop' : 'Pilih jadwal dan alamat pengantaran';
        $('#jadwal-lead').textContent = mode === 'ukur'
            ? 'Anda memilih jalur ukur langsung. Datang ke workshop di Lebak Bulus pada slot yang dipilih.'
            : 'Slot yang penuh tidak bisa dipilih. Sisa kuota ditampilkan di tiap slot.';
        $('#alamat-jemput-wrap').hidden = mode === 'ukur';
        $('#f-alamat-jemput').value = draft.pickupAddr || draft.address;

        let box = '';
        if (mode === 'jemput' && !db.kurirOk) {
            box = `<div class="notice notice-warn"><strong>Kurir mitra tidak tersedia pada hari pertama.</strong>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="c-mendesak" ${draft.mendesak ? 'checked' : ''}> Pesanan saya mendesak</label>`;
            if (draft.mendesak) {
                box += `<label class="check"><input type="checkbox" id="c-ojek" ${draft.ojek ? 'checked' : ''}> Jemput dengan ojek daring (ongkos mengikuti tarif aplikasi)</label>`;
            }
            box += '</div>';
        } else { draft.ojek = false; }
        $('#kurir-box').innerHTML = box;

        $('#slot-list').innerHTML = slots.map((day, di) => `
      <div class="slot-day"><h3>${esc(day.dateText)}</h3><div class="slot-grid">
      ${day.slots.map(s => {
            const blocked = mode === 'jemput' && !db.kurirOk && di === 0;
            const off = s.sisa === 0 || blocked;
            const sel = draft.slot && draft.slot.id === s.id && !draft.ojek;
            return `<button type="button" class="slot" data-slot="${s.id}" data-text="${esc(s.text)}" aria-pressed="${sel}" ${off ? 'disabled' : ''}>
          <strong>${s.range}</strong><span>${blocked ? 'Kurir tidak tersedia' : s.sisa === 0 ? 'Penuh' : 'Sisa ' + s.sisa + ' slot'}</span></button>`;
        }).join('')}
      </div></div>`).join('');
        setErr('e-jadwal', '');
    }
    function jadwalNext() {
        const mode = draftMode();
        if (mode === 'jemput') {
            draft.pickupAddr = $('#f-alamat-jemput').value.trim();
            if (!draft.pickupAddr) return setErr('e-jadwal', 'Isi alamat pengantaran.');
            if (!draft.ojek && !draft.slot) return setErr('e-jadwal', 'Pilih satu slot penjemputan.');
        } else if (!draft.slot) {
            return setErr('e-jadwal', 'Pilih satu slot pengukuran.');
        }
        setErr('e-jadwal', '');
        go('ringkasan');
    }
    function pickupText() {
        if (draftMode() === 'ukur') return `Pengukuran di workshop Lebak Bulus, ${draft.slot.text}`;
        if (draft.ojek) return `Dijemput ojek daring di ${draft.pickupAddr}`;
        return `${draft.slot.text}, di ${draft.pickupAddr}`;
    }

    /* ---------- 5. Ringkasan dan pengiriman ---------- */
    function renderRingkasan() {
        const est = estimate(draft.items);
        const jalur = hasB() ? `<div><dt>Penentuan ukuran</dt><dd>${draft.jalur === 'ukur' ? 'Ukur langsung di workshop' : 'Dari pakaian contoh'}, ${draft.fitting === 'ya' ? 'dengan fitting' : 'tanpa fitting'}</dd></div>` : '';
        $('#ringkasan-body').innerHTML = `
      <div class="panel"><h3>Layanan</h3><dl class="rows">
        ${draft.items.map(id => `<div><dt>${esc(svc(id).nama)}</dt><dd>${rp(svc(id).tarif)}</dd></div>`).join('')}
        <div><dt><strong>Total perkiraan biaya</strong></dt><dd><strong>${rp(est.total)}</strong></dd></div>
        <div><dt><strong>Perkiraan selesai</strong></dt><dd><strong>${fmtDate(est.date)}</strong></dd></div>
      </dl></div>
      <div class="panel"><h3>Jadwal</h3><dl class="rows">
        <div><dt>${draftMode() === 'ukur' ? 'Slot pengukuran' : 'Penjemputan'}</dt><dd>${esc(draft.ojek ? 'Ojek daring' : draft.slot.text)}</dd></div>
        ${draftMode() === 'jemput' ? `<div><dt>Alamat pengantaran</dt><dd>${esc(draft.pickupAddr)}</dd></div>` : ''}
        ${jalur}
      </dl></div>
      <div class="panel"><h3>Data pemesan</h3><dl class="rows">
        <div><dt>Nama</dt><dd>${esc(draft.name)}</dd></div>
        <div><dt>Telepon</dt><dd>${esc(draft.phone)}</dd></div>
        <div><dt>Foto pakaian</dt><dd>${draft.photos.length} foto</dd></div>
        <div><dt>Catatan</dt><dd>${esc(draft.notes || '-')}</dd></div>
      </dl></div>`;
    }

    function newOrderBase(src) {
        db.seq += 1;
        return {
            id: 'PGJ-' + pad(db.seq, 4), no: null, source: src, phase: 'submitted', stage: 0, history: [], lunas: 'none',
            createdAt: Date.now()
        };
    }

    function kirimPesanan() {
        const est = estimate(draft.items);
        const o = Object.assign(newOrderBase('website'), {
            items: draft.items.slice(), notes: draft.notes, photos: draft.photos.length,
            name: draft.name, phone: draft.phone, address: draft.address,
            jalur: draft.jalur, fitting: draft.fitting,
            pickup: { type: draftMode() === 'ukur' ? 'ukur' : 'jemput', text: pickupText(), slotId: draft.ojek ? null : draft.slot.id },
            total: est.total, dp: Math.round(est.total * 0.5), estDate: est.date.getTime()
        });
        if (o.pickup.slotId) db.booked[o.pickup.slotId] = (db.booked[o.pickup.slotId] || 0) + 1;
        thumbs[o.id] = draft.photos.map(p => p.url);
        db.orders.push(o);
        db.activeId = o.id;
        saveDb();
        draft = freshDraft();
        toast('Pesanan terkirim. Hasil verifikasi akan dikirim lewat WhatsApp.');
        go('proses');
    }

    /* ---------- 6. Proses: terkirim, verifikasi ---------- */
    function renderProses() {
        const o = activeOrder();
        let html = '';
        const sum = `<dl class="rows">
      <div><dt>Layanan</dt><dd>${esc(o.items.map(id => svc(id).nama).join(', '))}</dd></div>
      <div><dt>Perkiraan biaya</dt><dd>${rp(o.total)}</dd></div>
      <div><dt>Perkiraan selesai</dt><dd>${fmtDate(o.estDate)}</dd></div></dl>`;
        if (o.phase === 'submitted') {
            html = `<div class="panel"><p class="muted">Kode pengajuan</p><div class="code-box">${o.id}</div>
        <p><span class="badge">Menunggu verifikasi</span></p>
        <p>Penjahit memeriksa kelayakan pesanan Anda lewat admin. <strong>Pembayaran belum diminta.</strong> Hasilnya dikirim lewat WhatsApp dan tampil di halaman ini.</p>
        <p class="hint">Anda boleh menutup halaman ini dan membukanya lagi dari tautan WhatsApp.</p></div>
        <div class="panel">${sum}</div>
        <button type="button" class="btn btn-ghost" data-go="beranda">Kembali ke beranda</button>`;
        } else if (o.phase === 'rejected') {
            html = `<div class="panel"><p class="muted">Kode pengajuan</p><div class="code-box">${o.id}</div>
        <p><span class="badge badge-warn">Perlu dijadwalkan ulang</span></p>
        <p>Pesanan belum bisa dikerjakan pada jadwal ini karena kapasitas penuh atau data perlu dilengkapi. Pilih jadwal baru agar pesanan bisa diverifikasi lagi.</p></div>
        <button type="button" class="btn" data-action="reschedule">Pilih jadwal baru</button>`;
        } else if (o.phase === 'verified') {
            html = `<div class="notice notice-ok"><strong>Pesanan Anda layak dikerjakan.</strong> Bayar uang muka untuk mengunci jadwal.</div>
        <div class="panel"><p class="muted">Kode pengajuan</p><div class="code-box">${o.id}</div>${sum}
        <dl class="rows"><div><dt>Uang muka (50%)</dt><dd><strong>${rp(o.dp)}</strong></dd></div></dl></div>
        <button type="button" class="btn" data-go="dp">Bayar DP</button>`;
        } else if (o.phase === 'dp_pending') {
            html = `<div class="panel"><p class="muted">Kode pengajuan</p><div class="code-box">${o.id}</div>
        <p><span class="badge">Menunggu konfirmasi DP</span></p>
        <p>Admin sedang memeriksa pembayaran Anda. Nomor pesanan terbit setelah DP dikonfirmasi.</p></div>`;
        } else {
            html = `<div class="panel"><p>Pesanan ini sudah terkonfirmasi dengan nomor <strong>${o.no}</strong>.</p>
        <button type="button" class="btn" data-go="konfirmasi">Lihat konfirmasi</button></div>`;
        }
        $('#proses-body').innerHTML = html;
    }

    /* ---------- 7. Pembayaran DP ---------- */
    function renderDp() {
        const o = activeOrder();
        if (o.phase === 'ordered') return redirect('konfirmasi');
        const waiting = o.phase === 'dp_pending';
        $('#dp-body').innerHTML = `
      <div class="panel">
        <p class="muted">Jumlah DP (50% dari perkiraan biaya)</p>
        <p class="big-number">${rp(o.dp)}</p>
        <p class="hint">Kode pengajuan ${o.id}</p>
      </div>
      <div class="panel"><h3>Cara membayar</h3>
        <p><strong>Transfer bank.</strong> Bank contoh 000-000-0000 a.n. Bob Garage Tailor. Cantumkan ${o.id} pada berita transfer.</p>
        <p><strong>QRIS.</strong> Pindai kode di bawah dari aplikasi bank atau dompet digital Anda.</p>
        <div class="qris" role="img" aria-label="Contoh kode QRIS"><span>QRIS contoh</span></div>
        <p class="hint">Pembayaran dikonfirmasi admin secara manual.</p>
      </div>
      ${waiting
                ? '<div class="notice">Menunggu admin mengonfirmasi pembayaran Anda.</div>'
                : '<button type="button" class="btn" data-action="dp-paid">Saya sudah bayar DP</button>'}`;
    }

    /* ---------- 8. Konfirmasi pesanan ---------- */
    function renderKonfirmasi() {
        const o = activeOrder();
        if (o.phase !== 'ordered' && o.phase !== 'done') return redirect('proses');
        $('#konfirmasi-body').innerHTML = `
      <div class="panel"><p class="muted">Nomor pesanan Anda</p><div class="code-box">${o.no}</div>
        <p>Simpan nomor ini. Anda memakainya di menu Cek pesanan saya untuk memantau progres kapan saja.</p></div>
      <div class="panel"><h3>Ringkasan</h3><dl class="rows">
        <div><dt>Layanan</dt><dd>${esc(o.items.map(id => svc(id).nama).join(', '))}</dd></div>
        <div><dt>Jadwal</dt><dd>${esc(o.pickup.text)}</dd></div>
        <div><dt>Total perkiraan biaya</dt><dd>${rp(o.total)}</dd></div>
        <div><dt>DP dibayar</dt><dd>${rp(o.dp)}</dd></div>
        <div><dt>Perkiraan selesai</dt><dd>${fmtDate(o.estDate)}</dd></div>
      </dl></div>
      <div class="action-row"><button type="button" class="btn btn-ghost" data-go="beranda">Ke beranda</button>
        <button type="button" class="btn" data-go="status">Pantau pesanan</button></div>`;
    }

    /* ---------- Pesan langsung (dicatat admin) ---------- */
    function renderLangsung() {
        const sel = $('#l-layanan');
        if (!sel.options.length) {
            sel.innerHTML = SERVICES.map(s => `<option value="${s.id}">${esc(s.nama)} (Lini ${s.lini}) – ${rp(s.tarif)}</option>`).join('');
        }
        $('#l-opts-b').hidden = svc(sel.value).lini !== 'B';
        $$('#form-langsung .error').forEach(e => { e.textContent = ''; });
    }
    function submitLangsung(e) {
        e.preventDefault();
        const name = $('#l-nama').value.trim(), phone = $('#l-telp').value.trim(), addr = $('#l-alamat').value.trim();
        let ok = true;
        const chk = (c, id, m) => { setErr(id, c ? '' : m); if (!c) ok = false; };
        chk(!!name, 'e-l-nama', 'Isi nama pelanggan.');
        chk(validPhone(phone), 'e-l-telp', 'Nomor telepon belum benar. Contoh: 081234567890.');
        chk(!!addr, 'e-l-alamat', 'Isi alamat pelanggan.');
        if (!ok) return;
        const item = $('#l-layanan').value;
        const b = svc(item).lini === 'B';
        const est = estimate([item]);
        const o = Object.assign(newOrderBase('langsung'), {
            phase: 'pending_approval', items: [item], notes: $('#l-catatan').value.trim(), photos: 0,
            name, phone, address: addr, jalur: b ? $('#l-jalur').value : '', fitting: b ? $('#l-fitting').value : '',
            pickup: { type: 'workshop', text: 'Diserahkan langsung di workshop Lebak Bulus' },
            total: est.total, dp: Math.round(est.total * 0.5), estDate: est.date.getTime()
        });
        db.orders.push(o); db.activeId = o.id; saveDb();
        go('wa');
    }
    function renderWa() {
        const o = activeOrder();
        if (o.phase !== 'pending_approval') return redirect('proses');
        $('#wa-body').innerHTML = `
      <p class="lead">Pelanggan menerima pesan ini di WhatsApp setelah admin mencatat pesanan.</p>
      <div class="wa"><span class="from">Bob Garage Tailor</span>
        <p>Halo ${esc(o.name)}, admin sudah mencatat pesanan Anda.</p>
        <p>Kode pengajuan: <strong>${o.id}</strong><br>Layanan: ${esc(o.items.map(id => svc(id).nama).join(', '))}<br>
        Perkiraan biaya: ${rp(o.total)}<br>Perkiraan selesai: ${fmtDate(o.estDate)}<br>Status: Menunggu verifikasi</p>
        <p>Periksa data di atas. Bila benar, setujui lewat tautan pelacakan.</p></div>
      <div class="action-row">
        <button type="button" class="btn btn-ghost" data-action="wa-wrong">Data salah, minta perbaiki</button>
        <button type="button" class="btn" data-action="wa-ok">Data benar, setujui</button></div>`;
    }

    /* ---------- Cek pesanan, daftar, detail ---------- */
    function submitCek(e) {
        e.preventDefault();
        const q = $('#c-nomor').value.trim().toUpperCase();
        const o = db.orders.find(x => x.no && x.no.toUpperCase() === q);
        if (!q) return setErr('e-cek', 'Masukkan nomor pesanan.');
        if (!o) return setErr('e-cek', 'Nomor pesanan tidak ditemukan. Periksa lagi, contoh: BGT-260001.');
        setErr('e-cek', '');
        db.activeId = o.id; db.cekPhone = o.phone; saveDb();
        $('#d-cari').value = ''; $('#d-filter').value = 'semua';
        go('daftar');
    }

    function statusLabel(o) {
        if (o.phase === 'ordered' || o.phase === 'done') return STAGES[o.stage].label;
        return { submitted: 'Menunggu verifikasi', verified: 'Menunggu DP', dp_pending: 'Menunggu konfirmasi DP', rejected: 'Perlu dijadwalkan ulang', pending_approval: 'Menunggu persetujuan data' }[o.phase];
    }
    function categoryOf(o) {
        if (o.phase === 'done' || o.stage === 5) return 'selesai';
        if (o.stage >= 3) return 'siap';
        return 'berjalan';
    }

    function renderDaftar() {
        const ref = activeOrder();
        const q = $('#d-cari').value.trim().toLowerCase();
        const f = $('#d-filter').value;
        let list = db.orders.filter(o => o.no && o.phone === ref.phone);
        list = list.filter(o => f === 'semua' || categoryOf(o) === f)
            .filter(o => !q || o.no.toLowerCase().includes(q) || o.items.some(id => svc(id).nama.toLowerCase().includes(q)));
        $('#daftar-list').innerHTML = list.length ? list.map(o => `
      <button type="button" class="order-card" data-open="${o.id}">
        <span class="top"><span class="no">${o.no}</span><span class="badge ${o.stage >= 3 ? 'badge-ok' : ''}">${esc(statusLabel(o))}</span></span>
        <p>${esc(o.items.map(id => svc(id).nama).join(', '))}</p>
        <p>Perkiraan selesai ${fmtDate(o.estDate, { day: 'numeric', month: 'long' })}</p></button>`).join('')
            : '<div class="panel"><p>Tidak ada pesanan yang cocok. Ubah kata kunci atau penyaringan.</p></div>';
    }

    function thumbsHtml(o) {
        const t = thumbs[o.id];
        if (t && t.length) return `<div class="thumbs">${t.map((u, i) => `<div class="thumb"><img src="${u}" alt="Foto pakaian ${i + 1}"></div>`).join('')}</div>`;
        return `<div class="thumbs">${Array.from({ length: o.photos || 0 }, (_, i) => `<div class="thumb placeholder">Foto ${i + 1}</div>`).join('') || '-'}</div>`;
    }

    function renderDetail() {
        const o = activeOrder();
        const dibayar = o.lunas === 'confirmed' ? o.total : o.dp;
        $('#detail-body').innerHTML = `
      <div class="panel"><p class="muted">Nomor pesanan</p><div class="code-box">${o.no}</div>
        <p><span class="badge ${o.stage >= 3 ? 'badge-ok' : ''}">${esc(statusLabel(o))}</span></p></div>
      <div class="panel"><dl class="rows">
        <div><dt>Layanan</dt><dd>${esc(o.items.map(id => svc(id).nama).join(', '))}</dd></div>
        <div><dt>Catatan</dt><dd>${esc(o.notes || '-')}</dd></div>
        <div><dt>${o.pickup.type === 'ukur' ? 'Jadwal pengukuran' : 'Jadwal jemput'}</dt><dd>${esc(o.pickup.text)}</dd></div>
        <div><dt>Total biaya</dt><dd>${rp(o.total)}</dd></div>
        <div><dt>DP yang sudah dibayar</dt><dd>${rp(o.dp)}</dd></div>
        <div><dt>Sisa pembayaran</dt><dd>${rp(o.total - dibayar)}</dd></div>
        <div><dt>Tahap saat ini</dt><dd>${esc(stageDef(o, o.stage).label)}</dd></div>
        <div><dt>Perkiraan selesai</dt><dd>${fmtDate(o.estDate)}</dd></div>
      </dl></div>
      <div class="panel"><h3>Foto pakaian</h3>${thumbsHtml(o)}</div>
      <div class="action-row"><button type="button" class="btn btn-ghost" data-go="daftar">Kembali ke daftar</button>
        <button type="button" class="btn" data-go="status">Lihat status pengerjaan</button></div>`;
    }

    /* ---------- Status pengerjaan (pita ukur) ---------- */
    function renderStatus() {
        const o = activeOrder();
        const rows = STAGES.map((_, i) => {
            const d = stageDef(o, i);
            const h = o.history.find(x => x.stage === i);
            const cls = (i < o.stage || (i === 5 && o.stage === 5)) ? 'done' : i === o.stage ? 'now' : 'next';
            const meta = h ? `<p>${fmtDateTime(h.at)}, diperbarui oleh ${esc(h.by)}</p>` : `<p>Diperbarui oleh ${esc(d.by)}</p>`;
            return `<div class="stage ${cls}" ${cls === 'now' ? 'aria-current="step"' : ''}><span class="node"></span><h3>${esc(d.label)}</h3>${cls === 'now' ? `<p>${esc(d.desc)}</p>` : ''}${meta}</div>`;
        }).join('');

        let extra = '';
        if (o.stage === 3) {
            extra = `<div class="wa"><span class="from">Bob Garage Tailor</span>
        <p>Halo ${esc(o.name)}, pesanan ${o.no} sudah <strong>siap</strong>. Silakan lakukan pelunasan agar kurir bisa mengantar.</p></div>
        ${o.lunas === 'confirmed' ? '<div class="notice notice-ok">Pelunasan sudah dikonfirmasi. Kurir akan segera mengantar.</div>'
                    : `<button type="button" class="btn" data-go="pelunasan">${o.lunas === 'pending' ? 'Lihat status pelunasan' : 'Buka menu pelunasan'}</button>`}`;
        } else if (o.stage === 4) {
            extra = '<div class="notice">Kurir sedang mengantar pesanan Anda.</div>';
        } else if (o.stage === 5 && o.phase !== 'done') {
            extra = '<div class="notice notice-ok">Pesanan sudah sampai.</div><button type="button" class="btn" data-go="terima">Isi konfirmasi penerimaan</button>';
        } else if (o.phase === 'done') {
            extra = '<div class="notice notice-ok">Penerimaan sudah Anda konfirmasi. Terima kasih.</div>';
        } else {
            extra = '<p class="hint">Halaman ini diperbarui otomatis setiap status berubah, dan Anda juga menerima WhatsApp. Pesanan belum siap? Cek lagi nanti di sini.</p>';
        }
        $('#status-body').innerHTML = `
      <p class="lead">Pesanan ${o.no}. Perkiraan selesai ${fmtDate(o.estDate, { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
      <div class="tape" role="list">${rows}</div>${extra}
      <div class="action-row"><button type="button" class="btn btn-ghost" data-go="detail">Kembali ke detail</button></div>`;
    }

    /* ---------- Pelunasan ---------- */
    function renderPelunasan() {
        const o = activeOrder();
        const sisa = o.total - o.dp;
        if (o.stage < 3) {
            $('#pelunasan-body').innerHTML = `<div class="panel"><p>Pesanan belum siap, jadi pelunasan belum dibuka. Kami kirim WhatsApp saat statusnya Siap.</p></div>
        <button type="button" class="btn" data-go="status">Kembali ke status</button>`;
            return;
        }
        let state;
        if (o.lunas === 'confirmed') state = '<div class="notice notice-ok">Pelunasan sudah dikonfirmasi admin.</div><button type="button" class="btn" data-go="status">Kembali ke status</button>';
        else if (o.lunas === 'pending') state = '<div class="notice">Menunggu admin mengonfirmasi pelunasan Anda.</div><button type="button" class="btn btn-ghost" data-go="status">Kembali ke status</button>';
        else state = '<button type="button" class="btn" data-action="lunas-paid">Saya sudah melunasi</button>';
        $('#pelunasan-body').innerHTML = `
      <div class="panel"><p class="muted">Sisa pembayaran</p><p class="big-number">${rp(sisa)}</p>
        <dl class="rows"><div><dt>Total biaya</dt><dd>${rp(o.total)}</dd></div><div><dt>DP sudah dibayar</dt><dd>${rp(o.dp)}</dd></div></dl></div>
      <div class="panel"><h3>Cara membayar</h3>
        <p>Transfer ke rekening contoh 000-000-0000 a.n. Bob Garage Tailor atau pindai QRIS. Cantumkan ${o.no} pada berita transfer.</p>
        <div class="qris" role="img" aria-label="Contoh kode QRIS"><span>QRIS contoh</span></div></div>${state}`;
    }

    function submitTerima(e) {
        e.preventDefault();
        const o = activeOrder();
        o.phase = 'done';
        o.feedback = { kondisi: $('input[name="kondisi"]:checked').value, catatan: $('#t-catatan').value.trim() };
        saveDb();
        go('selesai');
    }
    function renderSelesai() {
        const o = activeOrder();
        $('#selesai-body').innerHTML = `
      <div class="notice notice-ok"><strong>Terima kasih.</strong> Konfirmasi penerimaan untuk ${o.no} sudah tercatat${o.feedback && o.feedback.kondisi === 'revisi' ? '. Admin akan menghubungi Anda soal perbaikan.' : '.'}</div>
      <div class="action-row"><button type="button" class="btn btn-ghost" data-go="detail">Lihat detail pesanan</button>
        <button type="button" class="btn" data-action="open-cara">Pesan lagi</button></div>`;
    }

    /* ---------- Simulasi peran (dock) ---------- */
    function pushStage(o, i, by) { o.stage = i; o.history.push({ stage: i, at: Date.now(), by }); }

    function renderDock() {
        $('#t-kuota').checked = db.quotaFull;
        $('#t-kurir').checked = !db.kurirOk;
        const o = activeOrder();
        const box = $('#dock-order');
        if (!o) { box.innerHTML = '<div class="dock-block"><p>Belum ada pesanan aktif. Buat pesanan atau buka BGT-260001 lewat Cek pesanan saya.</p></div>'; return; }
        const head = `<p><strong>${esc(o.no || o.id)}</strong>: ${esc(statusLabel(o))}</p>`;
        let btns = '';
        if (o.phase === 'submitted') {
            btns = `<button type="button" class="btn btn-small btn-block" data-act="verif-ok">Penjahit: pesanan layak</button>
              <button type="button" class="btn btn-small btn-ghost btn-block" data-act="verif-no">Penjahit: tidak layak, jadwal ulang</button>`;
        } else if (o.phase === 'dp_pending') {
            btns = '<button type="button" class="btn btn-small btn-block" data-act="dp-ok">Admin: konfirmasi DP</button>';
        } else if (o.phase === 'ordered') {
            if (o.lunas === 'pending') btns += '<button type="button" class="btn btn-small btn-block" data-act="lunas-ok">Admin: konfirmasi pelunasan</button>';
            if (o.stage < 5) {
                const next = stageDef(o, o.stage + 1);
                const blocked = o.stage + 1 === 4 && o.lunas !== 'confirmed';
                btns += `<button type="button" class="btn btn-small btn-block ${blocked ? '' : 'btn-tape'}" data-act="next" ${blocked ? 'disabled' : ''}>${esc(next.by)}: ${esc(next.label)}</button>`;
                if (blocked) btns += '<p class="hint">Kurir menunggu pelunasan dikonfirmasi.</p>';
            }
        } else if (o.phase === 'pending_approval') {
            btns = '<p class="hint">Menunggu pelanggan menyetujui data di WhatsApp.</p>';
        }
        box.innerHTML = `<div class="dock-block">${head}${btns || '<p class="hint">Tidak ada langkah untuk peran lain.</p>'}</div>`;
    }

    function dockAct(act) {
        const o = activeOrder();
        if (act === 'reset') {
            if (!confirm('Hapus semua data demo dan kembali ke data awal?')) return;
            db = seedDb(); draft = freshDraft(); saveDb(); toast('Data demo dikembalikan.'); return redirect('beranda');
        }
        if (!o) return;
        if (act === 'verif-ok') { o.phase = 'verified'; toast(`WhatsApp ke ${o.name}: pesanan layak, silakan bayar DP.`); }
        else if (act === 'verif-no') { o.phase = 'rejected'; toast(`WhatsApp ke ${o.name}: pesanan perlu dijadwalkan ulang.`); }
        else if (act === 'dp-ok') {
            db.noSeq += 1;
            const d = new Date();
            o.no = `BGT-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1, 2)}${pad(db.noSeq, 2)}`;
            o.phase = 'ordered'; o.dpState = 'confirmed';
            pushStage(o, 0, 'Sistem');
            toast(`DP dikonfirmasi. Nomor pesanan ${o.no} terbit.`);
            saveDb(); renderDock();
            if (['proses', 'dp'].includes(current)) return go('konfirmasi');
            return refresh();
        }
        else if (act === 'next') {
            if (o.stage >= 5) return;
            const i = o.stage + 1;
            if (i === 4 && o.lunas !== 'confirmed') return toast('Kurir menunggu pelunasan dikonfirmasi admin.');
            const d = stageDef(o, i);
            pushStage(o, i, d.by);
            toast(`WhatsApp ke ${o.name}: status berubah menjadi "${d.label}".`);
        }
        else if (act === 'lunas-ok') { o.lunas = 'confirmed'; toast(`Pelunasan ${o.no} dikonfirmasi admin.`); }
        saveDb(); renderDock(); refresh();
    }

    /* ---------- Event ---------- */
    document.addEventListener('click', e => {
        const goBtn = e.target.closest('[data-go]');
        if (goBtn) { e.preventDefault(); return go(goBtn.dataset.go); }

        const actBtn = e.target.closest('[data-action]');
        if (actBtn) {
            const a = actBtn.dataset.action;
            if (a === 'open-cara') $('#dlg-cara').showModal();
            else if (a === 'close-cara') $('#dlg-cara').close();
            else if (a === 'start-website') { draft = freshDraft(); go('katalog'); }
            else if (a === 'start-langsung') go('langsung');
            else if (a === 'katalog-next') { if (draft.items.length && !quotaFull()) go('form'); }
            else if (a === 'jadwal-next') jadwalNext();
            else if (a === 'kirim-pesanan') kirimPesanan();
            else if (a === 'dp-paid') { const o = activeOrder(); o.phase = 'dp_pending'; saveDb(); toast('Terima kasih. Admin akan mengonfirmasi DP Anda.'); go('proses'); }
            else if (a === 'lunas-paid') { const o = activeOrder(); o.lunas = 'pending'; saveDb(); toast('Pelunasan dicatat. Menunggu konfirmasi admin.'); refresh(); renderDock(); }
            else if (a === 'wa-ok') { const o = activeOrder(); o.phase = 'submitted'; saveDb(); go('proses'); }
            else if (a === 'wa-wrong') {
                const o = activeOrder();
                db.orders = db.orders.filter(x => x.id !== o.id); db.activeId = null; saveDb();
                toast('Admin memperbaiki data dan mengirim ringkasan baru. Isi ulang untuk simulasi.');
                go('langsung');
            }
            else if (a === 'reschedule') {
                const o = activeOrder();
                if (o.source === 'langsung') { toast('Hubungi admin untuk menentukan jadwal baru.'); return go('langsung'); }
                draft = Object.assign(freshDraft(), { items: o.items.slice(), notes: o.notes, name: o.name, phone: o.phone, address: o.address, jalur: o.jalur, fitting: o.fitting, pickupAddr: o.pickup.text.split(', di ')[1] || o.address });
                draft.photos = (thumbs[o.id] || []).map((u, i) => ({ name: 'foto' + i, url: u }));
                if (o.pickup.slotId) db.booked[o.pickup.slotId] = Math.max(0, (db.booked[o.pickup.slotId] || 1) - 1);
                db.orders = db.orders.filter(x => x.id !== o.id); db.activeId = null; saveDb();
                go('jadwal');
            }
            return;
        }

        const dockBtn = e.target.closest('[data-act]');
        if (dockBtn) return dockAct(dockBtn.dataset.act);

        const open = e.target.closest('[data-open]');
        if (open) { db.activeId = open.dataset.open; saveDb(); return go('detail'); }

        const rm = e.target.closest('[data-remove-foto]');
        if (rm) { draft.photos.splice(Number(rm.dataset.removeFoto), 1); return renderFotos(); }

        const slot = e.target.closest('.slot');
        if (slot && !slot.disabled) {
            draft.slot = { id: slot.dataset.slot, text: slot.dataset.text };
            draft.ojek = false;
            return renderJadwal();
        }
    });

    document.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('#katalog-list input[type="checkbox"]')) {
            draft.items = $$('#katalog-list input:checked').map(i => i.value);
            t.closest('.svc').classList.toggle('picked', t.checked);
            updateKatalogBar();
        } else if (t.id === 'f-foto') {
            Array.from(t.files).forEach(f => {
                if (f.type.startsWith('image/') && draft.photos.length < 5) draft.photos.push({ name: f.name, url: URL.createObjectURL(f) });
            });
            t.value = ''; renderFotos(); setErr('e-foto', '');
        } else if (t.id === 'l-layanan') {
            $('#l-opts-b').hidden = svc(t.value).lini !== 'B';
        } else if (t.id === 'd-filter') renderDaftar();
        else if (t.id === 't-kuota') { db.quotaFull = t.checked; saveDb(); toast(t.checked ? 'Kuota pesanan ditandai penuh.' : 'Kuota pesanan dibuka lagi.'); if (current === 'katalog') renderKatalog(); }
        else if (t.id === 't-kurir') { db.kurirOk = !t.checked; saveDb(); if (current === 'jadwal') renderJadwal(); }
        else if (t.id === 'c-mendesak') { draft.mendesak = t.checked; if (!t.checked) draft.ojek = false; renderJadwal(); }
        else if (t.id === 'c-ojek') { draft.ojek = t.checked; if (t.checked) draft.slot = null; renderJadwal(); }
    });

    document.addEventListener('input', e => {
        if (e.target.id === 'd-cari') renderDaftar();
    });

    $('#form-pesan').addEventListener('submit', submitForm);
    $('#form-langsung').addEventListener('submit', submitLangsung);
    $('#form-cek').addEventListener('submit', submitCek);
    $('#form-terima').addEventListener('submit', submitTerima);

    /* ---------- Mulai ---------- */
    enter(location.hash.slice(1) || 'beranda');
})();