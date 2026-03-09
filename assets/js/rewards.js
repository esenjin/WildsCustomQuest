/* ============================================================
   rewards.js – Gestion des objets de récompense de quête
   ============================================================ */

/* ── Ajout d'une récompense ───────────────────────────────── */

/**
 * Ajoute un nouvel objet de récompense à la liste et l'affiche dans l'interface.
 * Le premier objet de itemsData est utilisé comme valeur par défaut.
 */
function addReward() {
    const rewardContainer = document.getElementById('reward-items');
    if (!rewardContainer) return;

    const rewardIndex = rewardItems.length;

    // Créer l'entrée de récompense avec les valeurs par défaut
    const newReward = {
        itemId:      itemsData.length > 0 ? itemsData[0].id : 1,
        itemName:    itemsData.length > 0 ? (itemsData[0].name[currentLanguage] || "Objet inconnu") : "Potion",
        minCount:    1,
        maxCount:    1,
        probability: 100
    };

    rewardItems.push(newReward);

    // Créer l'élément HTML correspondant et l'insérer dans le conteneur
    const rewardElement = _createRewardElement(rewardIndex, newReward);
    rewardContainer.appendChild(rewardElement);
}

/* ── Mise à jour d'une récompense ─────────────────────────── */

/**
 * Met à jour une propriété d'un objet de récompense existant.
 * Gère aussi la cohérence min/max et le clamp du pourcentage de chance.
 * @param {number} index    - L'indice de la récompense dans le tableau rewardItems.
 * @param {string} property - La propriété à modifier ('itemId', 'minCount', 'maxCount', 'probability').
 * @param {string} value    - La nouvelle valeur (chaîne brute du champ HTML).
 */
function updateRewardItem(index, property, value) {
    if (index >= rewardItems.length) return;

    if (property === 'itemId') {
        // Mettre à jour l'ID et le nom de l'objet
        const selectedItem = itemsData.find(item => item.id == value);
        if (selectedItem) {
            rewardItems[index].itemId   = parseInt(value);
            rewardItems[index].itemName = selectedItem.name && selectedItem.name[currentLanguage]
                ? selectedItem.name[currentLanguage]
                : 'Objet inconnu';
        }
    } else if (property === 'minCount' || property === 'maxCount') {
        rewardItems[index][property] = parseInt(value);

        // S'assurer que minCount ≤ maxCount
        if (rewardItems[index].minCount > rewardItems[index].maxCount) {
            rewardItems[index].maxCount = rewardItems[index].minCount;
            const rewardElement = document.querySelector(`.reward-item[data-index="${index}"]`);
            if (rewardElement) {
                const maxInput = rewardElement.querySelectorAll('input')[1];
                if (maxInput) maxInput.value = rewardItems[index].maxCount;
            }
        }
    } else if (property === 'probability') {
        rewardItems[index][property] = parseInt(value);

        // Clamp entre 1 et 100
        if (rewardItems[index].probability < 1)   rewardItems[index].probability = 1;
        if (rewardItems[index].probability > 100) rewardItems[index].probability = 100;
    }
}

/* ── Suppression d'une récompense ─────────────────────────── */

/**
 * Supprime une récompense de la liste et reconstruit entièrement l'interface
 * pour mettre à jour les indices.
 * @param {number} index - L'indice de la récompense à supprimer.
 */
function removeRewardItem(index) {
    rewardItems.splice(index, 1);
    rebuildRewardUI();
}

/* ── Reconstruction complète de l'UI des récompenses ─────── */

/**
 * Reconstruit tous les éléments HTML de la liste de récompenses
 * depuis le tableau rewardItems en cours.
 * Utilisé après une suppression ou un import de quête.
 */
function rebuildRewardUI() {
    const container = document.getElementById('reward-items');
    if (!container) return;

    container.innerHTML = '';

    // Si plus aucune récompense, en ajouter une par défaut
    if (rewardItems.length === 0) {
        addReward();
        return;
    }

    rewardItems.forEach((item, idx) => {
        const el = _createRewardElement(idx, item);
        container.appendChild(el);
    });
}

/* ── Mise à jour des noms lors d'un changement de langue ──── */

/**
 * Actualise les noms d'objets affichés dans les selects de récompense
 * en fonction de la langue courante.
 */
function updateRewardItemNames() {
    rewardItems.forEach((item, index) => {
        const selectedItem = itemsData.find(menuItem => menuItem.id === item.itemId);
        if (selectedItem && selectedItem.name) {
            item.itemName = selectedItem.name[currentLanguage] || 'Objet inconnu';

            // Mettre à jour le contenu du <select> correspondant
            const rewardElement = document.querySelector(`.reward-item[data-index="${index}"]`);
            if (rewardElement) {
                const select = rewardElement.querySelector('select');
                if (select) {
                    select.innerHTML = _buildItemOptions(item.itemId);
                }
            }
        }
    });
}

/* ── Filtrage de la liste d'objets ────────────────────────── */

/**
 * Filtre les options des selects d'objets selon un terme de recherche.
 * @param {string} searchTerm - Le terme de recherche (en minuscules).
 */
function filterItems(searchTerm) {
    document.querySelectorAll('.item-select').forEach(select => {
        Array.from(select.options).forEach(option => {
            const name = option.textContent.toLowerCase();
            const id   = option.value;
            option.style.display = (name.includes(searchTerm) || id.includes(searchTerm)) ? '' : 'none';
        });
    });
}

/* ── Fonctions internes ───────────────────────────────────── */

/**
 * Génère le HTML des options d'un select d'objet.
 * @param {number} selectedId - L'ID de l'objet actuellement sélectionné.
 * @returns {string} Le HTML des balises <option>.
 */
function _buildItemOptions(selectedId) {
    return itemsData.map(item => `
        <option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>
            ${item.id} : ${item.name && item.name[currentLanguage] ? item.name[currentLanguage] : '---'}
        </option>
    `).join('');
}

/**
 * Crée l'élément HTML d'une ligne de récompense.
 * @param {number} idx  - L'indice de la récompense.
 * @param {Object} item - Les données de la récompense.
 * @returns {HTMLElement} L'élément <div> de la récompense.
 */
function _createRewardElement(idx, item) {
    const el = document.createElement('div');
    el.className        = 'reward-item';
    el.dataset.index    = idx;

    el.innerHTML = `
        <div class="reward-controls">
            <select class="item-select" title="Nom de l'objet" onchange="updateRewardItem(${idx}, 'itemId', this.value)">
                ${_buildItemOptions(item.itemId)}
            </select>
            <input type="number" title="Quantité minimum" placeholder="Min" min="1" value="${item.minCount}"
                onchange="updateRewardItem(${idx}, 'minCount', this.value)">
            <input type="number" title="Quantité maximum" placeholder="Max" min="1" value="${item.maxCount}"
                onchange="updateRewardItem(${idx}, 'maxCount', this.value)">
            <input type="number" title="Chance de drop (%)" placeholder="Chance %" min="1" max="100" value="${item.probability}"
                onchange="updateRewardItem(${idx}, 'probability', this.value)">
        </div>
        <button onclick="removeRewardItem(${idx})">×</button>
    `;

    return el;
}
