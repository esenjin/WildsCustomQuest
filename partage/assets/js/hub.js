/* ============================================================
   hub.js – Page principale du hub (index.php)
   Gestion : grille de quêtes, filtres, modal, admin, login
   ============================================================ */

/* ── Zones connues ────────────────────────────────────────── */
// Mapping stageName (identifiant interne) → nom FR
const ZONES = {
    'st101_砂':     'Plaines venteuses',
    'st102_森':     'Forêt écarlate',
    'st103_油田':   'Bassin pétrolier',
    'st104_壁':     'Falaises de glace',
    'st105_炉心':   'Ruines de Wyveria',
    'st401_闘技場': 'Vallon meurtri',
    'st402_壁ヌシ戦闘': 'Cimes gelées',
};

function getZoneName(stageVal, stageName) {
    return ZONES[stageName] ?? stageName ?? '—';
}

/* ── État global ──────────────────────────────────────────── */
let allQuests  = [];
let filtered   = [];
let currentModalQuest = null;

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadQuests();
    bindFilters();
    bindModal();
    if (!IS_ADMIN) bindLogin();
    if (IS_ADMIN) {
        bindAdmin();
        loadPending();
        document.getElementById('btnLogout')?.addEventListener('click', doLogout);
    }
});

/* ══════════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════════ */
function initTabs() {
    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
        });
    });
}

/* ══════════════════════════════════════════════════════════
   CHARGEMENT DES QUÊTES
   ══════════════════════════════════════════════════════════ */
async function loadQuests() {
    setGridState('loading');
    try {
        const data = await api('list_quests');
        allQuests = data.quests ?? [];
        populateMonsterFilter();
        applyFilters();
    } catch(e) {
        setGridState('error', 'Impossible de charger les quêtes : ' + e.message);
    }
}

/* ── Filtre Monstre (peuplé dynamiquement) ──────────────── */
function populateMonsterFilter() {
    const sel = document.getElementById('filterMonster');
    if (!sel) return;
    const seen = new Set();
    const list = [];
    for (const q of allQuests) {
        for (const m of q.monsters ?? []) {
            if (!seen.has(m.fixedId)) { seen.add(m.fixedId); list.push(m); }
        }
    }
    list.sort((a,b) => (a.name??'').localeCompare(b.name??'', 'fr'));
    for (const m of list) {
        const o = document.createElement('option');
        o.value = m.fixedId;
        o.textContent = m.name;
        sel.appendChild(o);
    }
}

/* ══════════════════════════════════════════════════════════
   FILTRES
   ══════════════════════════════════════════════════════════ */
function bindFilters() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(applyFilters, 220));
    document.getElementById('filterLevel')?.addEventListener('change', applyFilters);
    document.getElementById('filterMonster')?.addEventListener('change', applyFilters);
    document.getElementById('filterPlayers')?.addEventListener('change', applyFilters);
    document.getElementById('filterAuthor')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('filterMaxDeaths')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('filterMaxTime')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('sortSelect')?.addEventListener('change', applyFilters);
    document.getElementById('btnReset')?.addEventListener('click', resetFilters);
}

function applyFilters() {
    const q       = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
    const level   = document.getElementById('filterLevel')?.value ?? '';
    const mId     = parseInt(document.getElementById('filterMonster')?.value ?? '0');
    const players = document.getElementById('filterPlayers')?.value ?? '';
    const author  = (document.getElementById('filterAuthor')?.value ?? '').toLowerCase().trim();
    const maxD    = parseInt(document.getElementById('filterMaxDeaths')?.value) || null;
    const maxT    = parseInt(document.getElementById('filterMaxTime')?.value)   || null;
    const sort    = document.getElementById('sortSelect')?.value ?? 'recent';

    filtered = allQuests.filter(quest => {
        if (q) {
            const hay = [quest.title, quest.desc, quest.pseudo,
                ...(quest.monsters ?? []).map(m => m.name)].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        if (level   && String(quest.level)      !== level)   return false;
        if (mId     && !(quest.monsters ?? []).some(m => m.fixedId === mId)) return false;
        if (players && String(quest.maxPlayers) !== players) return false;
        if (author  && !(quest.pseudo ?? '').toLowerCase().includes(author)) return false;
        if (maxD !== null && quest.questLife > maxD) return false;
        if (maxT !== null && quest.timeLimit > maxT) return false;
        return true;
    });

    filtered.sort((a, b) => ({
        recent:  () => b.addedAt - a.addedAt,
        oldest:  () => a.addedAt - b.addedAt,
        'level-d': () => b.level - a.level,
        'level-a': () => a.level - b.level,
        title:   () => (a.title ?? '').localeCompare(b.title ?? '', 'fr'),
    }[sort]?.() ?? 0));

    renderGrid();
    updateResultsMeta();
}

function resetFilters() {
    ['searchInput','filterAuthor','filterMaxDeaths','filterMaxTime'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    ['filterLevel','filterMonster','filterPlayers','sortSelect'].forEach(id => {
        const el = document.getElementById(id); if (el) el.selectedIndex = 0;
    });
    applyFilters();
}

/* ══════════════════════════════════════════════════════════
   RENDU GRILLE
   ══════════════════════════════════════════════════════════ */
function renderGrid() {
    const grid = document.getElementById('questGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!filtered.length) {
        grid.innerHTML = `<div class="state-message">
            <span class="state-icon">🔍</span>Aucune quête ne correspond.</div>`;
        return;
    }

    filtered.forEach((quest, i) => {
        const card = buildCard(quest);
        card.style.animationDelay = Math.min(i * 35, 350) + 'ms';
        grid.appendChild(card);
    });
}

function buildCard(quest) {
    const card = document.createElement('div');
    card.className = 'quest-card';
    card.addEventListener('click', () => openModal(quest, false));

    // Bandeau niveau
    const banner = document.createElement('div');
    banner.className = 'quest-card-banner';
    banner.style.background = levelGradient(quest.level);
    card.appendChild(banner);

    // Corps
    const body = document.createElement('div');
    body.className = 'quest-card-body';

    // Header : titre + étoiles
    const header = document.createElement('div');
    header.className = 'quest-card-header';
    header.innerHTML = `
        <div class="quest-card-title">${esc(quest.title || 'Sans titre')}</div>
        <div class="quest-stars">${buildStars(quest.level)}</div>`;
    body.appendChild(header);

    // Illustrations monstres uniquement (pas de texte dans la liste)
    if (quest.monsters?.length) {
        const row = document.createElement('div');
        row.className = 'quest-monster-icons';
        quest.monsters.forEach(m => {
            const wrap = document.createElement('div');
            const variantClass = m.variant === 'KING' ? 'king' : m.variant === 'NORMAL' ? 'alpha' : '';
            wrap.className = 'monster-icon-wrap' + (variantClass ? ' ' + variantClass : '');
            wrap.title = m.name;

            const img = document.createElement('img');
            img.src     = `assets/img/monsters/${m.fixedId}.png`;
            img.alt     = m.name;
            img.loading = 'lazy';
            img.onerror = () => {
                // Fallback : initiales
                wrap.innerHTML = `<span class="monster-icon-fallback">${esc(m.name.slice(0,2))}</span>`;
            };
            wrap.appendChild(img);
            row.appendChild(wrap);
        });
        body.appendChild(row);
    }

    card.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'quest-card-footer';
    footer.innerHTML = `
        <span class="quest-author">✦ ${esc(quest.pseudo || 'Anonyme')}</span>
        <div class="quest-meta-chips">
            <span class="meta-chip" title="Temps limite">⏱ ${quest.timeLimit} min</span>
            <span class="meta-chip" title="Fautes tolérées">💀 ${quest.questLife}</span>
        </div>`;
    card.appendChild(footer);

    return card;
}

function updateResultsMeta() {
    const el = document.getElementById('resultsCount');
    if (el) el.innerHTML = `<strong>${filtered.length}</strong> quête${filtered.length>1?'s':''} trouvée${filtered.length>1?'s':''} sur ${allQuests.length}`;
}

/* ══════════════════════════════════════════════════════════
   MODAL DÉTAIL
   ══════════════════════════════════════════════════════════ */
function bindModal() {
    document.getElementById('modalOverlay')?.addEventListener('click', e => {
        if (e.target.id === 'modalOverlay') closeModal();
    });
    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(quest, isPending = false) {
    currentModalQuest = quest;
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;

    setEl('modalTitle',   quest.title  || 'Sans titre');
    setEl('modalClient',  quest.client ? `Client : ${esc(quest.client)}` : '');
    setEl('modalStars',   buildStars(quest.level));
    setEl('modalZone',    getZoneName(quest.stageVal, quest.stageName));
    setEl('modalTime',    quest.timeLimit + ' minutes');

    // Badge séquentiel (visible uniquement si actif)
    const seqEl = document.getElementById('modalSequential');
    if (seqEl) seqEl.style.display = quest.sequential ? 'inline-flex' : 'none';
    setEl('modalMoney',   (quest.money ?? 0).toLocaleString('fr-FR') + ' z');

    // Puissance des monstres (étoiles roses)
    const starsLabels = { 3: '⚔️ Normal (3 étoiles)', 5: '☠️ Extrême (5 étoiles)' };
    setEl('modalMonsterStars', starsLabels[quest.monsterStars] ?? `${quest.monsterStars ?? '?'} étoile(s)`);
    setEl('modalRC',      `RC ${quest.minRC ?? 1} ou plus`);
    setEl('modalPlayers', `Jusqu'à ${quest.maxPlayers ?? 4} joueur(s)`);
    setEl('modalDeaths',  `S'évanouir ${quest.questLife ?? 3} fois`);
    setEl('modalDesc',    quest.desc ? esc(quest.desc) : '<em style="color:var(--text-dim)">Aucune description.</em>');
    setEl('modalAuthor',  esc(quest.pseudo || 'Anonyme'));

    const banner = document.getElementById('modalBanner');
    if (banner) banner.style.background = levelGradient(quest.level);

    // Monstres (avec nom FR dans le modal)
    const monstersEl = document.getElementById('modalMonsters');
    if (monstersEl) {
        monstersEl.innerHTML = '';
        (quest.monsters ?? []).forEach(m => {
            const variantClass = m.variant === 'KING' ? 'king' : m.variant === 'NORMAL' ? 'alpha' : '';
            const chip = document.createElement('div');
            chip.className = 'modal-monster-chip' + (variantClass ? ' ' + variantClass : '');

            const img = document.createElement('img');
            img.src     = `assets/img/monsters/${m.fixedId}.png`;
            img.alt     = m.name;
            img.onerror = () => { img.style.display = 'none'; };
            chip.appendChild(img);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'monster-name';
            nameSpan.textContent = m.name;
            chip.appendChild(nameSpan);

            if (variantClass) {
                const badge = document.createElement('span');
                badge.className = `monster-badge badge-${variantClass}`;
                badge.textContent = m.variant === 'KING' ? 'AS' : 'α';
                chip.appendChild(badge);
            }
            monstersEl.appendChild(chip);
        });
    }

    // Récompenses
    const rewardsEl = document.getElementById('modalRewards');
    if (rewardsEl) {
        rewardsEl.innerHTML = '';
        if (!(quest.rewards ?? []).length) {
            rewardsEl.innerHTML = '<em style="color:var(--text-dim);font-size:.9em">Aucune récompense renseignée.</em>';
        } else {
            quest.rewards.forEach(r => {
                const row = document.createElement('div');
                row.className = 'reward-row';
                const qty  = r.minCount === r.maxCount ? `×${r.minCount}` : `×${r.minCount}–${r.maxCount}`;
                const prob = Math.round(r.probability ?? 0);
                row.innerHTML = `
                    <span class="reward-name">${esc(r.itemName ?? '?')}</span>
                    <span class="reward-qty">${qty}</span>
                    <span class="reward-prob">${prob}%</span>`;
                rewardsEl.appendChild(row);
            });
        }
    }

    // Téléchargement
    const dlBtn = document.getElementById('modalDownload');
    if (dlBtn) {
        const dir = isPending ? 'base/attente/' : 'base/';
        dlBtn.href     = dir + quest.filename;
        dlBtn.download = quest.filename;
    }

    // Actions admin
    const adminActions = document.getElementById('modalAdminActions');
    if (adminActions) {
        adminActions.style.display = IS_ADMIN && !isPending ? 'block' : 'none';
        const btnDel = document.getElementById('btnAdminDelete');
        if (btnDel) {
            btnDel.onclick = () => adminDeleteQuest(quest.filename);
        }
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modalOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    currentModalQuest = null;
}

/* ══════════════════════════════════════════════════════════
   ADMIN : LISTE EN ATTENTE
   ══════════════════════════════════════════════════════════ */
function bindAdmin() {
    document.getElementById('btnRefreshPending')?.addEventListener('click', loadPending);
}

async function loadPending() {
    const list = document.getElementById('pendingList');
    if (!list) return;
    list.innerHTML = '<div class="state-message"><span class="spinner"></span>Chargement…</div>';
    try {
        const data = await api('list_pending');
        const quests = data.quests ?? [];

        // Badge sur l'onglet
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            badge.textContent = quests.length;
            badge.style.display = quests.length ? 'inline-flex' : 'none';
        }

        if (!quests.length) {
            list.innerHTML = '<div class="state-message"><span class="state-icon">✓</span>Aucune quête en attente.</div>';
            return;
        }

        list.innerHTML = '';
        quests.forEach(quest => list.appendChild(buildPendingRow(quest)));
    } catch(e) {
        list.innerHTML = `<div class="state-message">Erreur : ${esc(e.message)}</div>`;
    }
}

function buildPendingRow(quest) {
    const row = document.createElement('div');
    row.className = 'pending-row';
    row.id = 'pending-' + quest.filename;

    const info = document.createElement('div');
    info.className = 'pending-info';

    // Icônes monstres
    const icons = document.createElement('div');
    icons.className = 'pending-monsters';
    (quest.monsters ?? []).forEach(m => {
        const img = document.createElement('img');
        img.src   = `assets/img/monsters/${m.fixedId}.png`;
        img.alt   = m.name;
        img.title = m.name;
        img.className = 'pending-monster-icon';
        img.onerror   = () => { img.style.display='none'; };
        icons.appendChild(img);
    });
    info.appendChild(icons);

    const meta = document.createElement('div');
    meta.className = 'pending-meta';
    meta.innerHTML = `
        <div class="pending-title">${esc(quest.title || 'Sans titre')}</div>
        <div class="pending-sub">
            par <strong>${esc(quest.pseudo)}</strong> ·
            ${buildStars(quest.level, 5)} ·
            ${quest.timeLimit} min · 💀 ${quest.questLife} ·
            <span style="color:var(--text-muted);font-size:.85em">${esc(quest.filename)}</span>
        </div>`;
    info.appendChild(meta);
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'pending-actions';

    const btnDetail = document.createElement('button');
    btnDetail.className = 'btn btn-secondary btn-sm';
    btnDetail.textContent = '👁 Détail';
    btnDetail.addEventListener('click', () => openModal(quest, true));
    actions.appendChild(btnDetail);

    const btnVal = document.createElement('button');
    btnVal.className = 'btn btn-success btn-sm';
    btnVal.textContent = '✓ Valider';
    btnVal.addEventListener('click', () => adminAction('admin_validate', quest.filename, row, 'Quête validée !'));
    actions.appendChild(btnVal);

    const btnRef = document.createElement('button');
    btnRef.className = 'btn btn-danger btn-sm';
    btnRef.textContent = '✗ Refuser';
    btnRef.addEventListener('click', () => adminAction('admin_refuse', quest.filename, row, 'Quête refusée.'));
    actions.appendChild(btnRef);

    row.appendChild(actions);
    return row;
}

async function adminAction(action, filename, rowEl, successMsg) {
    try {
        await api(action, { filename });
        rowEl.classList.add('row-fade-out');
        setTimeout(() => {
            rowEl.remove();
            showToast(successMsg, 'success');
            // Rafraîchir badge + grille si validation
            if (action === 'admin_validate') loadQuests();
            const remaining = document.querySelectorAll('.pending-row').length;
            const badge = document.getElementById('pendingBadge');
            if (badge) {
                badge.textContent = remaining;
                badge.style.display = remaining ? 'inline-flex' : 'none';
            }
            if (!remaining) {
                document.getElementById('pendingList').innerHTML =
                    '<div class="state-message"><span class="state-icon">✓</span>Aucune quête en attente.</div>';
            }
        }, 400);
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

async function adminDeleteQuest(filename) {
    const confirmed = await showConfirm(
        'Supprimer la quête',
        `Supprimer <strong>${esc(filename)}</strong> ? Cette action est irréversible.`
    );
    if (!confirmed) return;
    try {
        await api('admin_delete', { filename });
        closeModal();
        showToast('Quête supprimée.', 'success');
        loadQuests();
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

/**
 * Modale de confirmation stylisée — remplace window.confirm().
 * Retourne une Promise<boolean>.
 */
function showConfirm(title, message) {
    return new Promise(resolve => {
        // Réutiliser ou créer la modale de confirmation
        let overlay = document.getElementById('confirmOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'confirmOverlay';
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="modal" style="max-width:420px">
                    <div class="modal-banner" style="background:linear-gradient(90deg,var(--red),var(--red-h))"></div>
                    <div class="modal-header">
                        <div class="modal-header-left">
                            <div class="modal-type-badge">⚠ Confirmation</div>
                            <h2 class="modal-title" id="confirmTitle"></h2>
                        </div>
                    </div>
                    <div class="modal-body">
                        <p id="confirmMessage" style="font-size:.97em;line-height:1.6;color:var(--text-dim)"></p>
                        <div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end">
                            <button class="btn btn-secondary" id="confirmCancel">Annuler</button>
                            <button class="btn btn-danger" id="confirmOk">🗑 Supprimer</button>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        document.getElementById('confirmTitle').textContent   = title;
        document.getElementById('confirmMessage').innerHTML   = message;

        const close = (result) => {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            // Détacher les listeners pour éviter les doublons
            document.getElementById('confirmOk').replaceWith(document.getElementById('confirmOk').cloneNode(true));
            document.getElementById('confirmCancel').replaceWith(document.getElementById('confirmCancel').cloneNode(true));
            resolve(result);
        };

        document.getElementById('confirmOk').addEventListener('click',     () => close(true));
        document.getElementById('confirmCancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        // Focus sur Annuler par défaut (safer)
        setTimeout(() => document.getElementById('confirmCancel')?.focus(), 50);
    });
}

/* ══════════════════════════════════════════════════════════
   LOGIN ADMIN
   ══════════════════════════════════════════════════════════ */
function bindLogin() {
    const overlay  = document.getElementById('loginOverlay');
    const btnShow  = document.getElementById('btnShowLogin');
    const btnClose = document.getElementById('loginClose');
    const btnLogin = document.getElementById('btnLogin');
    const passEl   = document.getElementById('passwordInput');

    btnShow?.addEventListener('click',  () => { overlay?.classList.add('open'); document.body.style.overflow = 'hidden'; });
    btnClose?.addEventListener('click', () => { overlay?.classList.remove('open'); document.body.style.overflow = ''; });
    overlay?.addEventListener('click',  e => { if (e.target === overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; } });
    passEl?.addEventListener('keydown', e => { if (e.key === 'Enter') btnLogin?.click(); });

    btnLogin?.addEventListener('click', async () => {
        const login = document.getElementById('loginInput')?.value.trim() ?? '';
        const pass  = document.getElementById('passwordInput')?.value ?? '';
        const errEl = document.getElementById('loginError');
        if (errEl) errEl.style.display = 'none';
        btnLogin.disabled = true;
        try {
            await api('login', { login, password: pass });
            window.location.reload();
        } catch(e) {
            if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
            btnLogin.disabled = false;
        }
    });
}

async function doLogout() {
    await api('logout');
    window.location.reload();
}

/* ══════════════════════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 400); }, 3000);
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

async function api(action, body = {}) {
    const fd = new FormData();
    fd.append('action', action);
    for (const [k, v] of Object.entries(body)) fd.append(k, v);
    const res  = await fetch('api.php', { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message ?? 'Erreur inconnue');
    return data;
}

function buildStars(level, max = 10) {
    let html = '';
    for (let i = 1; i <= max; i++)
        html += `<span class="star${i > level ? ' dim' : ''}"></span>`;
    return html;
}

function levelGradient(l) {
    if (l >= 10) return 'linear-gradient(90deg,#b01566,#d4256e)';
    if (l >= 8)  return 'linear-gradient(90deg,#c8872a,#e09a38)';
    if (l >= 6)  return 'linear-gradient(90deg,#2d6fb5,#3a82cc)';
    return 'linear-gradient(90deg,#2a8a4a,#34a85a)';
}

function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setEl(id, html) {
    const el = document.getElementById(id); if (el) el.innerHTML = html;
}

function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function setGridState(state, msg = '') {
    const g = document.getElementById('questGrid');
    if (!g) return;
    if (state === 'loading') g.innerHTML = `<div class="state-message"><span class="spinner"></span>Chargement…</div>`;
    else if (state === 'error') g.innerHTML = `<div class="state-message"><span class="state-icon">⚠</span>${esc(msg)}</div>`;
}