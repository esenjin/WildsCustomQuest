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
        const questTitle    = questTitleEl.value || "Custom Quest";
        // Convertir les sauts de ligne en \r\n pour l'affichage en jeu dans la description
        const questDesc     = (questDescriptionEl.value || "A custom monster hunt").replace(/\r\n|\r|\n/g, '\r\n');
        const questClient   = document.getElementById('questClient')?.value || "Générateur de quêtes";
        const questLevel    = parseInt(questLevelEl.value) || 8;
        const questLocation = questLocationEl.value || "1181994624";
        const timeLimit     = parseInt(timeLimitEl.value) || 20;
        const rewardMoney   = parseInt(rewardMoneyEl.value) || 24000;
        const hrPoints      = parseInt(hrPointsEl.value) || 660;
        const questLife     = parseInt(questLifeEl?.value) || 2;
        const maxPlayers    = Math.min(4, Math.max(1, parseInt(document.getElementById('maxPlayers')?.value) || 4));

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
            "_ArenaDataList": {
                "_IsUserCamp": false,
                "_MissionID": null,
                "_SelectDatas": null,
                "_SelectNpcDatas": null,
                "_TimeRankA": null,
                "_TimeRankB": null,
                "_TimeRankS": null
            },
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
                        "_IsDeepSleepCreate": index > 0 && sequential
                    },
                    "_AreaNo": 255,
                    "_DifficultyAdjustRange": 0,
                    "_DifficultyRankId": {
                        "Name": `★${questLevel}`,
                        "Value": (monster.variant === 'TEMPERED' || monster.variant === 'ARCH_TEMPERED')
                            ? "6d893ac4-5f81-4850-b1ac-a2c23845cb15"
                            : "aa92e87f-9a58-4a8f-8613-c00ddb9e763a"
                    },
                    "_EmID": monster.fixedId,
                    "_EventTargetID": "INVALID",
                    "_FixedSize": 100,
                    "_GroupID": index,
                    "_InitPos": "(-326,-28,176)",
                    "_IsUseRandomSize": false,
                    "_LayoutKeepID": -1,
                    "_LegendaryID": monster.variant === 'ARCH_TEMPERED' ? "KING" : "NORMAL",
                    "_OptionTag": {
                        "Value": sequential && index > 0 ? index : 0
                    },
                    "_RandomSizeTblId": {
                        "Name": "",
                        "Value": "f8f74ab0-0002-0000-00000002003e203e"
                    },
                    "_RoleID": "NORMAL",
                    "_RouteID": {
                        "Name": "斗技场",
                        "_Value": "7ae19f9f-f315-4f16-cc4fc595f9f7c483"
                    },
                    "_SetAreaNo": 255,
                    "_StoryTargetID": 101 + index,
                    // Condition d'apparition séquentielle : le monstre attend la mort du précédent
                    ...(sequential && index > 0 ? {
                        "_SpawnCondition": {
                            "_ConditionType": "EM_DEAD",
                            "_TargetStoryID": 101 + index - 1
                        }
                    } : {})
                })),
                "_SubBossLayoutID": {
                    "_ID": "c8ed5a65-8c96-48cb-3a15eb556208668e",
                    "_Resource": "assets:/GameDesign/Stage/st401/Layout/Loaded/Enemy/SubBoss/st401_SubBoss_Ms006025_00.pog.json"
                },
                "_ZakoLayoutID": {
                    "_ID": "00000000-0000-0000-0000-000000000000",
                    "_Resource": null
                },
                "_ZakoLayoutTag": {
                    "_FieldID": {
                        "_Name": getLocationName(questLocation),
                        "_Value": parseInt(questLocation)
                    },
                    "_IsIntentionallyBlank": false,
                    "_Value": 4
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
                "_BossRushParams": [],
                "_BossRushParams=": null,
                "_ClearBGM": 0,
                "_ClearCondition": {
                    // Un objectif par entrée dans la liste développée (respecte les doublons dus au count)
                    "_TargetInfoArray": expandedMonsters.map((monster, index) => ({
                        "_ConditionalMoveData": {
                            "_DestArray": [],
                            "_IsUse": false,
                            "_RevertOnCompleted": false,
                            "_StartAfterFirstCondition": false
                        },
                        "_EmTargetID": 101 + index,
                        "_LegendaryID": monster.variant === 'ARCH_TEMPERED' ? "KING" : "NORMAL",
                        "_RoleID": "NORMAL",
                        "_ShowTargetGuide": true,
                        "_TargetIDValue": monster.fixedId,
                        "_TargetValue": 1
                    })),
                    "_TargetType": 1
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
                "_QuestType": 0,
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
                            "_Name": "荒廃期",
                            "_Value": 1961958400
                        },
                        "_ForcastDatas": [],
                        "_IsFixEnv": false,
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
                "_WorldTimeHourQuest": 21,
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
                : '';
            monstersList += `<li>${monsterName}${badge} <span style="color:#888;font-size:0.85em">(${monster ? monster.label : 'Inconnu'})</span></li>`;
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
                <div><strong>Titre :</strong> ${msgEntry.MessageData[2].Text}</div>
                <div><strong>Client :</strong> ${msgEntry.MessageData[3].Text}</div>
                <div><strong>ID :</strong> ${quest._DataList._MissionId._Value}</div>
                <div><strong>Niveau :</strong> ★${quest._DataList._QuestLv}</div>
                <div><strong>Lieu :</strong> ${quest._DataList._Stage._Name}</div>
                ${quest._BossZakoDataList._MainTargetDataList.some(t => t._SpawnCondition)
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

/**
 * Importe une quête existante depuis un fichier ZIP contenant
 * un fichier .raw.json et un fichier .ext.json.
 * Remplit tous les champs du formulaire avec les données importées.
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

        // ── Informations de base ────────────────────────────
        const data   = raw._DataList;
        const msgFR  = raw._MessageAssetList?.find(m => m.Language === 2);
        const title  = msgFR?.MessageData?.find(m => m.Name?.endsWith('_100'))?.Text || '';
        const client = msgFR?.MessageData?.find(m => m.Name?.endsWith('_101'))?.Text || '';
        const desc   = msgFR?.MessageData?.find(m => m.Name?.endsWith('_102'))?.Text || '';

        document.getElementById('questId').value          = data._MissionId?._Value ?? ext.questId ?? 10086;
        document.getElementById('questTitle').value       = title;
        document.getElementById('questClient').value      = client;
        document.getElementById('questDescription').value = desc;
        document.getElementById('timeLimit').value        = data._TimeLimit ?? 20;
        document.getElementById('rewardMoney').value      = data._RemMoney  ?? 24000;
        document.getElementById('hrPoints').value         = data._HRPoint   ?? 660;
        document.getElementById('questLife').value        = data._QuestLife ?? 2;
        document.getElementById('maxPlayers').value       = data._OrderCondition?._MaxPlayerNum ?? 4;
        document.getElementById('minRC').value            = data._OrderCondition?._OrderHR      ?? 1;
        document.getElementById('questLevel').value       = data._QuestLv ?? 8;

        // ── Lieu ────────────────────────────────────────────
        const stageVal  = String(data._Stage?._Value ?? '1181994624');
        const locSelect = document.getElementById('questLocation');
        if ([...locSelect.options].some(o => o.value === stageVal)) {
            locSelect.value = stageVal;
        }
        onLocationChange(stageVal);

        // ── Monstres ────────────────────────────────────────
        selectedMonsters = [];
        const targets = raw._BossZakoDataList?._MainTargetDataList ?? [];
        targets.forEach(t => {
            const monster = enemiesData.find(m => m.fixedId === t._EmID);
            if (!monster) return;
            const isAT    = t._LegendaryID === 'KING';
            const canAT   = ARCH_TEMPERED_IDS.has(monster.fixedId);
            const variant = isAT && canAT ? 'ARCH_TEMPERED' : 'TEMPERED';
            selectedMonsters.push({ ...monster, variant });
        });

        // Détecter le mode séquentiel (au moins un monstre a _SpawnCondition)
        const isSeq = targets.some(t => t._SpawnCondition);
        if (stageVal === '1181994624') {
            document.getElementById('sequentialMonsters').checked = isSeq;
        }

        populateMonsterList();
        updateMonsterPreview();

        // ── Récompenses ─────────────────────────────────────
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

        status.textContent = `✓ "${file.name}" importé avec succès`;
        status.style.color = 'var(--accent)';
        setTimeout(() => { status.textContent = ''; }, 4000);

        showAlert('Quête importée ! Vérifiez et modifiez les champs, puis régénérez.', 'success');

    } catch (err) {
        console.error("Erreur d'import :", err);
        status.textContent = '✗ ' + err.message;
        status.style.color = '#e07070';
        showAlert("Erreur lors de l'import : " + err.message);
        input.value = '';
    }
}
