/* ============================================================
   app.js – État global de l'application et fonctions utilitaires
   ============================================================ */

/* ── État global ──────────────────────────────────────────── */

/** Données des ennemis chargées depuis datas/enemies.json */
let enemiesData = [];

/** Données des objets chargées depuis datas/items.json */
let itemsData = [];

/** Liste des récompenses de quête chargée depuis datas/reward_list.json */
let rewardListData = {};

/** Monstres actuellement sélectionnés par l'utilisateur */
let selectedMonsters = [];

/** Objets de récompense ajoutés par l'utilisateur */
let rewardItems = [];

/** Langue d'affichage courante (code BCP-47) */
let currentLanguage = 'fr-fr';

/** Données de la quête générée (fichiers raw et ext) */
let questData = {
    raw: null,
    ext: null
};

/* ── Correspondances ──────────────────────────────────────── */

/**
 * Retourne le nom court du lieu (identifiant de stage) à partir de son ID numérique.
 * @param {string} locationId - L'identifiant numérique du lieu.
 * @returns {string} Le code court du stage (ex. "st401").
 */
function getLocationName(locationId) {
    // Noms de stage exacts tels qu'ils apparaissent dans les quêtes officielles du jeu.
    const locations = {
        "-1226157568": "st101_砂",       // Plaines venteuses
        "-859829056":  "st102_森",       // Forêt écarlate
        "-1251081216": "st103_油田",     // Bassin pétrolier
        "1182228864":  "st104_壁",       // Falaises de glace
        "327401792":   "st105_炉心",     // Ruines de Wyveria
        "1181994624":  "st401_闘技場",   // Vallon meurtri (arène)
        "544388992":  "st402_壁ヌシ戦闘" // Cimes gelées
    };
    return locations[locationId] || "st401";
}

/**
 * Retourne l'index numérique d'une langue utilisé dans les assets de messages.
 * @param {string} language - Le code de langue BCP-47 (ex. "fr-fr").
 * @returns {number} L'index correspondant (par défaut 2 = français).
 */
function getLanguageCode(language) {
    const codes = {
        "ja-jp":  0,
        "en-us":  1,
        "fr-fr":  2,
        "it-it":  3,
        "de-de":  4,
        "es-es":  5,
        "es-la":  6,
        "pt-br":  7,
        "pl-pl":  8,
        "ru-ru":  9,
        "ko-kr": 10,
        "zh-cn": 11,
        "zh-tw": 12,
        "ar-sa": 13
    };
    return codes[language] ?? 2;
}

/**
 * Retourne la configuration recommandée (zenny, points RC, rewardId, RC minimum)
 * en fonction du niveau de la quête.
 * @param {number} level - Le niveau de quête (1 à 10).
 * @returns {Object} La configuration associée au niveau.
 */
function getQuestLevelConfig(level) {
    // Mapping rewardId par niveau :
    // 1–3 → 201, 4–6 → 301, 7 → 450, 8 → 520, 9 → 620, 10 → 630
    const configs = {
        1:  { money: 2400,  hrPoints: 100,  rewardId: 201, orderHR: 1   },
        2:  { money: 4800,  hrPoints: 180,  rewardId: 201, orderHR: 1   },
        3:  { money: 7200,  hrPoints: 270,  rewardId: 201, orderHR: 10  },
        4:  { money: 9600,  hrPoints: 360,  rewardId: 301, orderHR: 20  },
        5:  { money: 12000, hrPoints: 450,  rewardId: 301, orderHR: 25  },
        6:  { money: 16800, hrPoints: 540,  rewardId: 301, orderHR: 30  },
        7:  { money: 20400, hrPoints: 600,  rewardId: 450, orderHR: 40  },
        8:  { money: 24000, hrPoints: 660,  rewardId: 520, orderHR: 60  },
        9:  { money: 36000, hrPoints: 900,  rewardId: 620, orderHR: 100 },
        10: { money: 48000, hrPoints: 1200, rewardId: 630, orderHR: 100 }
    };
    return configs[level] || configs[8];
}

/* ── Alertes ──────────────────────────────────────────────── */

/**
 * Affiche un message d'alerte temporaire en haut de page.
 * @param {string} message - Le texte à afficher.
 * @param {'error'|'success'} [type='error'] - Le type d'alerte (couleur).
 */
function showAlert(message, type = 'error') {
    try {
        const alert = document.getElementById('alert-message');
        if (!alert) {
            console.error("Élément d'alerte introuvable");
            console.log(message);
            return;
        }

        alert.textContent = message;
        alert.style.display = 'block';

        // Couleurs selon le type d'alerte
        if (type === 'success') {
            alert.style.backgroundColor = '#0d2b1a';
            alert.style.borderColor     = '#1a5c32';
            alert.style.color           = '#4caf82';
        } else {
            alert.style.backgroundColor = '#2b0d0d';
            alert.style.borderColor     = '#5c1a1a';
            alert.style.color           = '#e07070';
        }

        // Disparition automatique après 5 secondes
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    } catch (error) {
        console.error("Erreur lors de l'affichage de l'alerte :", error);
        console.log(message);
    }
}