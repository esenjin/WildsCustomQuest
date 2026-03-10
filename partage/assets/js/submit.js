/* ============================================================
   submit.js – Soumission en deux temps
   Étape 1 : analyse progressive du ZIP avec checklist visuelle
   Étape 2 : envoi après validation complète
   ============================================================ */

let validatedFile = null;
let validatedId   = null;

/* ── Init ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    bindDropzone();
    document.getElementById('btnSubmit')?.addEventListener('click', doSubmit);
    document.getElementById('btnReset2')?.addEventListener('click', resetAll);
});

/* ── Dropzone ────────────────────────────────────────────── */
function bindDropzone() {
    const zone  = document.getElementById('dropzone');
    const input = document.getElementById('fileInput');
    if (!zone || !input) return;

    input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
}

/* ── Gestion d'un fichier ────────────────────────────────── */
async function handleFile(file) {
    validatedFile = null;
    validatedId   = null;
    resetStep2();
    hideChecklist(); // reset visuel

    document.getElementById('dropzoneName').textContent = file.name;
    showChecklist();

    // Initialiser tous les items à "en cours"
    const checks = ['format','size','zip','json','id','title','monsters','rewards','duplicate'];
    checks.forEach(id => setCheck(id, 'pending', '', ''));

    /* ── 1. Extension ──────────────────────────────────────── */
    await delay(120);
    if (!file.name.toLowerCase().endsWith('.zip')) {
        return setCheck('format', 'error', 'Format du fichier', 'Extension invalide — le fichier doit être un .zip');
    }
    setCheck('format', 'ok', 'Format du fichier', `.zip ✓`);

    /* ── 2. Taille ─────────────────────────────────────────── */
    await delay(80);
    const MAX = 2 * 1024 * 1024;
    const kb  = (file.size / 1024).toFixed(0);
    if (file.size > MAX) {
        return setCheck('size', 'error', 'Taille', `${kb} Ko — dépasse la limite de 2 Mo`);
    }
    setCheck('size', 'ok', 'Taille', `${kb} Ko ✓`);

    /* ── 3. Magic bytes ────────────────────────────────────── */
    await delay(80);
    const magic = await readMagic(file);
    if (magic.slice(0,2) !== 'PK') {
        return setCheck('zip', 'error', 'Signature ZIP', 'Octets PK manquants — fichier ZIP invalide');
    }
    setCheck('zip', 'ok', 'Signature ZIP', 'PK… ✓');

    /* ── 4. Lecture du ZIP ─────────────────────────────────── */
    await delay(100);
    let raw, ext;
    try {
        if (typeof JSZip === 'undefined') throw new Error('JSZip non disponible');
        const zip = await JSZip.loadAsync(file);
        let rawStr = null, extStr = null;
        zip.forEach((path, f) => {
            if (!path.endsWith('/') && !path.includes('__MACOSX')) {
                if (path.endsWith('.raw.json')) rawStr = f;
                if (path.endsWith('.ext.json')) extStr = f;
            }
        });
        if (!rawStr) throw new Error('.raw.json introuvable dans l\'archive');
        if (!extStr) throw new Error('.ext.json introuvable dans l\'archive');
        raw = JSON.parse(await rawStr.async('string'));
        ext = JSON.parse(await extStr.async('string'));
        setCheck('json', 'ok', 'Fichiers .raw.json et .ext.json', 'Présents et valides ✓');
    } catch(e) {
        return setCheck('json', 'error', 'Fichiers .raw.json / .ext.json', e.message);
    }

    /* ── 5. ID de quête ────────────────────────────────────── */
    await delay(80);
    const questId = raw?._DataList?._MissionId?._Value;
    if (!questId || typeof questId !== 'number') {
        return setCheck('id', 'error', 'ID de quête', '_DataList._MissionId._Value manquant ou invalide');
    }
    setCheck('id', 'ok', 'ID de quête', `#${questId} ✓`);

    /* ── 6. Titre FR ───────────────────────────────────────── */
    await delay(80);
    const msgFR = raw._MessageAssetList?.find(m => m.Language === 2);
    const title = msgFR?.MessageData?.find(m => m.Name?.endsWith('_100'))?.Text?.trim() ?? '';
    if (!title) {
        return setCheck('title', 'error', 'Titre de la quête (FR)', 'Titre vide dans le fichier');
    }
    setCheck('title', 'ok', 'Titre de la quête (FR)', `« ${title} » ✓`);

    /* ── 7. Monstres ───────────────────────────────────────── */
    await delay(80);
    const targets = raw._BossZakoDataList?._MainTargetDataList ?? [];
    if (!targets.length) {
        return setCheck('monsters', 'error', 'Monstres cibles', 'Aucun monstre trouvé (_BossZakoDataList._MainTargetDataList vide)');
    }
    // Charger enemies.json localement et vérifier chaque _EmID
    setCheck('monsters', 'loading', 'Monstres cibles', 'Vérification des monstres…');
    try {
        const enemies = await loadEnemies();
        const knownIds = new Set(enemies.map(e => e.fixedId));
        const unknown = targets.filter(t => !knownIds.has(t._EmID));
        if (unknown.length) {
            const names = unknown.map(t => `#${t._EmID}`).join(', ');
            return setCheck('monsters', 'error', 'Monstres cibles', `Monstre(s) inconnu(s) : ${names}`);
        }
        // Construire le résumé avec les noms FR
        const names = targets.map(t => {
            const e = enemies.find(e => e.fixedId === t._EmID);
            return e?.name?.['fr-fr'] ?? e?.name?.['en-us'] ?? `#${t._EmID}`;
        }).join(', ');
        setCheck('monsters', 'ok', 'Monstres cibles', `${targets.length} monstre(s) : ${names} ✓`);
    } catch(_) {
        // enemies.json inaccessible : on compte sans nommer
        setCheck('monsters', 'warn', 'Monstres cibles', `${targets.length} monstre(s) détecté(s) — vérification des noms impossible`);
    }

    /* ── 8. Récompenses ────────────────────────────────────── */
    await delay(80);
    const rewards = ext?.rewardItems ?? [];
    if (!rewards.length) {
        return setCheck('rewards', 'error', 'Récompenses', 'rewardItems vide dans le .ext.json');
    }
    setCheck('rewards', 'ok', 'Récompenses', `${rewards.length} récompense(s) ✓`);

    /* ── 9. Doublon d'ID (via API serveur) ─────────────────── */
    await delay(100);
    setCheck('duplicate', 'loading', 'Vérification doublon d\'ID', 'Interrogation du serveur…');
    try {
        const res  = await fetch(`api.php?action=check_duplicate&id=${questId}`);
        const data = await res.json();
        if (data.inBase) {
            return setCheck('duplicate', 'error', 'Doublon d\'ID', `L'ID #${questId} existe déjà dans le hub — changez l'ID dans le générateur`);
        }
        if (data.inAttente) {
            return setCheck('duplicate', 'error', 'Doublon d\'ID', `L'ID #${questId} est déjà en attente de validation`);
        }
        setCheck('duplicate', 'ok', 'Vérification doublon d\'ID', `ID #${questId} disponible ✓`);
    } catch(_) {
        // Si l'API échoue, on laisse le serveur vérifier lors de l'upload
        setCheck('duplicate', 'warn', 'Vérification doublon d\'ID', 'Vérification côté serveur à l\'envoi');
    }

    /* ── Tout bon ──────────────────────────────────────────── */
    validatedFile = file;
    validatedId   = questId;
    showStep2(title, questId);
}

/* ── Affichage étape 2 ───────────────────────────────────── */
function showStep2(title, questId) {
    const card = document.getElementById('step2Card');
    const banner = document.getElementById('successBannerText');
    if (banner) banner.innerHTML = `Analyse réussie — <strong>${esc(title)}</strong> (ID #${questId}) prête à être soumise.`;
    if (card)   card.style.display = 'block';
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const btn = document.getElementById('btnSubmit');
    if (btn) btn.disabled = false;
}

function resetStep2() {
    const card = document.getElementById('step2Card');
    if (card) card.style.display = 'none';
    resetSubmitResult();
    const btn = document.getElementById('btnSubmit');
    if (btn) btn.disabled = true;
}

/* ── Soumission ──────────────────────────────────────────── */
async function doSubmit() {
    if (!validatedFile) return;

    const pseudo = document.getElementById('pseudoInput')?.value.trim() ?? '';
    if (!pseudo) return showSubmitResult(false, 'Veuillez saisir votre pseudo.');
    if (!/^[a-zA-Z0-9]{1,15}$/.test(pseudo))
        return showSubmitResult(false, 'Pseudo invalide (1–15 caractères alphanumériques uniquement).');

    const btn = document.getElementById('btnSubmit');
    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span>Envoi en cours…';
    resetSubmitResult();

    const fd = new FormData();
    fd.append('action',   'upload');
    fd.append('questzip', validatedFile, validatedFile.name);
    fd.append('pseudo',   pseudo);

    try {
        const res  = await fetch('api.php', { method: 'POST', body: fd });
        const data = await res.json();

        if (data.ok) {
            showSubmitResult(true, data.message ?? 'Quête soumise avec succès !');
            // Cacher l'étape 2, bloquer nouvelle soumission sans reset
            btn.disabled  = true;
            btn.innerHTML = '✦ Soumettre la quête';
        } else {
            showSubmitResult(false, data.message ?? 'Erreur inconnue.');
            btn.disabled  = false;
            btn.innerHTML = '✦ Soumettre la quête';
        }
    } catch(e) {
        showSubmitResult(false, 'Erreur réseau : ' + e.message);
        btn.disabled  = false;
        btn.innerHTML = '✦ Soumettre la quête';
    }
}

/* ── Reset complet ───────────────────────────────────────── */
function resetAll() {
    validatedFile = null;
    validatedId   = null;
    const input = document.getElementById('fileInput');
    if (input) input.value = '';
    document.getElementById('dropzoneName').textContent = '';
    hideChecklist();
    resetStep2();
}

/* ── Checklist UI ────────────────────────────────────────── */
function showChecklist() {
    const el = document.getElementById('analysisChecklist');
    if (el) el.style.display = 'block';
}
function hideChecklist() {
    const el = document.getElementById('analysisChecklist');
    if (el) { el.style.display = 'none'; }
}

function setCheck(id, state, label, detail) {
    const row = document.getElementById('chk-' + id);
    if (!row) return;

    const iconEl   = row.querySelector('.chk-icon');
    const labelEl  = row.querySelector('.chk-label');
    const detailEl = row.querySelector('.chk-detail');

    const icons = {
        pending: '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></span>',
        loading: '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></span>',
        ok:      '<span class="chk-ok">✓</span>',
        warn:    '<span class="chk-warn">⚠</span>',
        error:   '<span class="chk-err">✗</span>',
    };

    if (iconEl) iconEl.innerHTML = icons[state] ?? '…';
    row.className = 'checklist-item chk-state-' + state;
    if (label && labelEl)   labelEl.textContent  = label;
    if (detailEl) detailEl.textContent = detail ?? '';

    // Si erreur : arrêter les items suivants (griser)
    if (state === 'error') {
        let found = false;
        document.querySelectorAll('.checklist-item').forEach(item => {
            if (item.id === 'chk-' + id) { found = true; return; }
            if (found && item.className === 'checklist-item chk-state-pending') {
                item.classList.add('chk-state-skipped');
                item.querySelector('.chk-icon').textContent = '–';
            }
        });
    }
}

/* ── Résultat de soumission ──────────────────────────────── */
function showSubmitResult(ok, msg) {
    const el = document.getElementById('submitResult');
    if (!el) return;
    el.className = 'submit-result visible ' + (ok ? 'success' : 'error');
    el.innerHTML = (ok ? '✓ ' : '✗ ') + esc(msg);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function resetSubmitResult() {
    const el = document.getElementById('submitResult');
    if (el) { el.className = 'submit-result'; el.innerHTML = ''; }
}

/* ── Chargement enemies.json ─────────────────────────────── */
let _enemiesCache = null;
async function loadEnemies() {
    if (_enemiesCache) return _enemiesCache;
    const res = await fetch('../datas/enemies.json');
    if (!res.ok) throw new Error('enemies.json inaccessible');
    _enemiesCache = await res.json();
    return _enemiesCache;
}

/* ── Utilitaires ─────────────────────────────────────────── */
function readMagic(file) {
    return new Promise(res => {
        const r = new FileReader();
        r.onload = e => res(String.fromCharCode(...new Uint8Array(e.target.result).slice(0,4)));
        r.readAsArrayBuffer(file.slice(0, 4));
    });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
