/* ============================================================
   submit.js – Soumission en deux temps
   Étape 1 : analyse progressive du ZIP avec checklist visuelle
   Étape 2 : envoi après validation complète
   ============================================================ */

/* ── Constantes du générateur (cohérentes avec app.js) ─────── */

/** Zones de spawn autorisées par région (null = zone fixe). */
const GEN_LOCATION_SPAWN_ZONES = {
    "-1226157568": [8, 13, 17],   // Plaines venteuses
    "-859829056":  [6, 12, 15],   // Forêt écarlate
    "-1251081216": [2, 9, 15],    // Bassin pétrolier
    "1182228864":  [3, 8, 12],    // Falaises de glace
    "327401792":   [2, 5, 12],    // Ruines de Wyveria
    "1181994624":  null,          // Vallon meurtri (zone fixe 2)
    "544388992":   null,           // Cimes gelées (zone fixe 255)
    "905584064":   null            // Torche Draconique (zone fixe 255)
};

/** Zone fixe par région à zone fixe. */
const GEN_FIXED_ZONES = {
    "1181994624": 2,   // Vallon meurtri
    "544388992":  255, // Cimes gelées
    "905584064":  255  // Torche Draconique
};

/** Noms lisibles des régions. */
const GEN_ZONE_NAMES = {
    "-1226157568": "Plaines venteuses",
    "-859829056":  "Forêt écarlate",
    "-1251081216": "Bassin pétrolier",
    "1182228864":  "Falaises de glace",
    "327401792":   "Ruines de Wyveria",
    "1181994624":  "Vallon meurtri",
    "544388992":   "Cimes gelées",
    "905584064":   "Torche Draconique"
};

/** Configuration par niveau de quête (money, hrPoints, rewardId, orderHR min). */
const GEN_LEVEL_CONFIGS = {
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

/** Plages autorisées par le générateur (indépendantes du niveau). */
const GEN_RANGES = {
    timeLimit:  { min: 5,  max: 500  },
    questLife:  { min: 1,  max: 99   },
    maxPlayers: { min: 1,  max: 4   },
    minRC:      { min: 1,  max: 999 },
    money:      { min: 1000,  max: 10000000 },
    hrPoints:   { min: 100,  max: 25000  },
};

/** RewardIds valides produits par le générateur. */
const GEN_VALID_REWARD_IDS = new Set([201, 301, 450, 520, 620, 630]);

/**
 * Retourne les restrictions de grade/variant pour un niveau de quête.
 * Miroir exact de getQuestRestrictions() dans app.js.
 */
function genGetQuestRestrictions(questLevel) {
    return {
        minGrade:             questLevel >= 10 ? 5 : questLevel >= 9 ? 3 : 1,
        alphaMinQuestLevel:   5,
        alphaMinGrade:        3,
        supremeMinQuestLevel: 8,
        supremeMinGrade:      5
    };
}

/**
 * Retourne true si le grade est cohérent avec le niveau de quête.
 * Miroir exact des restrictions de app.js.
 */
function genIsGradeAllowed(questLevel, grade) {
    const r = genGetQuestRestrictions(questLevel);
    return grade >= r.minGrade;
}

/**
 * Retourne true si le variant alpha est autorisé pour ce niveau/grade.
 */
function genIsAlphaAllowed(questLevel, grade) {
    const r = genGetQuestRestrictions(questLevel);
    return questLevel >= r.alphaMinQuestLevel && grade >= r.alphaMinGrade;
}

/**
 * Retourne true si le variant suprême est autorisé pour ce niveau/grade.
 */
function genIsSupremeAllowed(questLevel, grade) {
    const r = genGetQuestRestrictions(questLevel);
    return questLevel >= r.supremeMinQuestLevel && grade >= r.supremeMinGrade;
}

/**
 * Résout le grade (1–5) depuis le champ _DifficultyRankId d'un monstre.
 * Lit le champ Name au format "★N-G", fallback 3.
 */
function resolveGradeFromDiffRankId(diffRankId) {
    const name = diffRankId?.Name ?? diffRankId?.name ?? '';
    const m = name.match(/★\d+-(\d+)/);
    return m ? parseInt(m[1]) : 3;
}

/**
 * Valeurs par défaut produites par le générateur pour les champs non-modifiables.
 * Utilisées pour détecter les modifications non autorisées.
 */
const GEN_FIXED_VALUES = {
    // StreamQuestData — météo / temps
    _IsFixWorldTime:       false,
    _IsFixWorldTimeQuest:  false,
    _IsSetWorldTime:       false,
    _IsSetWorldTimeQuest:  true,
    _IsStopTimeTiming:     false,
    _IsStopTimeTimingQuest: false,
    _WorldTimeHour:        0,
    _WorldTimeMinute:      0,
    _WorldTimeMinuteQuest: 0,
    // Lune
    _IsSetMoon: false,
    // Taille monstre
    _IsUseRandomSize: false,
    _FixedSize:       100,
    // ZakoLayoutID (petits monstres) — doit être UUID null pour zones ouvertes
    _ZakoLayoutID_null: "00000000-0000-0000-0000-000000000000",
    // AnimalLayoutID (petits monstres)
    _AnimalLayoutID_null: "00000000-0000-0000-0000-000000000000",
};

/* ─────────────────────────────────────────────────────────── */

let validatedFile     = null;
let validatedId       = null;
/** Avertissements collectés lors de l'analyse (non-bloquants). */
let collectedWarnings = [];

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
    validatedFile     = null;
    validatedId       = null;
    collectedWarnings = [];
    resetStep2();
    hideChecklist(); // reset visuel

    document.getElementById('dropzoneName').textContent = file.name;
    showChecklist();

    // Initialiser tous les items à "en cours"
    const checks = [
        'format','size','zip','json','id','title',
        'monsters','zones','rewards','values','duplicate','warnings'
    ];
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
    let enemies = null;
    try {
        enemies = await loadEnemies();
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

    /* ── 7b. Zones de spawn ─────────────────────────────────── */
    await delay(80);
    {
        const stageVal = String(raw._DataList?._Stage?._Value ?? '');
        const allowedZones = GEN_LOCATION_SPAWN_ZONES[stageVal];
        const fixedZone    = GEN_FIXED_ZONES[stageVal];
        const zoneName     = GEN_ZONE_NAMES[stageVal] ?? stageVal;
        const zoneErrors   = [];

        // Déterminer si c'est un mode séquentiel arène
        const bossRushParams = raw._DataList?._BossRushParams ?? [];
        const isSequential   = Array.isArray(bossRushParams) &&
            bossRushParams.some(p => (p._PopType ?? -1) === 2);

        targets.forEach((t, idx) => {
            const setArea = t._SetAreaNo;
            if (setArea === undefined || setArea === null) return;

            if (fixedZone !== undefined) {
                // Zone fixe (Vallon meurtri / Cimes gelées)
                // En mode séquentiel on tolère les zones spéciales (2, 3, 255)
                if (!isSequential && setArea !== fixedZone) {
                    zoneErrors.push(`Monstre ${idx + 1} : zone de spawn ${setArea} invalide pour ${zoneName} (zone fixe attendue : ${fixedZone})`);
                }
            } else if (allowedZones !== undefined) {
                // Zones ouvertes — valider uniquement les zones connues
                if (!allowedZones.includes(setArea) && stageVal !== '') {
                    zoneErrors.push(`Monstre ${idx + 1} : zone de spawn ${setArea} non autorisée pour ${zoneName} (zones valides : ${allowedZones.join(', ')})`);
                }
            } else if (stageVal !== '') {
                // Région inconnue
                zoneErrors.push(`Région inconnue (${stageVal}) — impossible de vérifier les zones`);
            }
        });

        if (zoneErrors.length) {
            setCheck('zones', 'error', 'Zones de spawn', zoneErrors[0] + (zoneErrors.length > 1 ? ` (+ ${zoneErrors.length - 1} autre(s))` : ''));
            // Afficher tous les détails dans la console pour le débogage
            zoneErrors.forEach(e => console.warn('[Zones]', e));
            return; // bloquant
        }
        setCheck('zones', 'ok', 'Zones de spawn', 'Zones de spawn valides ✓');
    }

    /* ── 8. Récompenses ────────────────────────────────────── */
    await delay(80);
    const rewards = ext?.rewardItems ?? [];
    if (!rewards.length) {
        return setCheck('rewards', 'error', 'Récompenses', 'rewardItems vide dans le .ext.json');
    }
    setCheck('rewards', 'ok', 'Récompenses', `${rewards.length} récompense(s) ✓`);

    /* ── 8b. Valeurs hors plage générateur ─────────────────── */
    await delay(80);
    {
        const data      = raw._DataList ?? {};
        const questLevel = parseInt(data._QuestLv ?? 8);
        const levelConf  = GEN_LEVEL_CONFIGS[questLevel] ?? GEN_LEVEL_CONFIGS[8];
        const valueErrors = [];

        // Limite de temps
        const timeLimit = parseInt(data._TimeLimit ?? 0);
        if (timeLimit < GEN_RANGES.timeLimit.min || timeLimit > GEN_RANGES.timeLimit.max) {
            valueErrors.push(`Limite de temps ${timeLimit} hors plage [${GEN_RANGES.timeLimit.min}–${GEN_RANGES.timeLimit.max}]`);
        }

        // Vies
        const questLife = parseInt(data._QuestLife ?? 0);
        if (questLife < GEN_RANGES.questLife.min || questLife > GEN_RANGES.questLife.max) {
            valueErrors.push(`Morts autorisées ${questLife} hors plage [${GEN_RANGES.questLife.min}–${GEN_RANGES.questLife.max}]`);
        }

        // Joueurs max
        const maxPlayers = parseInt(data._OrderCondition?._MaxPlayerNum ?? 4);
        if (maxPlayers < GEN_RANGES.maxPlayers.min || maxPlayers > GEN_RANGES.maxPlayers.max) {
            valueErrors.push(`Nombre de joueurs max ${maxPlayers} hors plage [${GEN_RANGES.maxPlayers.min}–${GEN_RANGES.maxPlayers.max}]`);
        }

        // RC minimum
        const minRC = parseInt(data._OrderCondition?._OrderHR ?? 0);
        if (minRC < GEN_RANGES.minRC.min || minRC > GEN_RANGES.minRC.max) {
            valueErrors.push(`RC minimum ${minRC} hors plage [${GEN_RANGES.minRC.min}–${GEN_RANGES.minRC.max}]`);
        }

        // Zenny (tolérance large — le générateur propose des valeurs conseillées)
        const money = parseInt(data._RemMoney ?? 0);
        if (money < GEN_RANGES.money.min || money > GEN_RANGES.money.max) {
            valueErrors.push(`Récompense zenny ${money} hors plage [${GEN_RANGES.money.min}–${GEN_RANGES.money.max}]`);
        }

        // Points HR
        const hrPoints = parseInt(data._HRPoint ?? 0);
        if (hrPoints < GEN_RANGES.hrPoints.min || hrPoints > GEN_RANGES.hrPoints.max) {
            valueErrors.push(`Points HR ${hrPoints} hors plage [${GEN_RANGES.hrPoints.min}–${GEN_RANGES.hrPoints.max}]`);
        }

        // rewardId — doit faire partie des valeurs produites par le générateur
        const rewardId = ext?.rewardId;
        if (rewardId !== undefined && !GEN_VALID_REWARD_IDS.has(parseInt(rewardId))) {
            valueErrors.push(`rewardId ${rewardId} non reconnu (valeurs attendues : ${[...GEN_VALID_REWARD_IDS].join(', ')})`);
        }

        if (valueErrors.length) {
            setCheck('values', 'error', 'Valeurs hors plage', valueErrors[0] + (valueErrors.length > 1 ? ` (+ ${valueErrors.length - 1} autre(s))` : ''));
            valueErrors.slice(1).forEach(e => console.warn('[Valeurs]', e));
            return; // bloquant
        }
        setCheck('values', 'ok', 'Valeurs dans les plages autorisées', '✓');
    }

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

    /* ── 10. Avertissements non-bloquants ──────────────────── */
    await delay(80);
    {
        const data        = raw._DataList ?? {};
        const questLevel  = parseInt(data._QuestLv ?? 8);
        const stageVal    = String(raw._DataList?._Stage?._Value ?? '');
        const bossRushParams = data._BossRushParams ?? [];
        const isSequential   = Array.isArray(bossRushParams) &&
            bossRushParams.some(p => (p._PopType ?? -1) === 2);
        const warnings = [];

        // ── Incohérence difficulté / grade des monstres ──────
        targets.forEach((t, idx) => {
            const grade   = resolveGradeFromDiffRankId(t._DifficultyRankId);
            const variant = t._LegendaryID ?? 'NONE';

            if (!genIsGradeAllowed(questLevel, grade)) {
                const r = genGetQuestRestrictions(questLevel);
                warnings.push(`Monstre ${idx + 1} — grade G${grade} incompatible avec une quête ★${questLevel} (grade minimum : G${r.minGrade})`);
            }
            if (variant === 'TEMPERED' && !genIsAlphaAllowed(questLevel, grade)) {
                warnings.push(`Monstre ${idx + 1} — variant Alpha (Trempé) incompatible avec ★${questLevel} G${grade} (requiert ★5+ et G3+)`);
            }
            if (variant === 'ARCH_TEMPERED' && !genIsSupremeAllowed(questLevel, grade)) {
                warnings.push(`Monstre ${idx + 1} — variant Alpha Suprême incompatible avec ★${questLevel} G${grade} (requiert ★8+ et G5)`);
            }
        });

        // ── Champs hors périmètre générateur ─────────────────
        const streamData = raw._StreamQuestData ?? {};

        // Météo / temps
        const envChecks = [
            ['_IsFixWorldTime',       streamData._IsFixWorldTime,       GEN_FIXED_VALUES._IsFixWorldTime,       'Temps fixe activé (_IsFixWorldTime)'],
            ['_IsFixWorldTimeQuest',  streamData._IsFixWorldTimeQuest,  GEN_FIXED_VALUES._IsFixWorldTimeQuest,  'Temps fixe de quête activé (_IsFixWorldTimeQuest)'],
            ['_IsSetWorldTime',       streamData._IsSetWorldTime,       GEN_FIXED_VALUES._IsSetWorldTime,       'Heure du monde forcée (_IsSetWorldTime)'],
            ['_IsStopTimeTiming',     streamData._IsStopTimeTiming,     GEN_FIXED_VALUES._IsStopTimeTiming,     'Arrêt de temps activé (_IsStopTimeTiming)'],
        ];
        for (const [, val, expected, label] of envChecks) {
            if (val !== undefined && val !== expected) {
                warnings.push(`Champ hors générateur — ${label}`);
            }
        }

        // Lune
        const moonData = streamData._SetMoonData ?? {};
        if (moonData._IsSetMoon === true) {
            warnings.push('Champ hors générateur — Lune personnalisée activée (_IsSetMoon)');
        }

        // Petits monstres (ZakoLayoutID)
        const zakoLayout = raw._BossZakoDataList?._ZakoLayoutID;
        if (zakoLayout && zakoLayout._ID && zakoLayout._ID !== GEN_FIXED_VALUES._ZakoLayoutID_null) {
            warnings.push('Champ hors générateur — Layout des petits monstres modifié (_ZakoLayoutID)');
        }

        // AnimalLayoutID
        const animalLayout = raw._BossZakoDataList?._AnimalLayoutID;
        if (animalLayout && animalLayout._ID && animalLayout._ID !== GEN_FIXED_VALUES._AnimalLayoutID_null) {
            warnings.push('Champ hors générateur — Layout des petits monstres modifié (_AnimalLayoutID)');
        }

        // Taille des monstres
        targets.forEach((t, idx) => {
            if (t._IsUseRandomSize === true) {
                warnings.push(`Monstre ${idx + 1} — taille aléatoire activée (_IsUseRandomSize), non proposée par le générateur`);
            }
            if (t._FixedSize !== undefined && t._FixedSize !== GEN_FIXED_VALUES._FixedSize) {
                warnings.push(`Monstre ${idx + 1} — taille fixe ${t._FixedSize} modifiée (valeur générateur : 100)`);
            }
        });

        // Stocker pour envoi à l'API
        collectedWarnings = warnings;

        if (warnings.length) {
            setCheck('warnings', 'warn', 'Avertissements', `${warnings.length} avertissement(s) — la quête peut quand même être soumise`);
            // Afficher le détail dans la checklist via un sous-élément
            const row = document.getElementById('chk-warnings');
            if (row) {
                const detailEl = row.querySelector('.chk-detail');
                if (detailEl) {
                    const ul = document.createElement('ul');
                    ul.style.cssText = 'margin:4px 0 0 0;padding-left:18px;font-size:.82em;color:var(--warn,#e6a817)';
                    warnings.forEach(w => {
                        const li = document.createElement('li');
                        li.textContent = w;
                        ul.appendChild(li);
                    });
                    detailEl.textContent = '';
                    detailEl.appendChild(ul);
                }
            }
        } else {
            setCheck('warnings', 'ok', 'Vérifications avancées', 'Aucun avertissement ✓');
        }
    }

    /* ── Tout bon ──────────────────────────────────────────── */
    validatedFile = file;
    validatedId   = questId;
    showStep2(title, questId, collectedWarnings);
}

/* ── Affichage étape 2 ───────────────────────────────────── */
function showStep2(title, questId, warnings = []) {
    const card   = document.getElementById('step2Card');
    const banner = document.getElementById('successBannerText');

    let bannerHtml = `Analyse réussie — <strong>${esc(title)}</strong> (ID #${questId}) prête à être soumise.`;
    if (warnings.length) {
        bannerHtml += ` <span style="color:var(--warn,#e6a817);font-weight:600">⚠ ${warnings.length} avertissement(s) seront transmis aux modérateurs.</span>`;
    }
    if (banner) banner.innerHTML = bannerHtml;
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
    // Transmettre les avertissements au serveur pour stockage dans le .meta.json
    if (collectedWarnings.length) {
        fd.append('warnings', JSON.stringify(collectedWarnings));
    }

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
    validatedFile     = null;
    validatedId       = null;
    collectedWarnings = [];
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
