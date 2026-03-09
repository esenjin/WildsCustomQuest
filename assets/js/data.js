/* ============================================================
   data.js – Chargement des données JSON et initialisation
   ============================================================ */

/**
 * Charge toutes les données JSON nécessaires à l'application
 * depuis le dossier datas/ et initialise l'interface.
 * En cas d'échec, des données de secours minimales sont utilisées.
 */
async function loadData() {
    try {
        // ── Chargement des ennemis ──────────────────────────
        const enemiesResponse = await fetch('datas/enemies.json');
        if (!enemiesResponse.ok) {
            throw new Error(`Impossible de charger enemies.json : ${enemiesResponse.status} ${enemiesResponse.statusText}`);
        }
        enemiesData = await enemiesResponse.json();

        // ── Chargement des objets ───────────────────────────
        const itemsResponse = await fetch('datas/items.json');
        if (!itemsResponse.ok) {
            throw new Error(`Impossible de charger items.json : ${itemsResponse.status} ${itemsResponse.statusText}`);
        }
        itemsData = await itemsResponse.json();

        // ── Chargement de la liste de récompenses ───────────
        // Le fichier reward_list.json est multilingue, un seul fichier suffit
        const rewardResponse = await fetch('datas/reward_list.json');
        if (!rewardResponse.ok) {
            throw new Error(`Impossible de charger reward_list.json : ${rewardResponse.status} ${rewardResponse.statusText}`);
        }
        rewardListData = await rewardResponse.json();

        // ── Initialisation de l'interface ───────────────────
        populateMonsterList();

        // Ajouter une récompense par défaut si la liste est vide
        if (rewardItems.length === 0) {
            addReward();
        }

        console.log("Données chargées avec succès.");

    } catch (error) {
        showAlert("Erreur lors du chargement des données : " + error.message);
        console.error("Erreur de chargement :", error);

        // ── Données de secours ──────────────────────────────
        // Utilisées en cas d'échec du fetch pour ne pas bloquer l'application

        if (enemiesData.length === 0) {
            console.warn("Utilisation des données ennemis de secours");
            enemiesData = [
                {
                    id: 0,
                    fixedId: 26,
                    label: "EM0001_00_0",
                    name: {
                        "fr-fr": "Rathian",
                        "zh-cn": "雌火龙",
                        "en-us": "Rathian",
                        "ja-jp": "リオレイア"
                    }
                }
            ];
        }

        if (itemsData.length === 0) {
            console.warn("Utilisation des données objets de secours");
            itemsData = [
                {
                    id: 1,
                    fixedId: 2,
                    label: "ITEM_0000",
                    name: {
                        "fr-fr": "Potion",
                        "zh-cn": "回复药",
                        "en-us": "Potion",
                        "ja-jp": "回復薬"
                    }
                }
            ];
        }

        populateMonsterList();
    }
}
