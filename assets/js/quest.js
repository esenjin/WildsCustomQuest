/* ============================================================
   quest.js – Génération, résumé, export et import de quête
   ============================================================ */

/* ── Génération ───────────────────────────────────────────── */

/**
 * Génère les fichiers de quête (raw et ext) à partir des données du formulaire.
 * Met à jour le résumé et active le bouton de téléchargement en cas de succès.
 */
function generateQuest() {
    try {
        // ── Validation des pré-requis ───────────────────────
        if (selectedMonsters.length === 0) {
            showAlert("Veuillez sélectionner au moins un monstre");
            goToTab('monsters');
            return;
        }

        if (rewardItems.length === 0) {
            showAlert("Veuillez ajouter au moins un objet de récompense");
            goToTab('rewards');
            return;
        }

        // ── Lecture des champs du formulaire ────────────────
        const questIdEl          = document.getElementById('questId');
        const questTitleEl       = document.getElementById('questTitle');
        const questDescriptionEl = document.getElementById('questDescription');
        const questLevelEl       = document.getElementById('questLevel');
        const questLocationEl    = document.getElementById('questLocation');
        const timeLimitEl        = document.getElementById('timeLimit');
        const rewardMoneyEl      = document.getElementById('rewardMoney');
        const hrPointsEl         = document.getElementById('hrPoints');
        const questLifeEl        = document.getElementById('questLife');

        if (!questIdEl || !questTitleEl || !questDescriptionEl ||
            !questLevelEl || !questLocationEl || !timeLimitEl ||
            !rewardMoneyEl || !hrPointsEl) {
            showAlert("Certains éléments du formulaire sont manquants. Veuillez recharger la page.");
            return;
        }

        const questId       = parseInt(questIdEl.value) || 10086;
        const questTitleRaw  = questTitleEl.value || "Custom Quest";
        const isRedTitle     = document.getElementById('redTitle')?.checked ?? false;
        const questTitle     = isRedTitle
            ? `\u003cCOLOR preset="TXT_Danger"\u003e${questTitleRaw}\u003c/COLOR\u003e`
            : questTitleRaw;
        // Convertir les sauts de ligne en \r\n pour l'affichage en jeu dans la description
        const questDesc     = (questDescriptionEl.value || "A custom monster hunt").replace(/\r\n|\r|\n/g, '\r\n');
        const questClient   = document.getElementById('questClient')?.value || "Générateur de quêtes";
        const questLevel    = parseInt(questLevelEl.value) || 8;
        const questLocation = questLocationEl.value || "1181994624";
        const timeLimit     = parseInt(timeLimitEl.value) || 20;
        const rewardMoney   = parseInt(rewardMoneyEl.value) || 24000;
        const hrPoints      = parseInt(hrPointsEl.value) || 660;
        const questLife        = parseInt(questLifeEl?.value) || 2;
        const monsterDifficulty = parseInt(document.getElementById('monsterDifficulty')?.value ?? '3') || 3;
        const maxPlayers    = Math.min(4, Math.max(1, parseInt(document.getElementById('maxPlayers')?.value) || 4));

        // Heure & météo
        const worldTimeHourQuest = Math.min(23, Math.max(0, parseInt(document.getElementById('worldTimeHour')?.value ?? '18') || 0));
        const envTypeEl          = document.getElementById('envType');
        const envTypeValue       = parseInt(envTypeEl?.value ?? '1961958400');
        const envTypeName        = envTypeEl?.selectedOptions[0]?.dataset?.name ?? '荒廃期';
        const isFixEnv           = document.getElementById('isFixEnv')?.checked ?? false;

        // Configuration dépendante du niveau
        const levelConfig = getQuestLevelConfig(questLevel);
        const minRC       = Math.min(999, Math.max(1, parseInt(document.getElementById('minRC')?.value) || levelConfig.orderHR));

        // Option spécifique au Vallon meurtri : monstres séquentiels
        const isArena  = questLocation === '1181994624';
        const sequential = isArena && document.getElementById('sequentialMonsters')?.checked;

        // Développer la liste des monstres en tenant compte de la quantité choisie.
        // Ex. : un Rathalos ×3 devient trois entrées distinctes dans le tableau.
        const expandedMonsters = selectedMonsters.flatMap(m =>
            Array.from({ length: m.count || 1 }, () => ({ ...m }))
        );

        // ── Construction du fichier .raw.json ───────────────
        const rawData = {
            // Données d'arène : remplies uniquement pour le Vallon meurtri, null pour les zones ouvertes
            "_ArenaDataList": isArena ? {
                "_IsUserCamp": false,
                "_MissionID": null,
                "_SelectDatas": null,
                "_SelectNpcDatas": null,
                "_TimeRankA": null,
                "_TimeRankB": null,
                "_TimeRankS": null
            } : null,
            "_BossZakoDataList": {
                "_AnimalLayoutID": {
                    "_ID": "00000000-0000-0000-0000-000000000000",
                    "_Resource": null
                },
                "_FieldID": {
                    "_Name": getLocationName(questLocation),
                    "_Value": parseInt(questLocation)
                },
                "_MainTargetDataList": expandedMonsters.map((monster, index) => ({
                    "_AdvancedSettings": {
                        // En mode BossRush (séquentiel), les monstres ne dorment pas — gérés par _BossRushParams
                        "_IsDeepSleepCreate": false
                    },
                    // En mode séquentiel : monstre 0→zone 1 (actif), monstre 1→zone 255 (attente derrière porte), monstres 2+→zone 1 (inactifs via OptionTag=0)
                    // En mode normal : 255 pour tous
                    "_AreaNo": sequential ? (index === 1 ? 255 : 1) : 255,
                    "_DifficultyAdjustRange": 0,
                    "_DifficultyRankId": getDifficultyRankId(questLevel, monsterDifficulty, monster.variant),
                    "_EmID": monster.fixedId,
                    "_EventTargetID": "INVALID",
                    "_FixedSize": 100,
                    "_GroupID": 0,
                          // Position initiale : (0,0,0) pour toutes les zones (sauf Cimes gelées à (-529,87,701))
                    "_InitPos": (questLocation === '544388992') ? "(-529,87,701)" : "(0,0,0)",
                    "_IsUseRandomSize": false,
                    "_LayoutKeepID": -1,
                    // KING = Alpha Suprême, NORMAL = Alpha/Trempé, NONE = monstre standard
                    "_LegendaryID": monster.variant === 'ARCH_TEMPERED' ? "KING" : (monster.variant === 'TEMPERED' ? "NORMAL" : "NONE"),
                    "_OptionTag": {
                        // En mode séquentiel : le premier monstre a Value:1 (actif dès le début), les suivants 0
                        "Value": (sequential && index === 0) ? 1 : 0
                    },
                    // Table de taille aléatoire : toujours null UUID
                    "_RandomSizeTblId": {
                        "Name": "",
                        "Value": "00000000-0000-0000-0000-000000000000"
                    },
                    "_RoleID": "NORMAL",
                    // Routes prédéfinies de l'arène st401 (une par slot de monstre)
                    // En dehors de l'arène ou en mode non-séquentiel : UUID null
                    "_RouteID": (isArena && sequential)
                        ? { "Name": "", "_Value": [
                            "6935fb34-4ae2-4d4e-979a-b88b52c65a4e",
                            "3e8f391d-883d-434e-a262-9598d7cd27df",
                            "3e8f391d-883d-434e-a262-9598d7cd27df",
                            "20af651f-185d-4026-b73e-6da31b428bae",
                            "00b32f39-5c63-44b6-8f99-bd593e48a524"
                          ][Math.min(index, 4)] }
                        : { "Name": "", "_Value": "00000000-0000-0000-0000-000000000000" },
                    // Zone de spawn : en séquentiel arène → monstre 1 en zone 3 (attente porte), autres → 255
                    // En mode séquentiel arène non-0 : 255
                    // En mode normal : utilise la zone choisie par monstre (spawnZone), ou les défauts selon la région
                    "_SetAreaNo": sequential
                        ? (index === 1 ? 3 : 255)
                        : isArena ? 2 : (
                            monster.spawnZone !== undefined
                                ? monster.spawnZone
                                : (questLocation === '327401792' ? 15 : (questLocation === '544388992' ? 255 : 17))
                          ),
                    "_StoryTargetID": 101 + index
                })),
                // Layout du sous-boss : null en mode séquentiel, ressource spécifique en mode normal arène
                "_SubBossLayoutID": {
                    "_ID": (isArena && !sequential) ? "c8ed5a65-8c96-48cb-3a15eb556208668e" : "00000000-0000-0000-0000-000000000000",
                    "_Resource": (isArena && !sequential)
                        ? "assets:/GameDesign/Stage/st401/Layout/Loaded/Enemy/SubBoss/st401_SubBoss_Ms006025_00.pog.json"
                        : null
                },
                "_ZakoLayoutID": {
                    "_ID": "00000000-0000-0000-0000-000000000000",
                    "_Resource": null
                },
                "_ZakoLayoutTag": {
                    "_FieldID": {
                        // En mode séquentiel arène : INVALID
                        "_Name": (isArena && sequential) ? "INVALID" : getLocationName(questLocation),
                        "_Value": (isArena && sequential) ? 1044114240 : parseInt(questLocation)
                    },
                    // En mode séquentiel arène : true
                    "_IsIntentionallyBlank": (isArena && sequential) ? true : false,
                    // 0 = arène, 1 = zones ouvertes
                    "_Value": isArena ? 0 : 1
                }
            },
            "_DataList": {
                "_AddPoint": 198,
                "_ArenaFenceCloseTime": 60,
                "_ArenaFenceInitWaitTime": 60,
                "_ArenaFenceReuseableTime": 120,
                "_ArenaFenceStatus": "OPEN",
                "_ArenaPillarStatus": "USE",
                "_BattleBGM": 0,
                // En mode séquentiel (BossRush) : définit l'ordre et la condition d'apparition des monstres
                // _PopType 0 = spawn initial du premier monstre
                // _PopType 2 = spawn déclenché quand le monstre précédent est bas en vie (tête de mort)
                // _ConditionValue_1 = index du monstre qui déclenche le spawn suivant (0-based)
                // _ConditionValue_2 = 1 (activé)
                "_BossRushParams": sequential ? [
                    { "_PopType": 0, "_ConditionValue_1": -1, "_ConditionValue_2": -1 },
                    ...expandedMonsters.slice(1).map((_, i) => ({
                        "_PopType": 2,
                        "_ConditionValue_1": i,
                        "_ConditionValue_2": 1
                    }))
                ] : [],
                "_BossRushParams=": null,
                "_ClearBGM": 0,
                "_ClearCondition": {
                    // Un objectif par entrée dans la liste développée (respecte les doublons dus au count)
                    "_TargetInfoArray": expandedMonsters.map((monster, index) => ({
                        "_ConditionalMoveData": {
                            "_DestArray": null,
                            "_IsUse": false,
                            "_RevertOnCompleted": false,
                            "_StartAfterFirstCondition": false
                        },
                        "_EmTargetID": 101 + index,
                        // KING = Alpha Suprême, NORMAL = Alpha/Trempé, NONE = monstre standard
                    "_LegendaryID": monster.variant === 'ARCH_TEMPERED' ? "KING" : (monster.variant === 'TEMPERED' ? "NORMAL" : "NONE"),
                        "_RoleID": "NORMAL",
                        "_ShowTargetGuide": true,
                        "_TargetIDValue": monster.fixedId,
                        "_TargetValue": 1
                    })),
                    // _TargetType 2 = mode BossRush (séquentiel), 1 = mode normal
                    "_TargetType": sequential ? 2 : 1
                },
                "_EnableGuestNpc": false,
                "_ExOverrideID": 0,
                "_HRPoint": hrPoints,
                "_IconType": {
                    "_Name": "app.QuestDef.QUEST_ICON_TYPE_Fixed",
                    "_Value": 1927315328
                },
                "_Index": 0,
                "_IsOverrideArenaFenceParam": false,
                "_IsOverrideArenaPillarParam": false,
                "_IsSettingSupply": false,
                "_MissionId": {
                    "_Name": questTitle,
                    "_Value": questId
                },
                "_OrderCondition": {
                    "_MaxPlayerNum": maxPlayers,
                    "_OrderHR": minRC,
                    "_OrderMR": 0,
                    "_PremiseMission": {
                        "_Name": "前置任务ID",
                        "_Value": -282127296
                    }
                },
                "_PartnerNpc": {
                    "_Name": "無効値",
                    "_Value": 4
                },
                "_QuestAttribute": 0,
                "_QuestLife": questLife,
                "_QuestLv": questLevel,
                "_QuestMsg": {
                    "_ClearConditionMsg": {
                        "_IsAuto": true,
                        "_MsgID": "00000000-0000-0000-0000-000000000000"
                    },
                    "_ClientNameMsg": "9707f537-aadd-4e0e-983a-8ec7c72fc1fb",
                    "_DetailMsg": "b15f3acb-b6ca-4e18-968b-2a5161f9679f",
                    "_FailConditionMsg": {
                        "_IsAuto": true,
                        "_MsgIDs": [
                            "00000000-0000-0000-0000-000000000000",
                            "00000000-0000-0000-0000-000000000000"
                        ]
                    },
                    "_FailConditionMsg_Other": "1e801eb7-04d4-4ebe-9423-62e633c1b3ee",
                    "_OrderConditionMsg": {
                        "_IsAuto": true,
                        "_MsgIDs": [
                            "00000000-0000-0000-0000-000000000000",
                            "00000000-0000-0000-0000-000000000000"
                        ]
                    },
                    "_OrderConditionMsg_Other": "acbf575d-58a2-46a4-bd33-af9eb4d105be",
                    "_OrderConditionMsg_StProgress": "7d277c75-8e3e-4073-9351-072604943ce6",
                    "_TitleMsg": "ad16cdce-1ad5-4ba9-8ac2-4cee6dd52021"
                },
                // 6 = BossRush (séquentiel), 0 = normal (confirmé depuis les quêtes officielles)
                "_QuestType": sequential ? 6 : 0,
                "_RemMoney": rewardMoney,
                "_Stage": {
                    "_Name": getLocationName(questLocation),
                    "_Value": parseInt(questLocation)
                },
                "_SubBossInfoArray": [],
                "_SubBossInfoArray=": null,
                "_SupplyID": {
                    "_Name": "無効値",
                    "_Value": 1966686080
                },
                "_TimeLimit": timeLimit,
                "_Version": 1
            },
            "_IsRecommended": false,
            // Données de messages pour toutes les langues supportées
            "_MessageAssetList": [
                "ja-jp", "en-us", "fr-fr", "it-it", "de-de",
                "es-es", "es-la", "pt-br", "pl-pl", "ru-ru",
                "ko-kr", "zh-cn", "zh-tw", "ar-sa"
            ].map(lang => ({
                "Language": getLanguageCode(lang),
                "MessageData": [
                    { "Name": "Mission600016_000", "Text": "" },
                    { "Name": "Mission600016_001", "Text": "" },
                    { "Name": "Mission600016_100", "Text": questTitle },
                    { "Name": "Mission600016_101", "Text": questClient },
                    { "Name": "Mission600016_102", "Text": questDesc },
                    { "Name": "Mission600016_122", "Text": "" },
                    { "Name": "Mission600016_123", "Text": "" },
                    { "Name": "Mission600016_132", "Text": "" }
                ]
            })),
            "_StreamQuestData": {
                "_EmSetData": {
                    "_EmSet_AnimalTag": {
                        "_FieldID": {
                            "_Name": getLocationName(questLocation),
                            "_Value": parseInt(questLocation)
                        },
                        "_Value": 1
                    },
                    "_EmSet_BossZako": null,
                    "_Stage": {
                        "_Name": getLocationName(questLocation),
                        "_Value": parseInt(questLocation)
                    }
                },
                "_IsFixWorldTime": false,
                "_IsFixWorldTimeQuest": false,
                "_IsSetWorldTime": false,
                "_IsSetWorldTimeQuest": true,
                "_IsStopTimeTiming": false,
                "_IsStopTimeTimingQuest": false,
                "_MissionTypeSerial": {
                    "_Name": "活动任务类型",
                    "_Value": 1025928384
                },
                "_SetEnvironmentDataList": [
                    {
                        "_EnvTimeRate": 0,
                        "_EnvType": {
                            "_Name": envTypeName,
                            "_Value": envTypeValue
                        },
                        "_ForcastDatas": [],
                        "_IsFixEnv": isFixEnv,
                        "_IsTransitionEnv": false,
                        "_StageType": {
                            "_Name": getLocationName(questLocation),
                            "_Value": parseInt(questLocation)
                        },
                        "_StopTiming_EnvType": {
                            "_Name": "無効値",
                            "_Value": 2110947200
                        }
                    }
                ],
                "_SetLGuideMsgData": {
                    "IsSubOrder": false,
                    "SetMsgID": "00000000-0000-0000-0000-000000000000",
                    "gaugeSpritNum": 0,
                    "isCanSkip": false,
                    "isGauge": false
                },
                "_SetMoonData": {
                    "_IsSetMoon": false,
                    "_MoonOptionsVariationIndex": 0,
                    "_MoonSetting": {
                        "_Name": "無効値",
                        "_Value": -770399616
                    },
                    "_MoonTextureVariationIndex": 0
                },
                "_StopTimeTimingHour": 0,
                "_StopTimeTimingHourQuest": 0,
                "_StopTimeTimingMinute": 0,
                "_StopTimeTimingMinuteQuest": 0,
                "_WorldTimeHour": 0,
                "_WorldTimeHourQuest": worldTimeHourQuest,
                "_WorldTimeMinute": 0,
                "_WorldTimeMinuteQuest": 0
            }
        };

        // ── Construction du fichier .ext.json ───────────────
        const extData = {
            "questId": questId,
            "rewardId": levelConfig.rewardId,
            "rewardItems": rewardItems.map(item => ({
                "itemId":      item.itemId,
                "itemName":    item.itemName,
                "minCount":    item.minCount,
                "maxCount":    item.maxCount,
                "probability": item.probability
            }))
        };

        // ── Stockage et affichage ───────────────────────────
        questData.raw = rawData;
        questData.ext = extData;

        updateQuestSummary();

        const outputElement = document.getElementById('output');
        if (outputElement) {
            outputElement.textContent = JSON.stringify(questData, null, 4);
        }

        // Activer le bouton de téléchargement
        const downloadButton = document.getElementById('download-btn');
        if (downloadButton) downloadButton.disabled = false;

        showAlert("Quête générée avec succès !", "success");

    } catch (error) {
        console.error("Erreur lors de la génération de la quête :", error);
        showAlert("Erreur lors de la génération de la quête : " + error.message);
    }
}

/* ── Résumé ───────────────────────────────────────────────── */

/**
 * Met à jour le bloc de résumé HTML de la quête générée.
 * Affiche les principales informations (titre, monstres, récompenses, etc.).
 */
function updateQuestSummary() {
    try {
        if (!questData.raw || !questData.ext) return;

        const questSummary = document.getElementById('quest-summary');
        if (!questSummary) {
            console.error("Élément résumé de quête introuvable");
            return;
        }

        const quest   = questData.raw;
        const rewards = questData.ext.rewardItems;

        // ── Liste des monstres ciblés ───────────────────────
        let monstersList = '';
        quest._BossZakoDataList._MainTargetDataList.forEach(target => {
            const monster     = enemiesData.find(m => m.fixedId === target._EmID);
            const monsterName = monster && monster.name && monster.name[currentLanguage]
                ? monster.name[currentLanguage]
                : 'Monstre inconnu';
            const badge = target._LegendaryID === 'KING'
                ? '<span class="badge-arch-tempered">Alpha Suprême</span>'
                : target._LegendaryID === 'NORMAL'
                    ? '<span class="badge-alpha">Alpha</span>'
                    : '<span style="display:inline-block;font-size:0.7em;background:#2a2e3e;color:#888;border-radius:3px;padding:1px 5px;margin-left:5px;vertical-align:middle;font-weight:bold;">Standard</span>';
            const diffRankId = target._DifficultyRankId;
            const gradeMatch = diffRankId?.Name?.match(/★\d+-(\d+)/);
            const gradeNum   = gradeMatch ? parseInt(gradeMatch[1]) : null;
            const gradeTag   = gradeNum
                ? ` <span style="display:inline-block;font-size:0.7em;background:#1a1208;color:#c8902a;border:1px solid #6b4c10;border-radius:3px;padding:1px 5px;margin-left:4px;vertical-align:middle;">${'✦'.repeat(gradeNum)} G${gradeNum}</span>`
                : '';
            monstersList += `<li>${monsterName}${badge}${gradeTag} <span style="color:#888;font-size:0.85em">(${monster ? monster.label : 'Inconnu'})</span></li>`;
        });

        // ── Liste des récompenses ───────────────────────────
        let rewardsList = '';
        rewards.forEach(reward => {
            rewardsList += `<li>${reward.itemName} (x${reward.minCount}–${reward.maxCount}) — ${reward.probability}%</li>`;
        });

        // Récupérer les données de message dans la langue courante
        const msgEntry = quest._MessageAssetList.find(m => m.Language === getLanguageCode(currentLanguage));

        const html = `
            <h3>Résumé de la quête</h3>
            <div>
                <div><strong>Titre :</strong> ${msgEntry.MessageData[2].Text.replace(/<COLOR[^>]*>|<\/COLOR>/gi, '')}</div>
                <div><strong>Client :</strong> ${msgEntry.MessageData[3].Text}</div>
                <div><strong>ID :</strong> ${quest._DataList._MissionId._Value}</div>
                <div><strong>Niveau :</strong> ★${quest._DataList._QuestLv}</div>
                <div><strong>Grade des monstres :</strong> ${(() => {
                    const rankId = quest._BossZakoDataList._MainTargetDataList?.[0]?._DifficultyRankId;
                    const nameMatch = rankId?.Name?.match(/★\d+-(\d+)/);
                    const grade = nameMatch ? parseInt(nameMatch[1]) : 3;
                    const gradeStars = '✦'.repeat(grade);
                    const gradeLabels = { 1: 'Faible', 2: 'Modéré', 3: 'Standard', 4: 'Puissant', 5: 'Extrême' };
                    return `${gradeStars} Grade ${grade} — ${gradeLabels[grade] ?? grade}`;
                })()}</div>
                <div><strong>Lieu :</strong> ${quest._DataList._Stage._Name}</div>
                ${(quest._DataList._BossRushParams ?? []).some(p => p._PopType === 2)
                    ? '<div><strong>Mode :</strong> <span style="color:var(--accent)">⚔ Séquentiel</span></div>'
                    : ''}
                <div><strong>Limite de temps :</strong> ${quest._DataList._TimeLimit} minutes</div>
                <div><strong>Morts autorisées :</strong> ${quest._DataList._QuestLife}</div>
                <div><strong>Joueurs max :</strong> ${quest._DataList._OrderCondition._MaxPlayerNum}</div>
                <div><strong>RC minimum :</strong> ${quest._DataList._OrderCondition._OrderHR}</div>
                <div><strong>Récompense en zenny :</strong> ${quest._DataList._RemMoney}</div>
                <div><strong>Points de RC :</strong> ${quest._DataList._HRPoint}</div>
                <div><strong>ID de récompenses :</strong> ${questData.ext.rewardId}</div>
                <div><strong>Monstres :</strong></div>
                <ul>${monstersList}</ul>
                <div><strong>Récompenses :</strong></div>
                <ul>${rewardsList}</ul>
            </div>
        `;

        questSummary.innerHTML = html;

    } catch (error) {
        console.error("Erreur lors de la mise à jour du résumé :", error);
        showAlert("Erreur lors de la mise à jour du résumé : " + error.message);
    }
}

/* ── Téléchargement ───────────────────────────────────────── */

/**
 * Génère un fichier ZIP contenant les fichiers .raw.json et .ext.json
 * de la quête et déclenche son téléchargement.
 * Nécessite la bibliothèque JSZip.
 */
function downloadQuest() {
    try {
        if (!questData.raw || !questData.ext) {
            showAlert("Aucune donnée de quête à télécharger");
            return;
        }

        if (typeof JSZip === 'undefined') {
            showAlert("La bibliothèque JSZip n'est pas chargée. Vérifiez votre connexion internet et réessayez.");
            return;
        }

        const questId = questData.ext.questId;
        const zip     = new JSZip();

        // Ajouter les deux fichiers de quête dans l'archive
        zip.file(`${questId}.raw.json`, JSON.stringify(questData.raw, null, 4));
        zip.file(`${questId}.ext.json`, JSON.stringify(questData.ext, null, 4));

        // Générer et déclencher le téléchargement du ZIP
        zip.generateAsync({ type: "blob" })
            .then(content => {
                const link    = document.createElement('a');
                link.href     = URL.createObjectURL(content);
                link.download = `quest_${questId}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showAlert("Fichiers de quête téléchargés avec succès !", "success");
            })
            .catch(error => {
                console.error("Erreur lors de la création du ZIP :", error);
                showAlert("Erreur lors de la création du fichier ZIP : " + error.message);
            });

    } catch (error) {
        console.error("Erreur lors du téléchargement de la quête :", error);
        showAlert("Erreur lors du téléchargement de la quête : " + error.message);
    }
}

/* ── Import ───────────────────────────────────────────────── */

/* ── Correction automatique à l'import ───────────────────── */

/**
 * Constantes de validation des champs numériques de la quête.
 * Chaque entrée définit les bornes min/max acceptées et une valeur par défaut.
 */
const QUEST_FIELD_LIMITS = {
    timeLimit:  { min: 5,  max: 500,     def: 50     },
    questLife:  { min: 1,  max: 99,      def: 4      },
    maxPlayers: { min: 1,  max: 4,       def: 4      },
    questLevel: { min: 1,  max: 10,      def: 8      },
    rewardMoney:{ min: 1000,  max: 10000000, def: 24000  },
    hrPoints:   { min: 100,   max: 25000,    def: 2000    },
    minRC:      { min: 1,     max: 999,      def: 41      },
};

/**
 * Analyse et corrige automatiquement les données brutes d'une quête importée.
 * Retourne les données corrigées ainsi qu'un journal détaillé des actions entreprises.
 *
 * Corrections appliquées :
 *  1. Suppression des monstres absents de enemiesData (ID inconnu).
 *  2. Suppression des monstres hors-zone (selon monster.zones).
 *  3. Déduplication : les entrées identiques (même fixedId + même variant) sont
 *     fusionnées et leur compteur `count` est incrémenté.
 *  4. Ajustement niveau/grade pour rendre tous les variants valides :
 *     - Alpha requiert ★5+ et grade ≥ 3.
 *     - Alpha Suprême requiert ★8+ et grade = 5.
 *     - Quête ★9 exige grade ≥ 3 ; ★10 exige grade = 5.
 *     Si l'ajustement est impossible (ex. AT sur ★1 sans pouvoir monter),
 *     les monstres problématiques sont rétrogradés ou supprimés (les plus faibles).
 *  5. Clamp de toutes les valeurs numériques dans leurs intervalles définis.
 *  6. Correction des récompenses : minCount ≤ maxCount, clamp probability 1–100,
 *     clamp counts 1–999, suppression des entrées avec itemId inconnu.
 *
 * @param {Object}   raw          - Données brutes du fichier .raw.json parsé.
 * @param {Object}   ext          - Données brutes du fichier .ext.json parsé.
 * @param {string}   locationId   - ID string de la zone choisie pour la quête.
 * @returns {{ raw, ext, questLevel, grade, actions: string[] }}
 */
function sanitizeImportedQuest(raw, ext, locationId) {
    /** Journal des actions de correction, affiché à l'utilisateur. */
    const actions = [];

    /* ── helpers ─────────────────────────────────────────── */

    /**
     * Clamp une valeur numérique entre min et max.
     * Si la valeur est NaN ou hors bornes, retourne la valeur clamped ou le défaut.
     */
    function clamp(val, min, max, def) {
        const n = parseInt(val, 10);
        if (isNaN(n)) return def;
        if (n < min)  return min;
        if (n > max)  return max;
        return n;
    }

    /** Nom lisible d'un monstre (fr-fr en priorité, puis en-us, puis label). */
    function monsterName(m) {
        return m?.name?.['fr-fr'] || m?.name?.['en-us'] || m?.label || String(m?.fixedId);
    }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 1 — Récupérer et valider les données de base
       ═══════════════════════════════════════════════════════ */

    const data = raw._DataList ?? {};

    // Niveau de quête
    let questLevel = clamp(data._QuestLv, 1, 10, 8);
    if (data._QuestLv !== questLevel) {
        actions.push(`⚙️ Niveau de quête corrigé : ${data._QuestLv} → ★${questLevel}`);
    }

    // Limite de temps
    const rawTime = data._TimeLimit;
    const fixedTime = clamp(rawTime, QUEST_FIELD_LIMITS.timeLimit.min, QUEST_FIELD_LIMITS.timeLimit.max, QUEST_FIELD_LIMITS.timeLimit.def);
    if (rawTime !== fixedTime) {
        actions.push(`⚙️ Limite de temps corrigée : ${rawTime} min → ${fixedTime} min`);
        data._TimeLimit = fixedTime;
    }

    // Vies
    const rawLife = data._QuestLife;
    const fixedLife = clamp(rawLife, QUEST_FIELD_LIMITS.questLife.min, QUEST_FIELD_LIMITS.questLife.max, QUEST_FIELD_LIMITS.questLife.def);
    if (rawLife !== fixedLife) {
        actions.push(`⚙️ Nombre de vies corrigé : ${rawLife} → ${fixedLife}`);
        data._QuestLife = fixedLife;
    }

    // Max joueurs
    const rawPlayers = data._OrderCondition?._MaxPlayerNum;
    const fixedPlayers = clamp(rawPlayers, 1, 4, 4);
    if (rawPlayers !== fixedPlayers) {
        actions.push(`⚙️ Nombre de joueurs corrigé : ${rawPlayers} → ${fixedPlayers}`);
        if (data._OrderCondition) data._OrderCondition._MaxPlayerNum = fixedPlayers;
    }

    // Argent
    const rawMoney = data._RemMoney;
    const fixedMoney = clamp(rawMoney, 0, 9999999, 24000);
    if (rawMoney !== fixedMoney) {
        actions.push(`⚙️ Zenny de récompense corrigé : ${rawMoney} → ${fixedMoney}`);
        data._RemMoney = fixedMoney;
    }

    // Points HR
    const rawHR = data._HRPoint;
    const fixedHR = clamp(rawHR, 0, 9999, 660);
    if (rawHR !== fixedHR) {
        actions.push(`⚙️ Points HR corrigés : ${rawHR} → ${fixedHR}`);
        data._HRPoint = fixedHR;
    }

    // RC minimum
    const rawRC = data._OrderCondition?._OrderHR;
    const fixedRC = clamp(rawRC, 1, 999, 1);
    if (rawRC !== fixedRC) {
        actions.push(`⚙️ RC minimum corrigé : ${rawRC} → ${fixedRC}`);
        if (data._OrderCondition) data._OrderCondition._OrderHR = fixedRC;
    }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 2 — Détecter le grade depuis le premier monstre
       ═══════════════════════════════════════════════════════ */

    const firstTarget = raw._BossZakoDataList?._MainTargetDataList?.[0];
    let grade = 3; // valeur par défaut raisonnable
    if (firstTarget?._DifficultyRankId?.Value) {
        const uuid = firstTarget._DifficultyRankId.Value;
        outer:
        for (const [, rankEntry] of Object.entries(DIFFICULTY_TABLE)) {
            for (const [gradeKey, gradeEntry] of Object.entries(rankEntry)) {
                if (gradeEntry.normal === uuid || gradeEntry.alpha === uuid || gradeEntry.supreme === uuid) {
                    grade = parseInt(gradeKey);
                    break outer;
                }
            }
        }
        // Fallback: lire le grade dans le nom (format ★N-G)
        const nameMatch = firstTarget._DifficultyRankId.Name?.match(/★\d+-(\d+)/);
        if (nameMatch && grade === 3) grade = parseInt(nameMatch[1]);
    }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 3 — Construire la liste initiale des monstres
       ═══════════════════════════════════════════════════════ */

    const targets = raw._BossZakoDataList?._MainTargetDataList ?? [];

    // Parsed list : { monster, variant, spawnZone }
    let parsedMonsters = [];

    targets.forEach(t => {
        const monster = enemiesData.find(m => m.fixedId === t._EmID);
        if (!monster) {
            actions.push(`🗑️ Monstre inconnu supprimé (fixedId=${t._EmID})`);
            return;
        }
        const isAT    = t._LegendaryID === 'KING';
        const isAlpha = t._LegendaryID === 'NORMAL';
        const canAT   = ARCH_TEMPERED_IDS.has(monster.fixedId);
        let variant;
        if (isAT && canAT)  variant = 'ARCH_TEMPERED';
        else if (isAT)      { variant = 'TEMPERED'; actions.push(`🔀 ${monsterName(monster)} n'a pas de version Alpha Suprême → rétrogradé en Alpha`); }
        else if (isAlpha)   variant = 'TEMPERED';
        else                variant = 'NONE';

        const spawnZone = t._SetAreaNo !== undefined ? t._SetAreaNo : undefined;
        parsedMonsters.push({ monster, variant, spawnZone });
    });

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 4 — Supprimer les monstres hors-zone
       ═══════════════════════════════════════════════════════ */

    // Les zones fixes (Vallon meurtri, Cimes gelées) acceptent tous les monstres
    const isFixedZone = locationId === '1181994624' || locationId === '544388992';

    if (!isFixedZone) {
        const before = parsedMonsters.length;
        parsedMonsters = parsedMonsters.filter(({ monster }) => {
            if (isMonsterAllowedInZone(monster, locationId)) return true;
            const zoneName = getZoneLabel(locationId);
            actions.push(`🗺️ ${monsterName(monster)} supprimé — absent de la zone « ${zoneName} »`);
            return false;
        });
    }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 5 — Dédupliquer et incrémenter les compteurs
       ═══════════════════════════════════════════════════════ */

    // Regrouper par (fixedId, variant)
    const monsterMap = new Map(); // clé = "fixedId:variant"

    parsedMonsters.forEach(({ monster, variant, spawnZone }) => {
        const key = `${monster.fixedId}:${variant}`;
        if (monsterMap.has(key)) {
            const entry = monsterMap.get(key);
            entry.count++;
            // Garder la première spawnZone rencontrée ; ignorer les doublons
        } else {
            monsterMap.set(key, { monster, variant, spawnZone, count: 1 });
        }
    });

    // Signaler les regroupements
    for (const [, entry] of monsterMap) {
        if (entry.count > 1) {
            actions.push(`🔢 ${monsterName(entry.monster)} (${_variantLabel(entry.variant)}) apparaît ${entry.count} fois → compteur mis à jour`);
        }
    }

    // Respecter le plafond MAX_MONSTER_COUNT par entrée
    for (const [, entry] of monsterMap) {
        if (entry.count > MAX_MONSTER_COUNT) {
            actions.push(`✂️ ${monsterName(entry.monster)} : compteur réduit de ${entry.count} à ${MAX_MONSTER_COUNT} (maximum autorisé)`);
            entry.count = MAX_MONSTER_COUNT;
        }
    }

    let deduped = Array.from(monsterMap.values()); // { monster, variant, spawnZone, count }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 6 — Ajuster niveau et grade pour les variants
       ═══════════════════════════════════════════════════════ */

    /**
     * Vérifie si la combinaison (questLevel, grade) est compatible
     * avec tous les monstres de la liste.
     * @returns {boolean}
     */
    function isConfigValid(lvl, gr, monsters) {
        // Restrictions de grade global
        if (lvl >= 10 && gr !== 5)        return false;
        if (lvl >= 9  && gr < 3)          return false;

        for (const { variant } of monsters) {
            if (variant === 'TEMPERED'      && !isAlphaAllowed(lvl, gr))   return false;
            if (variant === 'ARCH_TEMPERED' && !isSupremeAllowed(lvl, gr)) return false;
        }
        return true;
    }

    /**
     * "Poids" relatif d'un variant pour déterminer quel monstre supprimer
     * en dernier recours (plus le poids est faible, plus on supprime en premier).
     */
    function variantWeight(variant) {
        return variant === 'ARCH_TEMPERED' ? 3 : variant === 'TEMPERED' ? 2 : 1;
    }

    // Tenter d'ajuster questLevel et grade sans supprimer de monstres
    if (deduped.length > 0 && !isConfigValid(questLevel, grade, deduped)) {
        let adjusted = false;

        // Chercher la combinaison (level, grade) minimale qui inclut tout
        // On préfère d'abord monter le grade, puis le niveau
        outer2:
        for (let lv = questLevel; lv <= 10; lv++) {
            const grMin = lv >= 10 ? 5 : lv >= 9 ? 3 : 1;
            const grMax = 5;
            for (let gr = Math.max(grade, grMin); gr <= grMax; gr++) {
                if (isConfigValid(lv, gr, deduped)) {
                    if (lv !== questLevel || gr !== grade) {
                        actions.push(`🎯 Niveau/grade ajusté : ★${questLevel} grade ${grade} → ★${lv} grade ${gr} (pour inclure tous les monstres sélectionnés)`);
                        questLevel = lv;
                        grade      = gr;
                    }
                    adjusted = true;
                    break outer2;
                }
            }
        }

        // Si aucune combinaison ne fonctionne, supprimer les monstres les plus « faibles »
        // (variant NONE < TEMPERED < ARCH_TEMPERED) jusqu'à obtenir une config valide
        if (!adjusted) {
            // Trier : les monstres les moins contraignants d'abord (supprimés en premier)
            deduped.sort((a, b) => variantWeight(a.variant) - variantWeight(b.variant));

            while (deduped.length > 0 && !isConfigValid(questLevel, grade, deduped)) {
                const removed = deduped.shift();
                actions.push(`🗑️ ${monsterName(removed.monster)} (${_variantLabel(removed.variant)}) supprimé — impossible de concilier avec le niveau/grade courant`);
            }

            // Ré-essayer un ajustement sur la liste réduite
            if (deduped.length > 0) {
                outer3:
                for (let lv = questLevel; lv <= 10; lv++) {
                    const grMin = lv >= 10 ? 5 : lv >= 9 ? 3 : 1;
                    for (let gr = Math.max(grade, grMin); gr <= 5; gr++) {
                        if (isConfigValid(lv, gr, deduped)) {
                            if (lv !== questLevel || gr !== grade) {
                                actions.push(`🎯 Niveau/grade ajusté après nettoyage : ★${questLevel} grade ${grade} → ★${lv} grade ${gr}`);
                                questLevel = lv;
                                grade      = gr;
                            }
                            break outer3;
                        }
                    }
                }
            }
        }
    }

    // Restrictions ★9 (grade minimum 3) et ★10 (grade obligatoire 5)
    if (questLevel >= 10 && grade !== 5) {
        actions.push(`⚙️ Grade forcé à 5 (obligatoire pour une quête ★10)`);
        grade = 5;
    } else if (questLevel >= 9 && grade < 3) {
        actions.push(`⚙️ Grade relevé à 3 (minimum pour une quête ★9)`);
        grade = 3;
    }

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 7 — Reconstruire selectedMonsters
       ═══════════════════════════════════════════════════════ */

    // Convertir deduped en format selectedMonsters
    // Chaque monstre avec count > 1 sera représenté par une seule entrée avec .count
    const finalMonsters = deduped.map(({ monster, variant, spawnZone, count }) => ({
        ...monster,
        variant,
        spawnZone,
        count: count || 1
    }));

    /* ═══════════════════════════════════════════════════════
       ÉTAPE 8 — Corriger les récompenses (ext)
       ═══════════════════════════════════════════════════════ */

    const rawRewards = ext.rewardItems ?? [];
    const fixedRewards = [];

    rawRewards.forEach(r => {
        // Vérifier que l'objet existe dans itemsData
        const item = itemsData.find(i => i.id === r.itemId);
        if (!item) {
            actions.push(`🎁 Récompense supprimée — objet ID ${r.itemId} inconnu`);
            return;
        }

        let changed = false;
        const orig = { minCount: r.minCount, maxCount: r.maxCount, probability: r.probability };

        // Clamp probability
        const prob = clamp(r.probability, 1, 100, 100);
        if (prob !== r.probability) { r.probability = prob; changed = true; }

        // Clamp counts
        const minC = clamp(r.minCount, 1, 999, 1);
        if (minC !== r.minCount) { r.minCount = minC; changed = true; }

        const maxC = clamp(r.maxCount, 1, 999, 1);
        if (maxC !== r.maxCount) { r.maxCount = maxC; changed = true; }

        // S'assurer min ≤ max
        if (r.minCount > r.maxCount) {
            r.maxCount = r.minCount;
            changed = true;
        }

        if (changed) {
            const name = item.name?.[currentLanguage] || item.name?.['fr-fr'] || `ID ${r.itemId}`;
            actions.push(`🎁 Récompense « ${name} » corrigée — quantité [${orig.minCount}–${orig.maxCount}], chance ${orig.probability}% → [${r.minCount}–${r.maxCount}], ${r.probability}%`);
        }

        fixedRewards.push(r);
    });

    if (fixedRewards.length === 0 && rawRewards.length > 0) {
        actions.push(`⚠️ Toutes les récompenses étaient invalides et ont été supprimées`);
    }
    ext.rewardItems = fixedRewards;

    /* ═══════════════════════════════════════════════════════
       Résumé final
       ═══════════════════════════════════════════════════════ */

    return {
        raw,
        ext,
        questLevel,
        grade,
        finalMonsters,
        actions
    };
}

/**
 * Retourne un libellé lisible pour un variant de monstre.
 * @param {string} variant - 'NONE', 'TEMPERED' ou 'ARCH_TEMPERED'.
 * @returns {string}
 */
function _variantLabel(variant) {
    if (variant === 'ARCH_TEMPERED') return 'Alpha Suprême';
    if (variant === 'TEMPERED')      return 'Alpha';
    return 'Normal';
}

/**
 * Affiche le rapport de correction dans une modale dédiée ou dans un bloc
 * inséré juste après la zone d'import, et le referme après 30 secondes.
 * @param {string[]} actions - Tableau des messages de correction.
 * @param {string}   filename - Nom du fichier importé.
 */
function _showImportReport(actions, filename) {
    // Supprimer un rapport précédent s'il existe
    const existing = document.getElementById('import-report');
    if (existing) existing.remove();

    // Construire le rapport
    const report = document.createElement('div');
    report.id = 'import-report';
    report.style.cssText = `
        margin: 12px 0 4px;
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: 6px;
        overflow: hidden;
        font-size: 0.85em;
    `;

    const headerColor = actions.length === 0 ? 'var(--accent)' : '#b8860b';

    report.innerHTML = `
        <div style="
            display: flex; align-items: center; justify-content: space-between;
            padding: 8px 12px;
            background: ${actions.length === 0 ? '#0d2b1a' : '#2a1f00'};
            border-bottom: 1px solid var(--border);
            cursor: pointer;
        " onclick="this.parentElement.querySelector('.import-report-body').style.display =
                   this.parentElement.querySelector('.import-report-body').style.display === 'none' ? 'block' : 'none'">
            <span style="color: ${headerColor}; font-weight: 600;">
                ${actions.length === 0
                    ? '✅ Import sans correction nécessaire'
                    : `⚠️ ${actions.length} correction${actions.length > 1 ? 's' : ''} appliquée${actions.length > 1 ? 's' : ''} lors de l'import`}
            </span>
            <span style="color: var(--text-dim); font-size: 0.9em;">▼ Détails</span>
        </div>
        <div class="import-report-body" style="padding: 10px 14px; line-height: 1.7;">
            ${actions.length === 0
                ? `<p style="color: var(--text-dim); margin: 0;">
                       Aucune anomalie détectée dans « ${filename} ».
                       Vérifiez tout de même les champs avant de régénérer.
                   </p>`
                : `<ul style="margin: 0; padding-left: 18px; color: var(--text);">
                       ${actions.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
                   </ul>`
            }
            <p style="margin: 8px 0 0; color: var(--text-dim); font-size: 0.9em;">
                Ce rapport disparaîtra dans 30 secondes, ou cliquez sur l'en-tête pour le masquer.
            </p>
        </div>
    `;

    // Insérer juste après la zone d'import
    const importZone = document.getElementById('importFile')?.closest('div');
    if (importZone?.parentElement) {
        importZone.parentElement.insertBefore(report, importZone.nextSibling);
    } else {
        // Fallback : au début du tab quest-info
        const container = document.getElementById('quest-info');
        if (container) container.prepend(report);
    }

    // Auto-suppression après 30 s
    setTimeout(() => { report.remove(); }, 30000);
}

/**
 * Importe une quête existante depuis un fichier ZIP contenant
 * un fichier .raw.json et un fichier .ext.json.
 * Applique une correction automatique avant de remplir le formulaire
 * et affiche un rapport détaillé des modifications effectuées.
 * @param {HTMLInputElement} input - Le champ <input type="file"> ayant déclenché l'événement.
 */
async function importQuest(input) {
    const file = input.files[0];
    if (!file) return;

    const status = document.getElementById('import-status');
    status.textContent = 'Chargement…';
    status.style.color = 'var(--text-dim)';

    try {
        if (typeof JSZip === 'undefined') throw new Error('JSZip non chargé');

        const zip = await JSZip.loadAsync(file);

        // Rechercher les fichiers .raw.json et .ext.json dans l'archive
        let rawFile = null, extFile = null;
        zip.forEach((path, f) => {
            if (path.endsWith('.raw.json')) rawFile = f;
            if (path.endsWith('.ext.json')) extFile = f;
        });
        if (!rawFile) throw new Error('Fichier .raw.json introuvable dans le ZIP');
        if (!extFile) throw new Error('Fichier .ext.json introuvable dans le ZIP');

        const raw = JSON.parse(await rawFile.async('string'));
        const ext = JSON.parse(await extFile.async('string'));

        // ── Déterminer le lieu avant la sanitisation ────────
        const stageVal  = String(raw._DataList?._Stage?._Value ?? '1181994624');
        const locSelect = document.getElementById('questLocation');
        if ([...locSelect.options].some(o => o.value === stageVal)) {
            locSelect.value = stageVal;
        }
        onLocationChange(stageVal);

        // ── Correction automatique ──────────────────────────
        const sanitized = sanitizeImportedQuest(raw, ext, stageVal);
        const { questLevel, grade, finalMonsters, actions } = sanitized;

        // ── Informations de base ────────────────────────────
        const data   = raw._DataList;
        const msgFR  = raw._MessageAssetList?.find(m => m.Language === 2);
        const title  = msgFR?.MessageData?.find(m => m.Name?.endsWith('_100'))?.Text || '';
        const client = msgFR?.MessageData?.find(m => m.Name?.endsWith('_101'))?.Text || '';
        const desc   = msgFR?.MessageData?.find(m => m.Name?.endsWith('_102'))?.Text || '';

        document.getElementById('questId').value          = data._MissionId?._Value ?? ext.questId ?? 10086;
        document.getElementById('questTitle').value = title.replace(/<COLOR[^>]*>|<\/COLOR>/gi, '');
        const redTitleEl = document.getElementById('redTitle');
            if (redTitleEl) redTitleEl.checked = /\u003cCOLOR[^>]*TXT_Danger/i.test(
                msgFR?.MessageData?.find(m => m.Name?.endsWith('_100'))?.Text ?? ''
            );
        document.getElementById('questClient').value      = client;
        document.getElementById('questDescription').value = desc;
        document.getElementById('timeLimit').value        = data._TimeLimit ?? 20;
        document.getElementById('rewardMoney').value      = data._RemMoney  ?? 24000;
        document.getElementById('hrPoints').value         = data._HRPoint   ?? 660;
        document.getElementById('questLife').value        = data._QuestLife ?? 2;
        document.getElementById('maxPlayers').value       = data._OrderCondition?._MaxPlayerNum ?? 4;
        document.getElementById('minRC').value            = data._OrderCondition?._OrderHR      ?? 1;
        document.getElementById('questLevel').value       = questLevel;

        // ── Heure & météo ────────────────────────────────────
        const streamData = raw._StreamQuestData;
        const importedHour = streamData?._WorldTimeHourQuest ?? 18;
        const hourEl = document.getElementById('worldTimeHour');
        if (hourEl) {
            const allowedHours = [6, 12, 18, 0];
            const closest = allowedHours.reduce((prev, curr) => {
                const diffPrev = Math.min(Math.abs(importedHour - prev), 24 - Math.abs(importedHour - prev));
                const diffCurr = Math.min(Math.abs(importedHour - curr), 24 - Math.abs(importedHour - curr));
                return diffCurr < diffPrev ? curr : prev;
            });
            hourEl.value = String(closest);
        }

        const importedEnvValue = streamData?._SetEnvironmentDataList?.[0]?._EnvType?._Value;
        const envTypeEl = document.getElementById('envType');
        if (envTypeEl && importedEnvValue !== undefined) {
            const matchingOption = [...envTypeEl.options].find(o => parseInt(o.value) === importedEnvValue);
            if (matchingOption) envTypeEl.value = matchingOption.value;
        }

        const importedIsFixEnv = streamData?._SetEnvironmentDataList?.[0]?._IsFixEnv ?? false;
        const isFixEnvEl = document.getElementById('isFixEnv');
        if (isFixEnvEl) isFixEnvEl.checked = importedIsFixEnv;

        // ── Difficulté des monstres (grade corrigé) ─────────
        const diffEl = document.getElementById('monsterDifficulty');
        if (diffEl) {
            diffEl.value = String(grade);
            _applyGradeRestrictions(questLevel);
            _refreshRestrictionsPanel();
        }

        // ── Monstres (liste sanitisée) ──────────────────────
        selectedMonsters = finalMonsters;

        // Détecter le mode séquentiel : présence de _BossRushParams avec au moins un PopType 2
        const bossRushParams = raw._DataList?._BossRushParams ?? [];
        const isSeq = bossRushParams.some(p => p._PopType === 2);
        if (stageVal === '1181994624') {
            document.getElementById('sequentialMonsters').checked = isSeq;
        }

        populateMonsterList();
        updateMonsterPreview();

        // ── Récompenses (sanitisées) ────────────────────────
        rewardItems = [];
        (ext.rewardItems ?? []).forEach(r => {
            const item = itemsData.find(i => i.id === r.itemId);
            rewardItems.push({
                itemId:      r.itemId,
                itemName:    item?.name?.[currentLanguage] ?? r.itemName ?? 'Inconnu',
                minCount:    r.minCount,
                maxCount:    r.maxCount,
                probability: r.probability
            });
        });
        rebuildRewardUI();

        // Réinitialiser le champ fichier pour permettre un ré-import
        input.value = '';

        // ── Rapport de correction ───────────────────────────
        _showImportReport(actions, file.name);

        status.textContent = `✓ "${file.name}" importé${actions.length > 0 ? ` (${actions.length} correction${actions.length > 1 ? 's' : ''})` : ' sans correction'}`;
        status.style.color = actions.length > 0 ? 'var(--accent)' : '#4caf82';
        setTimeout(() => { status.textContent = ''; }, 8000);

        if (actions.length > 0) {
            showAlert(`Quête importée avec ${actions.length} correction${actions.length > 1 ? 's' : ''} automatique${actions.length > 1 ? 's' : ''} — voir le rapport ci-dessous.`, 'success');
        } else {
            showAlert('Quête importée sans anomalie détectée ! Vérifiez les champs, puis régénérez.', 'success');
        }

    } catch (err) {
        console.error("Erreur d'import :", err);
        status.textContent = '✗ ' + err.message;
        status.style.color = '#e07070';
        showAlert("Erreur lors de l'import : " + err.message);
        input.value = '';
    }
}