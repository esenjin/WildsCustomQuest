/* ============================================================
   ui.js – Navigation par onglets, écouteurs d'événements
             et gestion des changements de formulaire
   ============================================================ */

/* ── Navigation par onglets ───────────────────────────────── */

/**
 * Active l'onglet et le contenu correspondant à l'identifiant donné.
 * Masque tous les autres onglets et contenus.
 * @param {string} tabId - L'identifiant de l'onglet à activer (ex. "quest-info").
 */
function goToTab(tabId) {
    // Désactiver tous les contenus d'onglet
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Désactiver tous les onglets
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Activer l'onglet et son contenu sélectionné
    const tabContent = document.getElementById(tabId);
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);

    if (tabContent) tabContent.classList.add('active');
    if (tab) tab.classList.add('active');
}

/* ── Changements de formulaire ────────────────────────────── */

/**
 * Affiche ou masque l'option "monstres séquentiels" selon le lieu sélectionné.
 * Cette option n'est disponible que pour le Vallon meurtri (ID 1181994624).
 * @param {string} locationId - L'identifiant numérique du lieu choisi.
 */
function onLocationChange(locationId) {
    const seqOption = document.getElementById('sequential-option');
    if (locationId === '1181994624') {
        seqOption.classList.add('visible');
    } else {
        seqOption.classList.remove('visible');
        document.getElementById('sequentialMonsters').checked = false;
    }

    // Réinitialiser la zone de départ de chaque monstre sélectionné
    // vers la valeur par défaut de la nouvelle région
    selectedMonsters.forEach(m => {
        m.spawnZone = getDefaultSpawnZone(locationId);
    });

    // Rafraîchir la liste pour appliquer / lever les verrous visuels
    populateMonsterList();
    updateMonsterPreview();
}

/**
 * Met à jour les champs zenny / RC / RC min, applique les restrictions de grade
 * et de variant, puis avertit l'utilisateur si des sélections existantes
 * sont devenues invalides.
 * @param {string} level - Le niveau sélectionné ("1" à "10").
 */
function onQuestLevelChange(level) {
    const lvl = parseInt(level);
    const cfg = getQuestLevelConfig(lvl);
    document.getElementById('rewardMoney').value = cfg.money;
    document.getElementById('hrPoints').value    = cfg.hrPoints;
    document.getElementById('minRC').value       = cfg.orderHR;

    _applyGradeRestrictions(lvl);
    _applyVariantRestrictions(lvl);
    _refreshRestrictionsPanel();
}

/**
 * Appelé quand le grade global change.
 * Met à jour les checkboxes alpha/suprême et le panneau de restrictions.
 * @param {string} gradeStr - La valeur sélectionnée ("1" à "5").
 */
function onMonsterGradeChange(gradeStr) {
    const questLevel = parseInt(document.getElementById('questLevel')?.value ?? '8');
    _applyVariantRestrictions(questLevel);
    _refreshRestrictionsPanel();
}

/**
 * Désactive les options de grade invalides pour le niveau de quête donné
 * et force le grade courant vers le minimum autorisé si nécessaire.
 * @param {number} questLevel
 */
function _applyGradeRestrictions(questLevel) {
    const sel = document.getElementById('monsterDifficulty');
    if (!sel) return;

    const r = getQuestRestrictions(questLevel);
    let currentGrade = parseInt(sel.value);
    let changed = false;

    Array.from(sel.options).forEach(opt => {
        const g = parseInt(opt.value);
        opt.disabled = g < r.minGrade;
    });

    // Si le grade actuel est désormais invalide, monter au minimum autorisé
    if (currentGrade < r.minGrade) {
        sel.value = String(r.minGrade);
        changed = true;
    }

    if (changed) {
        const gradeName = sel.options[sel.selectedIndex]?.text ?? `Grade ${r.minGrade}`;
        const reason = questLevel >= 10
            ? 'les quêtes ★10 ne disposent que du grade 5 dans les données officielles'
            : 'les quêtes ★9 ne disposent pas de grades 1–2 dans les données officielles';
        showAlert(
            `Grade ajusté automatiquement → ${gradeName} : ${reason}.`,
            'error'
        );
        _applyVariantRestrictions(questLevel);
    }
}

/**
 * Parcourt tous les monstres sélectionnés et rétrograde les variants
 * devenus interdits (alpha → NONE, suprême → alpha ou NONE).
 * Affiche un avertissement groupé si des variants ont été modifiés.
 * @param {number} questLevel
 */
function _applyVariantRestrictions(questLevel) {
    const grade       = parseInt(document.getElementById('monsterDifficulty')?.value ?? '3');
    const alphaOk     = isAlphaAllowed(questLevel, grade);
    const supremeOk   = isSupremeAllowed(questLevel, grade);
    const downgraded  = [];

    selectedMonsters.forEach(m => {
        if (m.variant === 'ARCH_TEMPERED' && !supremeOk) {
            m.variant = alphaOk ? 'TEMPERED' : 'NONE';
            downgraded.push({ name: m.name?.[currentLanguage] ?? m.label, to: m.variant });
        } else if (m.variant === 'TEMPERED' && !alphaOk) {
            m.variant = 'NONE';
            downgraded.push({ name: m.name?.[currentLanguage] ?? m.label, to: 'NONE' });
        }
    });

    if (downgraded.length > 0) {
        const lines = downgraded.map(d => {
            const label = d.to === 'TEMPERED' ? 'Alpha' : 'Normal';
            return `${d.name} → ${label}`;
        });
        showAlert(
            `Variant${downgraded.length > 1 ? 's' : ''} rétrogradé${downgraded.length > 1 ? 's' : ''} automatiquement :
${lines.join(' · ')}`,
            'error'
        );
    }

    // Synchroniser les checkboxes visuellement
    populateMonsterList();
    updateMonsterPreview();
}

/**
 * Met à jour le panneau #difficulty-restrictions avec les restrictions actives.
 */
function _refreshRestrictionsPanel() {
    const panel = document.getElementById('difficulty-restrictions');
    if (!panel) return;

    const questLevel = parseInt(document.getElementById('questLevel')?.value ?? '8');
    const grade      = parseInt(document.getElementById('monsterDifficulty')?.value ?? '3');
    const html       = buildRestrictionsHTML(questLevel, grade);

    if (html) {
        panel.innerHTML = html;
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

/* ── Initialisation des écouteurs d'événements ────────────── */

/**
 * Enregistre tous les écouteurs d'événements globaux de l'application :
 * - Navigation par onglets
 * - Recherche de monstres et d'objets
 * - Changement de langue
 */
function setupEventListeners() {
    // Clics sur les onglets
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            goToTab(tab.dataset.tab);
        });
    });

    // Recherche dans la liste des monstres
    document.getElementById('searchMonster').addEventListener('input', function () {
        filterMonsters(this.value.toLowerCase());
    });

    // Recherche dans la liste des objets de récompense
    document.getElementById('searchItem').addEventListener('input', function () {
        filterItems(this.value.toLowerCase());
    });

    // Changement de la langue d'affichage
    document.getElementById('language').addEventListener('change', function () {
        currentLanguage = this.value;

        // Mettre à jour les éléments d'interface concernés
        populateMonsterList();
        updateMonsterPreview();
        updateRewardItemNames();

        // Le fichier reward_list.json est déjà multilingue, pas besoin de rechargement
        console.log(`Langue changée : ${currentLanguage}`);
    });
}