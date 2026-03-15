/* ============================================================
   hub.js – Page principale du hub (index.php)
   Gestion : grille de quêtes, filtres, modal, admin, moderators
   ============================================================ */

/* ── Zones connues ────────────────────────────────────────── */
const ZONES = {
    'st101_砂':         'Plaines venteuses',
    'st102_森':         'Forêt écarlate',
    'st103_油田':       'Bassin pétrolier',
    'st104_壁':         'Falaises de glace',
    'st105_炉心':       'Ruines de Wyveria',
    'st401_闘技場':     'Vallon meurtri',
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

    if (!IS_AUTH) {
        bindLogin();
    } else {
        bindProfile();
        loadPending();
        loadReports();
        document.getElementById('btnLogout')?.addEventListener('click', doLogout);

        if (IS_ADMIN) {
            bindAdmin();
            loadModerators();
            loadLogs();
        }
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
        populateZoneFilter();
        applyFilters();
    } catch(e) {
        setGridState('error', 'Impossible de charger les quêtes : ' + e.message);
    }
}

/* ── Filtre Monstre ─────────────────────────────────────── */
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

/* ── Filtre Zone ────────────────────────────────────────── */
function populateZoneFilter() {
    const sel = document.getElementById('filterZone');
    if (!sel) return;
    const seen = new Set();
    for (const q of allQuests) {
        const zoneName = getZoneName(q.stageVal, q.stageName);
        if (q.stageName && !seen.has(q.stageName)) {
            seen.add(q.stageName);
            const o = document.createElement('option');
            o.value = q.stageName;
            o.textContent = zoneName;
            sel.appendChild(o);
        }
    }
    const opts = [...sel.options].slice(1).sort((a, b) => a.text.localeCompare(b.text, 'fr'));
    while (sel.options.length > 1) sel.remove(1);
    opts.forEach(o => sel.appendChild(o));
}

function bindFilters() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(applyFilters, 220));
    document.getElementById('filterLevel')?.addEventListener('change', applyFilters);
    document.getElementById('filterZone')?.addEventListener('change', applyFilters);
    document.getElementById('filterMonster')?.addEventListener('change', applyFilters);
    document.getElementById('filterPlayers')?.addEventListener('change', applyFilters);
    document.getElementById('filterGrade')?.addEventListener('change', applyFilters);
    document.getElementById('filterVariant')?.addEventListener('change', applyFilters);
    document.getElementById('filterAuthor')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('filterMaxDeaths')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('filterMaxTime')?.addEventListener('input', debounce(applyFilters, 280));
    document.getElementById('sortSelect')?.addEventListener('change', applyFilters);
    document.getElementById('btnReset')?.addEventListener('click', resetFilters);

    /* ── Toggle filtres mobile ───────────────────────────── */
    const btnToggle   = document.getElementById('btnToggleFilters');
    const filtersGrid = document.getElementById('filtersGrid');
    btnToggle?.addEventListener('click', () => {
        const isOpen = filtersGrid.classList.toggle('filters-open');
        btnToggle.setAttribute('aria-expanded', String(isOpen));
    });
}

/* Met à jour le point indicateur si des filtres avancés sont actifs */
function updateFiltersDot() {
    const hasFilter = [
        'filterLevel','filterZone','filterMonster','filterPlayers',
        'filterGrade','filterVariant'
    ].some(id => {
        const el = document.getElementById(id);
        return el && el.value !== '' && el.value !== '0';
    }) || ['filterAuthor','filterMaxDeaths','filterMaxTime'].some(id => {
        const el = document.getElementById(id);
        return el && el.value.trim() !== '';
    });
    const dot = document.getElementById('filtersActiveDot');
    if (dot) dot.hidden = !hasFilter;
}

function applyFilters() {
    const q       = (document.getElementById('searchInput')?.value ?? '').toLowerCase().trim();
    const level   = document.getElementById('filterLevel')?.value ?? '';
    const zone    = document.getElementById('filterZone')?.value ?? '';
    const mId     = parseInt(document.getElementById('filterMonster')?.value ?? '0');
    const players = document.getElementById('filterPlayers')?.value ?? '';
    const grade   = parseInt(document.getElementById('filterGrade')?.value)   || null;
    const variant = document.getElementById('filterVariant')?.value ?? '';
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
        if (zone    && quest.stageName          !== zone)    return false;
        if (mId     && !(quest.monsters ?? []).some(m => m.fixedId === mId)) return false;
        if (players && String(quest.maxPlayers) !== players) return false;
        if (grade   && quest.monsterGrade !== grade)         return false;
        if (variant && !(quest.monsters ?? []).some(m => m.variant === variant)) return false;
        if (author  && !(quest.pseudo ?? '').toLowerCase().includes(author)) return false;
        if (maxD !== null && quest.questLife > maxD) return false;
        if (maxT !== null && quest.timeLimit > maxT) return false;
        return true;
    });

    filtered.sort((a, b) => ({
        recent:    () => b.addedAt - a.addedAt,
        oldest:    () => a.addedAt - b.addedAt,
        'level-d': () => b.level - a.level,
        'level-a': () => a.level - b.level,
        title:     () => (a.title ?? '').localeCompare(b.title ?? '', 'fr'),
    }[sort]?.() ?? 0));

    renderGrid();
    updateResultsMeta();
    updateFiltersDot();
}

function resetFilters() {
    ['searchInput','filterAuthor','filterMaxDeaths','filterMaxTime'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    ['filterLevel','filterZone','filterMonster','filterPlayers','filterGrade','filterVariant','sortSelect'].forEach(id => {
        const el = document.getElementById(id); if (el) el.selectedIndex = 0;
    });
    applyFilters();
    updateFiltersDot();
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

    const zc = zoneGradient(quest.stageName);
    const banner = document.createElement('div');
    banner.className = 'quest-card-banner';
    banner.style.background = zc.bg;
    card.appendChild(banner);

    const body = document.createElement('div');
    body.className = 'quest-card-body';

    const sc = levelStarColor(quest.level);
    const header = document.createElement('div');
    header.className = 'quest-card-header';
    header.innerHTML = `
        <div class="quest-card-title">${esc(quest.title || 'Sans titre')}</div>
        <div class="quest-stars" style="--star-color:${sc.active};--star-glow:${sc.glow}">${buildStars(quest.level)}</div>`;
    body.appendChild(header);

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
                wrap.innerHTML = `<span class="monster-icon-fallback">${esc(m.name.slice(0,2))}</span>`;
            };
            wrap.appendChild(img);
            row.appendChild(wrap);
        });
        body.appendChild(row);
    }

    card.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'quest-card-footer';
    footer.innerHTML = `
        <span class="quest-author">✦ ${esc(quest.pseudo || 'Anonyme')}</span>
        <div class="quest-meta-chips">
            <span class="meta-chip" title="Temps limite">⏱ ${quest.timeLimit} min</span>
            <span class="meta-chip" title="Fautes tolérées">💀 ${quest.questLife}</span>
            ${quest.monsterGrade ? `<span class="meta-chip meta-chip-grade" title="Grade des monstres">${'✦'.repeat(quest.monsterGrade)} G${quest.monsterGrade}</span>` : ''}
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

    setEl('modalTitle',  quest.title  || 'Sans titre');
    setEl('modalClient', quest.client ? `Client : ${esc(quest.client)}` : '');
    setEl('modalStars',  buildStars(quest.level));
    setEl('modalZone',   getZoneName(quest.stageVal, quest.stageName));
    setEl('modalTime',   quest.timeLimit + ' minutes');

    const seqEl = document.getElementById('modalSequential');
    if (seqEl) seqEl.style.display = quest.sequential ? 'inline-flex' : 'none';
    setEl('modalMoney', (quest.money ?? 0).toLocaleString('fr-FR') + ' z');

    const gradeLabels = { 1: 'Faible', 2: 'Modéré', 3: 'Standard', 4: 'Puissant', 5: 'Extrême' };
    const g = quest.monsterGrade ?? quest.monsterStars; // compat. anciennes quêtes
    const gradeStars = g ? '✦'.repeat(g) : '';
    setEl('modalMonsterStars', g ? `${gradeStars} ${gradeLabels[g] ?? g}` : '—');
    setEl('modalRC',      `RC ${quest.minRC ?? 1} ou plus`);
    setEl('modalPlayers', `Jusqu'à ${quest.maxPlayers ?? 4} joueur(s)`);
    setEl('modalDeaths',  `S'évanouir ${quest.questLife ?? 3} fois`);
    setEl('modalDesc',    quest.desc ? esc(quest.desc) : '<em style="color:var(--text-dim)">Aucune description.</em>');
    setEl('modalAuthor',  esc(quest.pseudo || 'Anonyme'));

    const banner = document.getElementById('modalBanner');
    if (banner) banner.style.background = zoneGradient(quest.stageName).bg;

    const modalStarsEl = document.getElementById('modalStars');
    if (modalStarsEl) {
        const sc = levelStarColor(quest.level);
        modalStarsEl.style.setProperty('--star-color', sc.active);
        modalStarsEl.style.setProperty('--star-glow',  sc.glow);
    }

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

    const dlBtn = document.getElementById('modalDownload');
    if (dlBtn) {
        const dir = isPending ? 'base/attente/' : 'base/';
        dlBtn.href     = dir + quest.filename;
        dlBtn.download = quest.filename;
    }

    const adminActions = document.getElementById('modalAdminActions');
    if (adminActions) {
        adminActions.style.display = IS_AUTH && !isPending ? 'block' : 'none';
        const btnDel = document.getElementById('btnAdminDelete');
        if (btnDel) {
            btnDel.onclick = () => adminDeleteQuest(quest.filename);
        }
        const btnEdit = document.getElementById('btnAdminEdit');
        if (btnEdit) {
            btnEdit.onclick = () => openEditModal(quest);
        }
    }

    // Bouton signalement (visible uniquement pour les quêtes validées, pas en attente)
    const btnReport = document.getElementById('btnReportQuest');
    if (btnReport) {
        btnReport.style.display = isPending ? 'none' : '';
        btnReport.onclick = () => { closeModal(); openReportModal(quest); };
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
    document.getElementById('btnRefreshReports')?.addEventListener('click', loadReports);
    document.getElementById('btnNewModo')?.addEventListener('click', () => openModoModal(null));
    document.getElementById('btnRefreshLogs')?.addEventListener('click', loadLogs);
    document.getElementById('btnClearLogs')?.addEventListener('click', clearLogs);
    document.getElementById('logsFilterUser')?.addEventListener('change', renderLogs);
    document.getElementById('logsFilterAction')?.addEventListener('change', renderLogs);
}

async function loadPending() {
    const list = document.getElementById('pendingList');
    if (!list) return;
    list.innerHTML = '<div class="state-message"><span class="spinner"></span>Chargement…</div>';
    try {
        const data = await api('list_pending');
        const quests = data.quests ?? [];

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

    const icons = document.createElement('div');
    icons.className = 'pending-monsters';
    (quest.monsters ?? []).forEach(m => {
        const img = document.createElement('img');
        img.src       = `assets/img/monsters/${m.fixedId}.png`;
        img.alt       = m.name;
        img.title     = m.name;
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

    // Bouton avertissements (visible seulement si la quête en a)
    const warningCount = quest.warningCount ?? (quest.warnings ?? []).length;
    if (warningCount > 0) {
        const btnWarn = document.createElement('button');
        btnWarn.className = 'btn btn-warning btn-sm';
        btnWarn.innerHTML = `⚠ Avertissements <span class="badge-warn-count">${warningCount}</span>`;
        btnWarn.title = 'Voir les avertissements détectés lors de la soumission';
        btnWarn.addEventListener('click', () => openWarningsModal(quest));
        actions.appendChild(btnWarn);
    }

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

/* ══════════════════════════════════════════════════════════
   ADMIN : ÉDITION D'UNE QUÊTE
   ══════════════════════════════════════════════════════════ */
function openEditModal(quest) {
    let overlay = document.getElementById('editQuestOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'editQuestOverlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" style="max-width:540px">
                <div class="modal-banner" id="editModalBanner" style="background:linear-gradient(90deg,var(--accent),var(--accent-h))"></div>
                <div class="modal-header">
                    <div class="modal-header-left">
                        <div class="modal-type-badge">✏ Édition</div>
                        <h2 class="modal-title" id="editModalQuestTitle"></h2>
                    </div>
                    <button class="modal-close" id="editModalClose" aria-label="Fermer">✕</button>
                </div>
                <div class="modal-body">
                    <div class="edit-field-group">
                        <label class="edit-label" for="editTitleInput">Titre (FR)</label>
                        <input
                            id="editTitleInput"
                            type="text"
                            class="edit-input"
                            maxlength="200"
                            placeholder="Titre de la quête…"
                        />
                    </div>
                    <div class="edit-field-group">
                        <label class="edit-label" for="editClientInput">Client (FR)</label>
                        <input
                            id="editClientInput"
                            type="text"
                            class="edit-input"
                            maxlength="200"
                            placeholder="Nom du client…"
                        />
                    </div>
                    <div class="edit-field-group">
                        <label class="edit-label" for="editDescInput">Description (FR)</label>
                        <textarea
                            id="editDescInput"
                            class="edit-input edit-textarea"
                            maxlength="2000"
                            rows="6"
                            placeholder="Description de la quête…"
                        ></textarea>
                        <div class="edit-char-count"><span id="editDescCount">0</span> / 2000</div>
                    </div>
                    <div id="editErrorMsg" class="form-error" style="display:none"></div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">
                        <button class="btn btn-secondary" id="editCancelBtn">Annuler</button>
                        <button class="btn btn-primary"   id="editSaveBtn">💾 Enregistrer</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        // Fermeture sur clic backdrop
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeEditModal();
        });

        // Compteur de caractères description
        document.getElementById('editDescInput').addEventListener('input', () => {
            const len = document.getElementById('editDescInput').value.length;
            document.getElementById('editDescCount').textContent = len;
        });
    }

    // Pré-remplissage
    document.getElementById('editModalQuestTitle').textContent = quest.title || 'Sans titre';
    document.getElementById('editModalBanner').style.background = zoneGradient(quest.stageName).bg;
    document.getElementById('editTitleInput').value  = quest.title  ?? '';
    document.getElementById('editClientInput').value = quest.client ?? '';
    document.getElementById('editDescInput').value   = quest.desc   ?? '';
    document.getElementById('editDescCount').textContent = (quest.desc ?? '').length;
    document.getElementById('editErrorMsg').style.display = 'none';
    document.getElementById('editSaveBtn').disabled = false;

    // Listeners (clone pour éviter les doublons)
    const closeBtn = document.getElementById('editModalClose');
    const cancelBtn = document.getElementById('editCancelBtn');
    const saveBtn   = document.getElementById('editSaveBtn');

    closeBtn.replaceWith(closeBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    saveBtn.replaceWith(saveBtn.cloneNode(true));

    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
    document.getElementById('editSaveBtn').addEventListener('click', () => saveQuestEdit(quest));

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('editTitleInput')?.focus(), 60);
}

function closeEditModal() {
    document.getElementById('editQuestOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
}

async function saveQuestEdit(quest) {
    const title  = document.getElementById('editTitleInput').value.trim();
    const client = document.getElementById('editClientInput').value.trim();
    const desc   = document.getElementById('editDescInput').value.trim();
    const errEl  = document.getElementById('editErrorMsg');
    const saveBtn = document.getElementById('editSaveBtn');

    errEl.style.display = 'none';

    if (!title) {
        errEl.textContent = 'Le titre ne peut pas être vide.';
        errEl.style.display = 'block';
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Enregistrement…';

    try {
        await api('admin_edit_quest', { filename: quest.filename, title, client, desc });

        // Mettre à jour les données en mémoire pour éviter de tout recharger
        quest.title  = title;
        quest.client = client;
        quest.desc   = desc;

        closeEditModal();
        showToast('Quête modifiée avec succès.', 'success');

        // Rafraîchir la modal de détail si elle est encore ouverte sur cette quête
        if (currentModalQuest?.filename === quest.filename) {
            openModal(quest, false);
        }

        // Rafraîchir la grille (titre affiché sur les cartes)
        renderGrid();
    } catch(e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Enregistrer';
    }
}

/* ══════════════════════════════════════════════════════════
   SIGNALEMENTS (admin + modo)
   ══════════════════════════════════════════════════════════ */
async function loadReports() {
    const list = document.getElementById('reportedList');
    if (!list) return;
    list.innerHTML = '<div class="state-message"><span class="spinner"></span>Chargement…</div>';
    try {
        const data = await api('list_reports');
        const reports = data.reports ?? [];

        const badge = document.getElementById('reportedBadge');
        if (badge) {
            badge.textContent = reports.length;
            badge.style.display = reports.length ? 'inline-flex' : 'none';
        }

        if (!reports.length) {
            list.innerHTML = '<div class="state-message"><span class="state-icon">✓</span>Aucun signalement en attente.</div>';
            return;
        }

        list.innerHTML = '';
        reports.forEach(r => list.appendChild(buildReportRow(r)));
    } catch(e) {
        list.innerHTML = `<div class="state-message">Erreur : ${esc(e.message)}</div>`;
    }
}

const REPORT_REASONS = {
    broken:      { label: 'Quête cassée',      icon: '⚠', cls: 'report-broken'      },
    unreachable: { label: 'Quête irréalisable', icon: '🎯', cls: 'report-unreachable' },
    cheat:       { label: 'Quête de triche',   icon: '💰', cls: 'report-cheat'       },
};

function buildReportRow(report) {
    const row = document.createElement('div');
    row.className = 'pending-row';
    row.id = 'report-' + report.id;

    const reasonMeta = REPORT_REASONS[report.reason] ?? { label: report.reason, icon: '?', cls: '' };
    const date = new Date(report.at * 1000);
    const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const info = document.createElement('div');
    info.className = 'pending-info';
    info.style.flexDirection = 'column';
    info.style.gap = '4px';

    info.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="log-action-badge ${reasonMeta.cls}" style="font-size:.82em">${reasonMeta.icon} ${esc(reasonMeta.label)}</span>
            <span class="pending-title" style="margin:0">${esc(report.questTitle || report.filename)}</span>
        </div>
        <div class="pending-sub">
            <span style="color:var(--text-muted);font-size:.82em">${esc(report.filename)}</span>
            ${report.comment ? `· <em style="color:var(--text-dim);font-size:.85em">"${esc(report.comment)}"</em>` : ''}
        </div>
        <div style="font-size:.8em;color:var(--text-muted)">${dateStr}</div>`;
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'pending-actions';

    // Chercher la quête dans allQuests pour le bouton détail
    const quest = allQuests.find(q => q.filename === report.filename);
    if (quest) {
        const btnDetail = document.createElement('button');
        btnDetail.className = 'btn btn-secondary btn-sm';
        btnDetail.textContent = '👁 Détail';
        btnDetail.addEventListener('click', () => openModal(quest, false));
        actions.appendChild(btnDetail);
    }

    const btnDismiss = document.createElement('button');
    btnDismiss.className = 'btn btn-secondary btn-sm';
    btnDismiss.textContent = '✓ Ignorer';
    btnDismiss.title = 'Ignorer ce signalement sans supprimer la quête';
    btnDismiss.addEventListener('click', () => dismissReport(report.id, report.filename, row));
    actions.appendChild(btnDismiss);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn btn-danger btn-sm';
    btnDelete.textContent = '🗑 Supprimer la quête';
    btnDelete.addEventListener('click', () => deleteReportedQuest(report.id, report.filename, row));
    actions.appendChild(btnDelete);

    row.appendChild(actions);
    return row;
}

async function dismissReport(id, filename, rowEl) {
    try {
        await api('dismiss_report', { id });
        rowEl.classList.add('row-fade-out');
        setTimeout(() => {
            rowEl.remove();
            showToast('Signalement ignoré.', 'success');
            updateReportsBadge();
        }, 400);
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

async function deleteReportedQuest(id, filename, rowEl) {
    const confirmed = await showConfirm(
        'Supprimer la quête signalée',
        `Supprimer définitivement <strong>${esc(filename)}</strong> suite à ce signalement ? Cette action est irréversible.`
    );
    if (!confirmed) return;
    try {
        await api('delete_reported', { id });
        // Retirer toutes les lignes de signalement pour ce fichier
        document.querySelectorAll('.pending-row').forEach(r => {
            if (r.id.startsWith('report-')) {
                const reportId = r.id.replace('report-', '');
                // On recharge la liste entière pour être propre
            }
        });
        showToast('Quête supprimée.', 'success');
        loadReports();
        loadQuests();
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

function updateReportsBadge() {
    const remaining = document.querySelectorAll('[id^="report-"]').length;
    const badge = document.getElementById('reportedBadge');
    if (badge) {
        badge.textContent = remaining;
        badge.style.display = remaining ? 'inline-flex' : 'none';
    }
    if (!remaining) {
        const list = document.getElementById('reportedList');
        if (list) list.innerHTML = '<div class="state-message"><span class="state-icon">✓</span>Aucun signalement en attente.</div>';
    }
}

/* ══════════════════════════════════════════════════════════
   MODAL DE SIGNALEMENT (public)
   ══════════════════════════════════════════════════════════ */
let currentReportQuest = null;

function openReportModal(quest) {
    currentReportQuest = quest;
    const overlay = document.getElementById('reportOverlay');
    if (!overlay) return;

    const nameEl = document.getElementById('reportQuestName');
    if (nameEl) nameEl.textContent = quest.title || quest.filename;

    // Reset
    document.querySelectorAll('input[name="reportReason"]').forEach(r => r.checked = false);
    const commentEl = document.getElementById('reportComment');
    if (commentEl) commentEl.value = '';
    const errEl  = document.getElementById('reportError');
    const okEl   = document.getElementById('reportSuccess');
    if (errEl) errEl.style.display = 'none';
    if (okEl)  okEl.style.display  = 'none';

    const btnSubmit = document.getElementById('btnSubmitReport');
    if (btnSubmit) btnSubmit.disabled = false;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('reportClose')?.addEventListener('click', closeReportModal, { once: true });
    document.getElementById('reportCancel')?.addEventListener('click', closeReportModal, { once: true });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeReportModal(); }, { once: true });

    btnSubmit?.replaceWith(btnSubmit.cloneNode(true));
    document.getElementById('btnSubmitReport')?.addEventListener('click', submitReport);
}

function closeReportModal() {
    document.getElementById('reportOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    currentReportQuest = null;
}

async function submitReport() {
    const errEl = document.getElementById('reportError');
    const okEl  = document.getElementById('reportSuccess');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    const reason = document.querySelector('input[name="reportReason"]:checked')?.value ?? '';
    if (!reason) {
        errEl.textContent = 'Veuillez choisir une raison de signalement.';
        errEl.style.display = 'block';
        return;
    }

    const comment  = document.getElementById('reportComment')?.value ?? '';
    const filename = currentReportQuest?.filename ?? '';
    if (!filename) { errEl.textContent = 'Quête introuvable.'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('btnSubmitReport');
    if (btn) btn.disabled = true;

    try {
        const res = await api('report_quest', { filename, reason, comment });
        okEl.textContent = res.message ?? 'Signalement envoyé. Merci !';
        okEl.style.display = 'block';
        setTimeout(closeReportModal, 1800);
    } catch(e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
        if (btn) btn.disabled = false;
    }
}

/* ══════════════════════════════════════════════════════════
   GESTION DES MODÉRATEURS (admin uniquement)
   ══════════════════════════════════════════════════════════ */
async function loadModerators() {
    const list = document.getElementById('moderatorList');
    if (!list) return;
    list.innerHTML = '<div class="state-message"><span class="spinner"></span>Chargement…</div>';
    try {
        const data = await api('list_moderators');
        const users = data.users ?? [];

        if (!users.length) {
            list.innerHTML = '<div class="state-message"><span class="state-icon">👤</span>Aucun utilisateur.</div>';
            return;
        }

        list.innerHTML = '';
        users.forEach(u => list.appendChild(buildModoRow(u)));
    } catch(e) {
        list.innerHTML = `<div class="state-message">Erreur : ${esc(e.message)}</div>`;
    }
}

function buildModoRow(user) {
    const row = document.createElement('div');
    row.className = 'moderator-row';
    row.id = 'modo-' + user.login;

    const info = document.createElement('div');
    info.className = 'moderator-info';
    info.innerHTML = `
        <div class="moderator-name">${esc(user.displayName || user.login)}</div>
        <div class="moderator-meta">
            <code class="moderator-login">${esc(user.login)}</code>
            <span class="moderator-role-badge ${user.role === 'admin' ? 'role-admin' : 'role-modo'}">
                ${user.role === 'admin' ? '⚙ Admin' : '🛡 Modo'}
            </span>
        </div>`;
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'moderator-actions';

    if (user.role !== 'admin') {
        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-secondary btn-sm';
        btnEdit.textContent = '✏ Modifier';
        btnEdit.addEventListener('click', () => openModoModal(user));
        actions.appendChild(btnEdit);

        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger btn-sm';
        btnDel.textContent = '🗑 Supprimer';
        btnDel.addEventListener('click', () => deleteModerator(user.login, row));
        actions.appendChild(btnDel);
    } else {
        const tag = document.createElement('span');
        tag.style.cssText = 'font-size:.8em;opacity:.5;font-style:italic';
        tag.textContent = 'Compte principal';
        actions.appendChild(tag);
    }

    row.appendChild(actions);
    return row;
}

/* ══════════════════════════════════════════════════════════
   MODAL AVERTISSEMENTS (admin + modo)
   ══════════════════════════════════════════════════════════ */

let currentWarningsQuest = null;

/**
 * Ouvre la modal affichant les avertissements d'une quête en attente.
 * Les avertissements sont lus depuis quest.warnings (déjà chargé) ou
 * fetchés depuis l'API si absents.
 */
function openWarningsModal(quest) {
    currentWarningsQuest = quest;

    const overlay = document.getElementById('warningsOverlay');
    if (!overlay) return;

    // Titre
    const titleEl = document.getElementById('warningsModalTitle');
    if (titleEl) titleEl.textContent = `Avertissements — ${quest.title || quest.filename}`;

    const listEl = document.getElementById('warningsList');
    if (!listEl) return;

    const warnings = quest.warnings ?? [];

    if (warnings.length) {
        renderWarningsList(listEl, warnings);
    } else {
        // Pas de warnings en cache local : tenter de les charger via l'API
        listEl.innerHTML = '<li class="warnings-loading"><span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></span> Chargement…</li>';
        api('get_warnings', { filename: quest.filename })
            .then(data => {
                const w = data.warnings ?? [];
                if (w.length) {
                    renderWarningsList(listEl, w);
                } else {
                    listEl.innerHTML = '<li class="warnings-none">✓ Aucun avertissement enregistré pour cette quête.</li>';
                }
            })
            .catch(err => {
                listEl.innerHTML = `<li class="warnings-error">Erreur lors du chargement : ${esc(err.message)}</li>`;
            });
    }

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('warningsClose')?.addEventListener('click', closeWarningsModal, { once: true });
    overlay.addEventListener('click', e => { if (e.target === overlay) closeWarningsModal(); }, { once: true });
}

function renderWarningsList(listEl, warnings) {
    listEl.innerHTML = '';
    warnings.forEach(w => {
        const li = document.createElement('li');
        li.className = 'warnings-item';
        li.textContent = w;
        listEl.appendChild(li);
    });
}

function closeWarningsModal() {
    document.getElementById('warningsOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    currentWarningsQuest = null;
}

/* ── Modal créer / éditer modérateur ─────────────────────── */
let currentModoEdit = null; // null = création, string login = édition

function openModoModal(user) {
    const overlay = document.getElementById('modoOverlay');
    if (!overlay) return;

    currentModoEdit = user ? user.login : null;

    // Titre
    document.getElementById('modoModalTitle').textContent =
        user ? `Modifier « ${user.displayName || user.login} »` : 'Nouveau modérateur';

    // Champ login : visible seulement en création
    const loginGroup = document.getElementById('modoLoginGroup');
    if (loginGroup) loginGroup.style.display = user ? 'none' : '';

    document.getElementById('modoLogin').value       = '';
    document.getElementById('modoDisplayName').value = user?.displayName ?? '';
    document.getElementById('modoPass').value        = '';

    // Réinitialiser l'indicateur de force
    const strengthEl = document.getElementById('modoPassStrength');
    if (strengthEl) strengthEl.style.display = 'none';
    bindPasswordStrength('modoPass', 'modoPassStrength');

    // Indice mot de passe
    const hint = document.getElementById('modoPassHint');
    if (hint) hint.textContent = user ? '(laisser vide = inchangé)' : '';

    const errEl = document.getElementById('modoError');
    if (errEl) errEl.style.display = 'none';

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Sauvegarder
    const btnSave = document.getElementById('btnSaveModo');
    // Supprimer l'ancien listener pour éviter les doublons
    btnSave.replaceWith(btnSave.cloneNode(true));
    document.getElementById('btnSaveModo').addEventListener('click', saveModerator);

    // Fermer
    document.getElementById('modoClose').onclick = closeModoModal;
    overlay.onclick = e => { if (e.target === overlay) closeModoModal(); };
}

function closeModoModal() {
    document.getElementById('modoOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    currentModoEdit = null;
}

async function saveModerator() {
    const errEl  = document.getElementById('modoError');
    errEl.style.display = 'none';

    const displayName = document.getElementById('modoDisplayName')?.value.trim() ?? '';
    const pass        = document.getElementById('modoPass')?.value ?? '';

    // Mot de passe obligatoire en création, optionnel en édition
    if (pass !== '') {
        const passErr = checkPasswordRules(pass);
        if (passErr) {
            errEl.textContent = passErr;
            errEl.style.display = 'block';
            return;
        }
    } else if (!currentModoEdit) {
        errEl.textContent = 'Le mot de passe est requis pour créer un modérateur.';
        errEl.style.display = 'block';
        return;
    }

    try {
        if (currentModoEdit) {
            // Édition
            await api('update_moderator', {
                login: currentModoEdit,
                displayName,
                password: pass,
            });
            showToast('Modérateur mis à jour.', 'success');
        } else {
            // Création
            const login = document.getElementById('modoLogin')?.value.trim() ?? '';
            await api('create_moderator', { login, displayName, password: pass });
            showToast('Modérateur créé.', 'success');
        }
        closeModoModal();
        loadModerators();
    } catch(e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
    }
}

async function deleteModerator(login, rowEl) {
    const confirmed = await showConfirm(
        'Supprimer le modérateur',
        `Supprimer le compte <strong>${esc(login)}</strong> ? Cette action est irréversible.`
    );
    if (!confirmed) return;
    try {
        await api('delete_moderator', { login });
        rowEl.classList.add('row-fade-out');
        setTimeout(() => {
            rowEl.remove();
            showToast('Modérateur supprimé.', 'success');
            const remaining = document.querySelectorAll('.moderator-row').length;
            if (!remaining) {
                document.getElementById('moderatorList').innerHTML =
                    '<div class="state-message"><span class="state-icon">👤</span>Aucun utilisateur.</div>';
            }
        }, 400);
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

/* ══════════════════════════════════════════════════════════
   LOGS
   ══════════════════════════════════════════════════════════ */

let allLogs = [];

async function loadLogs() {
    const list = document.getElementById('logsList');
    if (!list) return;
    list.innerHTML = '<div class="state-message"><span class="spinner"></span>Chargement…</div>';
    try {
        const data = await api('list_logs');
        allLogs = data.logs ?? [];
        populateLogsFilters();
        renderLogs();
    } catch(e) {
        list.innerHTML = `<div class="state-message">Erreur : ${esc(e.message)}</div>`;
    }
}

function populateLogsFilters() {
    const sel = document.getElementById('logsFilterUser');
    if (!sel) return;
    // Conserver la sélection courante
    const current = sel.value;
    // Vider sauf la première option
    while (sel.options.length > 1) sel.remove(1);
    const seen = new Set();
    for (const l of allLogs) {
        if (!seen.has(l.login)) {
            seen.add(l.login);
            const o = document.createElement('option');
            o.value = l.login;
            o.textContent = l.displayName || l.login;
            sel.appendChild(o);
        }
    }
    sel.value = current;
}

function renderLogs() {
    const list        = document.getElementById('logsList');
    if (!list) return;
    const filterUser   = document.getElementById('logsFilterUser')?.value   ?? '';
    const filterAction = document.getElementById('logsFilterAction')?.value ?? '';

    const filtered = allLogs.filter(l => {
        if (filterUser   && l.login  !== filterUser)   return false;
        if (filterAction && l.action !== filterAction) return false;
        return true;
    });

    if (!filtered.length) {
        list.innerHTML = '<div class="state-message"><span class="state-icon">📋</span>Aucun log à afficher.</div>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(l => list.appendChild(buildLogRow(l)));
}

const LOG_META = {
    validate:        { label: 'Validation',               icon: '✓',  cls: 'log-validate' },
    refuse:          { label: 'Refus',                    icon: '✗',  cls: 'log-refuse'   },
    delete:          { label: 'Suppression',              icon: '🗑', cls: 'log-delete'   },
    edit_quest:      { label: 'Édition',                  icon: '✏', cls: 'log-edit'     },
    dismiss_report:  { label: 'Signalement ignoré',       icon: '✓',  cls: 'log-validate' },
    delete_reported: { label: 'Suppression (signalement)', icon: '🚩', cls: 'log-delete'   },
};

function buildLogRow(log) {
    const row  = document.createElement('div');
    row.className = 'log-row';

    const meta = LOG_META[log.action] ?? { label: log.action, icon: '?', cls: '' };
    const date = new Date(log.at * 1000);
    const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    row.innerHTML = `
        <span class="log-action-badge ${meta.cls}">${meta.icon} ${meta.label}</span>
        <div class="log-info">
            <span class="log-user">${esc(log.displayName || log.login)}</span>
            <span class="log-filename">${esc(log.filename)}</span>
        </div>
        <span class="log-date">${dateStr}</span>`;
    return row;
}

async function clearLogs() {
    const confirmed = await showConfirm(
        'Vider l\'historique',
        'Supprimer <strong>tous les logs</strong> ? Cette action est irréversible.'
    );
    if (!confirmed) return;
    try {
        await api('clear_logs');
        allLogs = [];
        renderLogs();
        showToast('Historique vidé.', 'success');
    } catch(e) {
        showToast('Erreur : ' + e.message, 'error');
    }
}

/* ══════════════════════════════════════════════════════════
   VALIDATEUR MOT DE PASSE
   ══════════════════════════════════════════════════════════ */

const PASS_RULES = [
    { id: 'len',     label: '12 caractères minimum',      test: p => p.length >= 12 },
    { id: 'letter',  label: 'Au moins une lettre',         test: p => /[a-zA-Z]/.test(p) },
    { id: 'digit',   label: 'Au moins un chiffre',         test: p => /[0-9]/.test(p) },
    { id: 'special', label: 'Au moins un caractère spécial', test: p => /[^a-zA-Z0-9]/.test(p) },
];

/**
 * Branche le retour visuel en direct sur un champ mot de passe.
 * @param {string} inputId   - id du <input type="password">
 * @param {string} strengthId - id du conteneur .pass-strength
 */
function bindPasswordStrength(inputId, strengthId) {
    const input     = document.getElementById(inputId);
    const container = document.getElementById(strengthId);
    if (!input || !container) return;

    input.addEventListener('input', () => updateStrengthUI(input.value, container));
    // Masquer quand le champ est vide au départ
    updateStrengthUI(input.value, container);
}

function updateStrengthUI(pass, container) {
    if (pass === '') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const results = PASS_RULES.map(r => ({ ...r, ok: r.test(pass) }));
    const allOk   = results.every(r => r.ok);

    container.innerHTML = results.map(r => `
        <div class="pass-rule ${r.ok ? 'pass-rule-ok' : 'pass-rule-fail'}">
            <span class="pass-rule-icon">${r.ok ? '✓' : '✗'}</span>
            ${r.label}
        </div>`).join('');
}

/**
 * Vérifie qu'un mot de passe remplit toutes les règles.
 * Retourne un message d'erreur ou null si valide.
 */
function checkPasswordRules(pass) {
    for (const r of PASS_RULES) {
        if (!r.test(pass)) return r.label + ' requis(e).';
    }
    return null;
}

/* ══════════════════════════════════════════════════════════
   PROFIL
   ══════════════════════════════════════════════════════════ */
function bindProfile() {
    const overlay = document.getElementById('profileOverlay');
    if (!overlay) return;

    bindPasswordStrength('profileNewPass', 'profilePassStrength');

    document.getElementById('btnProfile')?.addEventListener('click', () => {
        const errEl = document.getElementById('profileError');
        const okEl  = document.getElementById('profileSuccess');
        if (errEl) errEl.style.display = 'none';
        if (okEl)  okEl.style.display  = 'none';
        document.getElementById('profileCurrentPass').value = '';
        document.getElementById('profileNewPass').value     = '';
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    document.getElementById('profileClose')?.addEventListener('click', closeProfileModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeProfileModal(); });

    document.getElementById('btnSaveProfile')?.addEventListener('click', saveProfile);
}

function closeProfileModal() {
    document.getElementById('profileOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
}

async function saveProfile() {
    const errEl = document.getElementById('profileError');
    const okEl  = document.getElementById('profileSuccess');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    const newLogin      = document.getElementById('profileNewLogin')?.value.trim() ?? '';
    const displayName   = document.getElementById('profileDisplayName')?.value.trim() ?? '';
    const newPass       = document.getElementById('profileNewPass')?.value ?? '';
    const currentPass   = document.getElementById('profileCurrentPass')?.value ?? '';

    if (!currentPass) {
        errEl.textContent = 'Le mot de passe actuel est requis.';
        errEl.style.display = 'block';
        return;
    }

    // Validation des règles si un nouveau mot de passe est saisi
    if (newPass !== '') {
        const passErr = checkPasswordRules(newPass);
        if (passErr) {
            errEl.textContent = passErr;
            errEl.style.display = 'block';
            return;
        }
    }

    try {
        const res = await api('update_profile', {
            newLogin,
            displayName,
            password: newPass,
            currentPassword: currentPass,
        });
        okEl.textContent = res.message ?? 'Profil mis à jour.';
        okEl.style.display = 'block';

        // Mettre à jour le bouton profil
        if (res.displayName) {
            const btn = document.getElementById('btnProfile');
            if (btn) btn.textContent = '👤 ' + res.displayName;
        }
        // Si l'identifiant a changé, on recharge pour que PHP reflète la nouvelle session
        if (newLogin !== '') {
            setTimeout(() => window.location.reload(), 800);
        }
        document.getElementById('profileCurrentPass').value = '';
        document.getElementById('profileNewPass').value     = '';
        document.getElementById('profileNewLogin').value    = '';
    } catch(e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
    }
}

/* ══════════════════════════════════════════════════════════
   MODAL CONFIRMATION
   ══════════════════════════════════════════════════════════ */
function showConfirm(title, message) {
    return new Promise(resolve => {
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

        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').innerHTML = message;

        const close = (result) => {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            document.getElementById('confirmOk').replaceWith(document.getElementById('confirmOk').cloneNode(true));
            document.getElementById('confirmCancel').replaceWith(document.getElementById('confirmCancel').cloneNode(true));
            resolve(result);
        };

        document.getElementById('confirmOk').addEventListener('click',     () => close(true));
        document.getElementById('confirmCancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });

        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('confirmCancel')?.focus(), 50);
    });
}

/* ══════════════════════════════════════════════════════════
   LOGIN
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

/* Couleur de bannière selon la zone */
const ZONE_COLORS = {
    'st101_砂':         { from: '#8a7020', to: '#b89830', dim: 'rgba(138,112,32,0.12)' },  // Plaines venteuses – ocre doré
    'st102_森':         { from: '#2a6b3a', to: '#3a9450', dim: 'rgba(42,107,58,0.12)'  },  // Forêt écarlate – vert forêt
    'st103_油田':       { from: '#8a2020', to: '#b83232', dim: 'rgba(138,32,32,0.12)'  },  // Bassin pétrolier – rouge brûlé
    'st104_壁':         { from: '#2060a0', to: '#3a82cc', dim: 'rgba(32,96,160,0.12)'  },  // Falaises de glace – bleu glacé
    'st105_炉心':       { from: '#4a4f62', to: '#6b7290', dim: 'rgba(74,79,98,0.12)'   },  // Ruines de Wyveria – gris pierre
    'st401_闘技場':     { from: '#5c2880', to: '#8040b8', dim: 'rgba(92,40,128,0.12)'  },  // Vallon meurtri – violet arène
    'st402_壁ヌシ戦闘': { from: '#6a7890', to: '#98aabf', dim: 'rgba(106,120,144,0.12)'},  // Cimes gelées – blanc glaciaire
};

function zoneGradient(stageName) {
    const c = ZONE_COLORS[stageName];
    if (!c) return { bg: 'linear-gradient(90deg,#2e3450,#3d4a6e)', dim: 'rgba(46,52,80,0.12)' };
    return { bg: `linear-gradient(90deg,${c.from},${c.to})`, dim: c.dim };
}

/* Couleur solide des étoiles actives selon le niveau */
function levelStarColor(l) {
    if (l >= 10) return { active: '#d4256e', glow: 'rgba(212,37,110,0.55)' };
    if (l >= 8)  return { active: '#e09a38', glow: 'rgba(224,154,56,0.55)'  };
    if (l >= 6)  return { active: '#3a82cc', glow: 'rgba(58,130,204,0.55)'  };
    return { active: '#34a85a', glow: 'rgba(52,168,90,0.55)' };
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