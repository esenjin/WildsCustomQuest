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
        "544388992":  "st402_壁ヌシ戦闘", // Cimes gelées
        "905584064": "st403"            // Torche Draconique
    };
    return locations[locationId] || "st401";
}

/**
 * Zones de spawn disponibles par région.
 * Les régions sans choix (Vallon meurtri, Cimes gelées) ont une valeur null
 * pour indiquer qu'aucun sélecteur ne doit être affiché.
 *
 * Clé   : ID numérique de la région (string)
 * Valeur: tableau de zones disponibles, ou null si zone fixe
 */
const LOCATION_SPAWN_ZONES = {
    "-1226157568": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],   // Plaines venteuses
    "-859829056":  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],   // Forêt écarlate
    "-1251081216": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],    // Bassin pétrolier
    "1182228864":  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],    // Falaises de glace
    "327401792":   [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],    // Ruines de Wyveria
    "1181994624":  null,    // Vallon meurtri — zone fixe (2)
    "544388992":   null,    // Cimes gelées — zone fixe (255)
    "905584064":   null     // Torche Draconique — zone fixe (255)
};

// Zones avec un camp pour le joueur
const LOCATION_CAMP_ZONES = {
    "-1226157568": [3, 4, 6, 8, 9, 10, 13, 14, 16],        // Plaines venteuses
    "-859829056":  [6, 7, 8, 10, 12, 14, 16, 17, 18],            // Forêt écarlate
    "-1251081216": [2, 4, 8, 9, 12, 13, 14, 15],        // Bassin pétrolier
    "1182228864":  [1, 6, 7, 15, 18, 19, 20],            // Falaises de glace
    "327401792":   [2, 6, 8, 9, 13],            // Ruines de Wyveria
};

/**
 * Retourne la zone de spawn par défaut pour une région donnée.
 * @param {string} locationId - L'ID de la région.
 * @returns {number} La zone de spawn par défaut.
 */
function getDefaultSpawnZone(locationId) {
    const zones = LOCATION_SPAWN_ZONES[locationId];
    if (zones && zones.length > 0) return zones[0];
    if (locationId === '1181994624') return 2;   // Vallon meurtri
    if (locationId === '544388992' || locationId === '905584064') return 255;  // Cimes gelées et Torche Draconique
    return 15; // fallback
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
        1:  { money: 2000,  hrPoints: 200,  rewardId: 201, orderHR: 1   },
        2:  { money: 5000,  hrPoints: 400,  rewardId: 201, orderHR: 1   },
        3:  { money: 8000,  hrPoints: 600,  rewardId: 201, orderHR: 10  },
        4:  { money: 10000, hrPoints: 800,  rewardId: 301, orderHR: 21  },
        5:  { money: 15000, hrPoints: 1000, rewardId: 301, orderHR: 21  },
        6:  { money: 20000, hrPoints: 1500, rewardId: 301, orderHR: 41  },
        7:  { money: 23000, hrPoints: 2000, rewardId: 450, orderHR: 41  },
        8:  { money: 25000, hrPoints: 2500, rewardId: 520, orderHR: 61  },
        9:  { money: 30000, hrPoints: 2800, rewardId: 620, orderHR: 100 },
        10: { money: 50000, hrPoints: 3400, rewardId: 630, orderHR: 100 }
    };
    return configs[level] || configs[8];
}

/* ══════════════════════════════════════════════════════════
   SYSTÈME DE RESTRICTIONS DE DIFFICULTÉ
   ══════════════════════════════════════════════════════════ */

/**
 * Retourne les règles de restriction actives pour un niveau de quête donné.
 * Ces règles reflètent fidèlement la structure des quêtes officielles MH Wilds.
 *
 * Restrictions de grade (global) :
 *   ★1–8  → grades 1 à 5 tous disponibles
 *   ★9    → grade minimum 3 (grades 1–2 absents des données officielles)
 *   ★10   → grade 5 uniquement (seul grade présent dans les données officielles)
 *
 * Restrictions de variant (par monstre) :
 *   Alpha         → requiert quête ≥ 5★ ET grade ≥ 3
 *   Alpha Suprême → requiert quête ≥ 8★ ET grade = 5
 *
 * @param {number} questLevel - Niveau de la quête (1–10).
 * @returns {{ minGrade, alphaMinQuestLevel, alphaMinGrade, supremeMinQuestLevel, supremeMinGrade }}
 */
function getQuestRestrictions(questLevel) {
    return {
        minGrade:             questLevel >= 10 ? 5 : questLevel >= 9 ? 3 : 1,
        alphaMinQuestLevel:   5,
        alphaMinGrade:        3,
        supremeMinQuestLevel: 8,
        supremeMinGrade:      5
    };
}

/**
 * Indique si le variant Alpha est autorisé pour la combinaison donnée.
 * @param {number} questLevel
 * @param {number} grade
 */
function isAlphaAllowed(questLevel, grade) {
    const r = getQuestRestrictions(questLevel);
    return questLevel >= r.alphaMinQuestLevel && grade >= r.alphaMinGrade;
}

/**
 * Indique si le variant Alpha Suprême est autorisé pour la combinaison donnée.
 * @param {number} questLevel
 * @param {number} grade
 */
function isSupremeAllowed(questLevel, grade) {
    const r = getQuestRestrictions(questLevel);
    return questLevel >= r.supremeMinQuestLevel && grade >= r.supremeMinGrade;
}

/**
 * Construit le message HTML du panneau de restrictions pour l'affichage dans l'UI.
 * @param {number} questLevel
 * @param {number} grade
 * @returns {string} HTML du panneau, ou chaîne vide si aucune restriction active.
 */
function buildRestrictionsHTML(questLevel, grade) {
    const items = [];
    const r = getQuestRestrictions(questLevel);

    // Restrictions de grade
    if (questLevel >= 10) {
        items.push({ type: 'block', text: 'Grade 5 obligatoire en quête ★10' });
    } else if (questLevel >= 9) {
        items.push({ type: 'block', text: 'Grades 1 et 2 indisponibles en quête ★9' });
    }

    // Restrictions Alpha
    if (questLevel < r.alphaMinQuestLevel) {
        items.push({ type: 'block', text: 'Alpha indisponible — requiert une quête ★5 minimum' });
    } else if (grade < r.alphaMinGrade) {
        items.push({ type: 'block', text: 'Alpha indisponible — requiert le grade 3 minimum' });
    } else {
        items.push({ type: 'ok', text: 'Alpha disponible ✓' });
    }

    // Restrictions Alpha Suprême
    if (questLevel < r.supremeMinQuestLevel) {
        items.push({ type: 'block', text: 'Alpha Suprême indisponible — requiert une quête ★8 minimum' });
    } else if (grade < r.supremeMinGrade) {
        items.push({ type: 'block', text: 'Alpha Suprême indisponible — requiert le grade 5' });
    } else {
        items.push({ type: 'ok', text: 'Alpha Suprême disponible ✓' });
    }

    const hasBlocks = items.some(i => i.type === 'block');
    if (!hasBlocks && items.every(i => i.type === 'ok')) return '';

    const html = items.map(i => {
        if (i.type === 'block') return `<li class="restr-block">⛔ ${i.text}</li>`;
        return `<li class="restr-ok">✅ ${i.text}</li>`;
    }).join('');

    return `<ul class="restr-list">${html}</ul>`;
}


/* ── Table complète des GUIDs de difficulté ───────────────── */

/**
 * Table exhaustive des instanceGuid extraits des fichiers officiels du jeu.
 * 182 entrées couvrant les 10 rangs de récompense × 5 grades × 3 variants.
 *
 * Logique de sélection des GUIDs :
 *   - Normal    → dying=28 (rangs 1–3) ou dying=23 (rangs 4–8) ou dying=15 (rang 9) ou dying=12 (rang 10)
 *   - Alpha     → dying=17 (rangs 6–7) ou dying=18 (rang 8) ou atk renforcée (rang 9) — fallback=normal si absent
 *   - Suprême   → dying=13 (rangs 8–9) ou dying=12 hp+ (rang 10)   — fallback=alpha si absent
 *
 * Grades manquants dans les données officielles :
 *   - Rang 9 grades 1–2 → fallback grade 3 (logique, bloqué par getQuestRestrictions)
 *   - Rang 10 grades 1–4 → fallback grade 5 (idem, bloqué par restriction)
 *
 * @type {Object.<string, Object.<number, {normal:string, alpha:string, supreme:string}>>}
 */
const DIFFICULTY_TABLE = {
    "1": {
        1: { normal: "8749a106-3696-4bba-a267-ec0814c4ee46", alpha: "8749a106-3696-4bba-a267-ec0814c4ee46", supreme: "8749a106-3696-4bba-a267-ec0814c4ee46" },
        2: { normal: "4287dc88-acce-49d0-8e00-12cfadee4cca", alpha: "4287dc88-acce-49d0-8e00-12cfadee4cca", supreme: "4287dc88-acce-49d0-8e00-12cfadee4cca" },
        3: { normal: "e2dc622b-6851-4051-9a29-ea6c0af64afa", alpha: "e2dc622b-6851-4051-9a29-ea6c0af64afa", supreme: "e2dc622b-6851-4051-9a29-ea6c0af64afa" },
        4: { normal: "1384437b-9627-4234-9072-a9f2396386cb", alpha: "1384437b-9627-4234-9072-a9f2396386cb", supreme: "1384437b-9627-4234-9072-a9f2396386cb" },
        5: { normal: "560f97b6-a408-4c42-ad70-f410a0b7f83c", alpha: "560f97b6-a408-4c42-ad70-f410a0b7f83c", supreme: "560f97b6-a408-4c42-ad70-f410a0b7f83c" }
    },
    "2": {
        1: { normal: "512cefb4-eba1-4e21-a0d5-5486b924fcf7", alpha: "512cefb4-eba1-4e21-a0d5-5486b924fcf7", supreme: "512cefb4-eba1-4e21-a0d5-5486b924fcf7" },
        2: { normal: "6ab722c0-eadf-4380-a0d6-e040082910de", alpha: "6ab722c0-eadf-4380-a0d6-e040082910de", supreme: "6ab722c0-eadf-4380-a0d6-e040082910de" },
        3: { normal: "e7504b4e-9b0d-4cc7-918e-c66abf352fcb", alpha: "e7504b4e-9b0d-4cc7-918e-c66abf352fcb", supreme: "e7504b4e-9b0d-4cc7-918e-c66abf352fcb" },
        4: { normal: "43b56a3d-2dec-464b-8dff-63d973dbcecc", alpha: "43b56a3d-2dec-464b-8dff-63d973dbcecc", supreme: "43b56a3d-2dec-464b-8dff-63d973dbcecc" },
        5: { normal: "ab8dceaf-a84c-48d3-a68a-9301b6b9b12b", alpha: "ab8dceaf-a84c-48d3-a68a-9301b6b9b12b", supreme: "ab8dceaf-a84c-48d3-a68a-9301b6b9b12b" }
    },
    "3": {
        1: { normal: "844bfce6-3663-4c5c-9460-6b4c4c4c7a1a", alpha: "844bfce6-3663-4c5c-9460-6b4c4c4c7a1a", supreme: "844bfce6-3663-4c5c-9460-6b4c4c4c7a1a" },
        2: { normal: "eab95bfa-10a1-4912-8e3e-1ac85c15d870", alpha: "eab95bfa-10a1-4912-8e3e-1ac85c15d870", supreme: "eab95bfa-10a1-4912-8e3e-1ac85c15d870" },
        3: { normal: "987044cd-0624-4665-a490-b6bb969ec89a", alpha: "987044cd-0624-4665-a490-b6bb969ec89a", supreme: "987044cd-0624-4665-a490-b6bb969ec89a" },
        4: { normal: "b5da9c7e-36e0-4487-8b77-e66bf72609b9", alpha: "b5da9c7e-36e0-4487-8b77-e66bf72609b9", supreme: "b5da9c7e-36e0-4487-8b77-e66bf72609b9" },
        5: { normal: "dfe07421-aa0d-4cc6-8358-9f59674d414d", alpha: "dfe07421-aa0d-4cc6-8358-9f59674d414d", supreme: "dfe07421-aa0d-4cc6-8358-9f59674d414d" }
    },
    "4": {
        1: { normal: "e4cb18b4-dedd-4b8b-9737-be9d882d31d6", alpha: "e4cb18b4-dedd-4b8b-9737-be9d882d31d6", supreme: "e4cb18b4-dedd-4b8b-9737-be9d882d31d6" },
        2: { normal: "b13f1838-fade-498c-ae0c-005acf618a73", alpha: "b13f1838-fade-498c-ae0c-005acf618a73", supreme: "b13f1838-fade-498c-ae0c-005acf618a73" },
        3: { normal: "8ac996e9-cd2a-4c72-8bbc-e42cfa8df67b", alpha: "8ac996e9-cd2a-4c72-8bbc-e42cfa8df67b", supreme: "8ac996e9-cd2a-4c72-8bbc-e42cfa8df67b" },
        4: { normal: "72dc9845-7063-4066-af98-7d80ff46ceb6", alpha: "72dc9845-7063-4066-af98-7d80ff46ceb6", supreme: "72dc9845-7063-4066-af98-7d80ff46ceb6" },
        5: { normal: "2fbc2268-808d-466e-9ccd-40d796a62635", alpha: "2fbc2268-808d-466e-9ccd-40d796a62635", supreme: "2fbc2268-808d-466e-9ccd-40d796a62635" }
    },
    "5": {
        // Rang 5 : pas de GUID alpha dédié (dying=17 absent) → alpha = même GUID que normal
        // L'aura alpha est portée uniquement par le flag variant TEMPERED
        1: { normal: "6f969570-6e32-4caa-9ae0-b3fa7c131975", alpha: "6f969570-6e32-4caa-9ae0-b3fa7c131975", supreme: "6f969570-6e32-4caa-9ae0-b3fa7c131975" },
        2: { normal: "d9e307a4-8be2-428b-9533-533e43737134", alpha: "d9e307a4-8be2-428b-9533-533e43737134", supreme: "d9e307a4-8be2-428b-9533-533e43737134" },
        3: { normal: "d320da89-0663-4541-bbb5-8542f4d307f6", alpha: "d320da89-0663-4541-bbb5-8542f4d307f6", supreme: "d320da89-0663-4541-bbb5-8542f4d307f6" },
        4: { normal: "6178728a-23ed-4456-97d2-9e5d173dd1f7", alpha: "6178728a-23ed-4456-97d2-9e5d173dd1f7", supreme: "6178728a-23ed-4456-97d2-9e5d173dd1f7" },
        5: { normal: "f5332191-0ae8-4a76-9f31-e61b5048e22d", alpha: "f5332191-0ae8-4a76-9f31-e61b5048e22d", supreme: "f5332191-0ae8-4a76-9f31-e61b5048e22d" }
    },
    "6": {
        // dying=23 → normal | dying=17 → alpha | pas de suprême (restriction ★8)
        // Grades 1–2 : pas d'entrée dying=17 → alpha = normal
        1: { normal: "be8cbfe8-acd9-487c-91f1-353ea3928ef2", alpha: "be8cbfe8-acd9-487c-91f1-353ea3928ef2", supreme: "be8cbfe8-acd9-487c-91f1-353ea3928ef2" },
        2: { normal: "3809f0fa-a5b1-4a0d-8db7-aa4381c4ff2d", alpha: "3809f0fa-a5b1-4a0d-8db7-aa4381c4ff2d", supreme: "3809f0fa-a5b1-4a0d-8db7-aa4381c4ff2d" },
        3: { normal: "0e9c0fff-7aa6-4087-925c-501a900f602b", alpha: "38308372-4fc3-49d4-929a-676f7fe2565f", supreme: "38308372-4fc3-49d4-929a-676f7fe2565f" },
        4: { normal: "5998e97c-7f3a-41fa-8122-650e9351c250", alpha: "70397745-7632-471b-8f0e-41c271d5ef47", supreme: "70397745-7632-471b-8f0e-41c271d5ef47" },
        5: { normal: "776ba34f-17a9-4d4c-9794-a11918d0dc00", alpha: "a325aaaf-a1aa-4911-88a9-4285a73ed0db", supreme: "a325aaaf-a1aa-4911-88a9-4285a73ed0db" }
    },
    "7": {
        // dying=23 → normal | dying=17 → alpha | pas de suprême (restriction ★8)
        // Grades 1–2 : pas d'entrée dying=17 → alpha = normal
        1: { normal: "49f8e6c1-e77f-4ec3-ae2f-e0253a244bd3", alpha: "49f8e6c1-e77f-4ec3-ae2f-e0253a244bd3", supreme: "49f8e6c1-e77f-4ec3-ae2f-e0253a244bd3" },
        2: { normal: "7f8246d1-88b0-41d8-b993-92cdd0371712", alpha: "7f8246d1-88b0-41d8-b993-92cdd0371712", supreme: "7f8246d1-88b0-41d8-b993-92cdd0371712" },
        3: { normal: "80e64c45-1926-4659-a954-9654a488f2f0", alpha: "681788c2-129c-4305-b054-360c74033bf5", supreme: "681788c2-129c-4305-b054-360c74033bf5" },
        4: { normal: "d98b7732-2063-4582-b884-bb2287600dfd", alpha: "672504b4-7a87-45c3-b199-90d3eb37d393", supreme: "672504b4-7a87-45c3-b199-90d3eb37d393" },
        5: { normal: "f3e5ded8-fe74-4334-b582-9142e511c180", alpha: "d6c1670c-ecbb-4c5d-95e7-33c2c320800b", supreme: "d6c1670c-ecbb-4c5d-95e7-33c2c320800b" }
    },
    "8": {
        // dying=23 → normal | dying=18 → alpha | dying=13 → suprême
        // Grades 1–2 : pas de dying=18/13 → alpha = supreme = normal
        1: { normal: "b592f809-84f1-44a9-a788-3302fdf24b9e", alpha: "b592f809-84f1-44a9-a788-3302fdf24b9e", supreme: "b592f809-84f1-44a9-a788-3302fdf24b9e" },
        2: { normal: "703e1672-832a-4ef8-871d-e139d9f63734", alpha: "703e1672-832a-4ef8-871d-e139d9f63734", supreme: "703e1672-832a-4ef8-871d-e139d9f63734" },
        3: { normal: "ccaf8a5e-5842-4316-b328-5ad826629f42", alpha: "f6554537-09bf-4911-8139-ce95843973fc", supreme: "a7238a40-6595-4b05-8f5a-3f0114e1c0f7" },
        4: { normal: "e40ac53b-c101-4c04-8981-bbceb6d806ff", alpha: "0ea0c910-1d08-44b2-970a-13c4d997e378", supreme: "2d410590-46af-48dc-b99b-8c0edaeed0d8" },
        5: { normal: "e889e55e-cea7-4764-ae73-408ba124212c", alpha: "3ba88339-3d81-4ae6-85e0-dafa2af189f8", supreme: "f25965da-30b5-42de-993b-d4d140986726" }
    },
    "9": {
        // Grades 1–2 absents des données → fallback grade 3 (bloqués par restriction)
        // dying=15 → normal/alpha différenciés par attack | dying=13 → suprême (grade 3 et 5)
        1: { normal: "d6e4e648-df88-4bd1-874f-d1997cf96b22", alpha: "323f25ba-425d-430a-8734-2de5e98f2d43", supreme: "b3a5ca9d-ba99-4771-9974-a7471f706d6b" },
        2: { normal: "d6e4e648-df88-4bd1-874f-d1997cf96b22", alpha: "323f25ba-425d-430a-8734-2de5e98f2d43", supreme: "b3a5ca9d-ba99-4771-9974-a7471f706d6b" },
        3: { normal: "d6e4e648-df88-4bd1-874f-d1997cf96b22", alpha: "323f25ba-425d-430a-8734-2de5e98f2d43", supreme: "b3a5ca9d-ba99-4771-9974-a7471f706d6b" },
        4: { normal: "ac25e176-a1e8-4872-b34f-2e2b7a230f5c", alpha: "591e8610-e43f-4078-9608-6c5ff6540003", supreme: "591e8610-e43f-4078-9608-6c5ff6540003" },
        5: { normal: "aa92e87f-9a58-4a8f-8613-c00ddb9e763a", alpha: "f909927b-cb28-4874-b03c-4a72ff88399b", supreme: "f909927b-cb28-4874-b03c-4a72ff88399b" }
    },
    "10": {
        // Grade 5 uniquement dans les données → grades 1–4 fallback sur grade 5 (bloqués par restriction)
        // dying=12 — différencié par HP : 7.30 (normal) | 10.90 (alpha) | 12.15 (suprême)
        1: { normal: "5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50", alpha: "d5826b15-4244-4e85-bbd9-d2f44b8a4f7a", supreme: "92666b5d-ef17-4e5c-90d5-a07e97ee57ac" },
        2: { normal: "5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50", alpha: "d5826b15-4244-4e85-bbd9-d2f44b8a4f7a", supreme: "92666b5d-ef17-4e5c-90d5-a07e97ee57ac" },
        3: { normal: "5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50", alpha: "d5826b15-4244-4e85-bbd9-d2f44b8a4f7a", supreme: "92666b5d-ef17-4e5c-90d5-a07e97ee57ac" },
        4: { normal: "5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50", alpha: "d5826b15-4244-4e85-bbd9-d2f44b8a4f7a", supreme: "92666b5d-ef17-4e5c-90d5-a07e97ee57ac" },
        5: { normal: "5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50", alpha: "d5826b15-4244-4e85-bbd9-d2f44b8a4f7a", supreme: "92666b5d-ef17-4e5c-90d5-a07e97ee57ac" }
    }
};

/**
 * Retourne le _DifficultyRankId complet pour un monstre donné.
 * Utilise la table DIFFICULTY_TABLE avec fallbacks sécurisés.
 *
 * @param {number} questLevel - Niveau de la quête (1–10).
 * @param {number} grade      - Grade du monstre (1–5), lu depuis le sélecteur global.
 * @param {string} variant    - Variante : 'NONE', 'TEMPERED' (Alpha), 'ARCH_TEMPERED' (Suprême).
 * @returns {{ Name: string, Value: string }}
 */
function getDifficultyRankId(questLevel, grade, variant) {
    const rankKey  = String(Math.min(10, Math.max(1, questLevel)));
    const gradeKey = Math.min(5, Math.max(1, grade));

    const rankEntry  = DIFFICULTY_TABLE[rankKey] ?? DIFFICULTY_TABLE["8"];
    const gradeEntry = rankEntry[gradeKey] ?? rankEntry[3] ?? Object.values(rankEntry)[0];

    let variantKey;
    if (variant === 'ARCH_TEMPERED') {
        variantKey = isSupremeAllowed(questLevel, grade) ? 'supreme' : 'normal';
    } else if (variant === 'TEMPERED') {
        variantKey = isAlphaAllowed(questLevel, grade) ? 'alpha' : 'normal';
    } else {
        variantKey = 'normal';
    }

    const uuid = gradeEntry[variantKey] ?? gradeEntry.normal;
    return { "Name": `★${questLevel}-${grade}`, "Value": uuid };
}



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

/* ── Utilitaire de saisie numérique entière ───────────────── */

/**
 * Assainit en temps réel un champ <input type="number"> pour n'accepter
 * que des entiers compris entre min et max inclus.
 * Appelé via l'événement oninput.
 * @param {HTMLInputElement} input - Le champ concerné.
 * @param {number} min             - Valeur minimale autorisée.
 * @param {number} max             - Valeur maximale autorisée.
 */
function sanitizeIntInput(input, min, max) {
    const raw = input.value;

    // Champ vide ou saisie en cours -> laisser l'utilisateur taper
    if (raw === '' || raw === '-') return;

    // Décimale détectée : tronquer immédiatement
    if (raw.includes('.') || raw.includes(',')) {
        const trunc = Math.trunc(parseFloat(raw.replace(',', '.')));
        input.value = isNaN(trunc) ? min : Math.min(max, Math.max(min, trunc));
        return;
    }

    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) return;

    // Clamp uniquement si la valeur dépasse les bornes
    if (parsed > max) input.value = max;
    else if (parsed < min) input.value = min;
}


/* ── Récupération de la version ───────────────────────────── */

/**
 * Récupère la version de l'outil depuis api.php et l'affiche
 * dans l'élément #footer-version.
 */
async function fetchVersion() {
    const el = document.getElementById('footer-version');
    if (!el) return;
    try {
        const res  = await fetch('partage/api.php?action=version');
        const data = await res.json();
        if (data.version) {
            el.innerHTML = `<a href="https://git.crystalyx.net/Esenjin_Asakha/WildsQuetesPerso/releases" target="_blank" rel="noopener">v${data.version} — ${data.name}</a>`;
        }
    } catch {
        // Silencieux : le footer reste vide si l'API est inaccessible
    }
}
