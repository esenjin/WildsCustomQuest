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

    // Désélectionner les monstres incompatibles avec la nouvelle zone
    const removedNames = [];
    selectedMonsters = selectedMonsters.filter(m => {
        if (FROZEN_PEAKS_ONLY_IDS.has(m.fixedId) && locationId !== FROZEN_PEAKS_LOCATION) {
            removedNames.push(m.name?.[currentLanguage] ?? m.label);
            return false;
        }
        return true;
    });

    if (removedNames.length > 0) {
        showAlert(
            `${removedNames.join(', ')} ${removedNames.length > 1 ? 'ont été retirés' : 'a été retiré'} — uniquement disponible${removedNames.length > 1 ? 's' : ''} en zone Cimes gelées.`,
            'error'
        );
    }

    // Rafraîchir la liste pour appliquer / lever les verrous visuels
    populateMonsterList();
    updateMonsterPreview();
}

/**
 * Met à jour automatiquement les champs zenny, points RC et RC minimum
 * en fonction du niveau de quête sélectionné.
 * @param {string} level - Le niveau sélectionné (chaîne "1" à "10").
 */
function onQuestLevelChange(level) {
    const lvl = parseInt(level);
    const cfg = getQuestLevelConfig(lvl);
    document.getElementById('rewardMoney').value = cfg.money;
    document.getElementById('hrPoints').value    = cfg.hrPoints;
    document.getElementById('minRC').value       = cfg.orderHR;
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
