/* ============================================================
   monsters.js – Gestion de la liste et de la sélection des monstres
   ============================================================ */

/**
 * IDs des monstres disposant d'une version Alpha Suprême (LegendaryID = KING).
 * Rey Dau, Uth Duna, Nu Udra, Arkveld.
 */
const ARCH_TEMPERED_IDS = new Set([-1547364608, 1467998976, 1657778432, 746996864, 1553456768]);

/* ── Affichage de la liste ────────────────────────────────── */

/**
 * (Re)génère toutes les cartes monstres dans le conteneur #monster-list.
 * Prend en compte la langue courante et les sélections existantes.
 */
function populateMonsterList() {
    const monsterList = document.getElementById('monster-list');
    if (!monsterList) return;

    monsterList.innerHTML = '';

    enemiesData.forEach(monster => {
        // Ignorer les monstres sans nom dans la langue courante
        if (!monster.name || !monster.name[currentLanguage]) return;

        const card = document.createElement('div');
        card.className = 'monster-card';
        card.dataset.monsterId    = monster.fixedId;
        card.dataset.monsterLabel = monster.label;

        // Récupérer la sélection existante pour ce monstre
        const existingSelection = selectedMonsters.find(m => m.fixedId === monster.fixedId);
        const canBeAT = ARCH_TEMPERED_IDS.has(monster.fixedId);

        // Si le monstre n'a pas de version AT et était marqué AT, repasser en Alpha
        if (existingSelection && existingSelection.variant === 'ARCH_TEMPERED' && !canBeAT) {
            existingSelection.variant = 'TEMPERED';
        }

        const variant = existingSelection ? (existingSelection.variant || 'TEMPERED') : 'TEMPERED';

        // Appliquer les classes visuelles si déjà sélectionné
        if (existingSelection) {
            card.classList.add('selected');
            if (variant === 'ARCH_TEMPERED') card.classList.add('arch-tempered');
            else card.classList.add('alpha');
        }

        const checkboxId     = `arch-${monster.fixedId}`;
        const isArchTempered = variant === 'ARCH_TEMPERED';

        card.innerHTML = `
            <h3>${monster.name[currentLanguage]}</h3>
            <p style="margin:2px 0;font-size:0.85em;color:var(--text-dim);">ID : ${monster.fixedId}</p>
            <p style="margin:2px 0;font-size:0.85em;color:var(--text-dim);">Label : ${monster.label}</p>
            <div class="monster-controls">
                ${canBeAT
                    ? `<label for="${checkboxId}" style="color:var(--at-h);">
                           <input type="checkbox" id="${checkboxId}" ${isArchTempered ? 'checked' : ''}>
                           Alpha Suprême
                       </label>`
                    : `<span style="font-size:0.75em;color:var(--text-dim);font-style:italic;">Alpha uniquement</span>`
                }
            </div>
        `;

        // Clic sur la carte (hors case à cocher) : toggle de la sélection
        card.addEventListener('click', function (e) {
            // Ignorer si le clic vient de la case à cocher ou de son libellé
            if (e.target.type === 'checkbox' || e.target.tagName === 'LABEL' || e.target.closest('label')) return;

            const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
            if (sel) {
                // Désélectionner le monstre
                selectedMonsters.splice(selectedMonsters.indexOf(sel), 1);
                card.classList.remove('selected', 'alpha', 'arch-tempered');
                const cb = card.querySelector('input[type="checkbox"]');
                if (cb) cb.checked = false;
            } else {
                // Sélectionner le monstre avec la variante courante de la case
                const cb         = card.querySelector('input[type="checkbox"]');
                const newVariant = cb && cb.checked ? 'ARCH_TEMPERED' : 'TEMPERED';
                selectedMonsters.push({ ...monster, variant: newVariant });
                card.classList.add('selected');
                applyVariantClass(card, newVariant);
            }
            updateMonsterPreview();
        });

        // Changement de la case à cocher : basculer entre TEMPERED et ARCH_TEMPERED
        const cb = card.querySelector('input[type="checkbox"]');
        if (cb) {
            cb.addEventListener('change', function (e) {
                e.stopPropagation();
                const newVariant = this.checked ? 'ARCH_TEMPERED' : 'TEMPERED';
                const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
                if (sel) {
                    sel.variant = newVariant;
                } else {
                    // Auto-sélection si la case est cochée sans sélection préalable
                    selectedMonsters.push({ ...monster, variant: newVariant });
                    card.classList.add('selected');
                }
                applyVariantClass(card, newVariant);
                updateMonsterPreview();
            });
        }

        monsterList.appendChild(card);
    });
}

/**
 * Applique la classe CSS de variante (alpha ou arch-tempered) à une carte monstre.
 * @param {HTMLElement} card    - L'élément carte du monstre.
 * @param {string}      variant - La variante : 'TEMPERED' ou 'ARCH_TEMPERED'.
 */
function applyVariantClass(card, variant) {
    card.classList.remove('alpha', 'arch-tempered');
    if (variant === 'ARCH_TEMPERED') card.classList.add('arch-tempered');
    else card.classList.add('alpha');
}

/* ── Filtrage ─────────────────────────────────────────────── */

/**
 * Filtre les cartes monstres affichées selon un terme de recherche.
 * La recherche porte sur le nom, l'ID et le label du monstre.
 * @param {string} searchTerm - Le terme de recherche (en minuscules).
 */
function filterMonsters(searchTerm) {
    document.querySelectorAll('.monster-card').forEach(card => {
        const name  = card.querySelector('h3').textContent.toLowerCase();
        const id    = card.dataset.monsterId;
        const label = card.dataset.monsterLabel.toLowerCase();

        card.style.display = (name.includes(searchTerm) || id.includes(searchTerm) || label.includes(searchTerm))
            ? 'block'
            : 'none';
    });
}

/* ── Prévisualisation ─────────────────────────────────────── */

/**
 * Met à jour le bloc de prévisualisation des monstres sélectionnés.
 * Affiche leur nom dans la langue courante ainsi que leur variante.
 */
function updateMonsterPreview() {
    const preview = document.getElementById('monster-preview');
    if (!preview) return;

    if (selectedMonsters.length === 0) {
        preview.innerHTML = '<h3>Monstres sélectionnés :</h3><p>Aucun monstre sélectionné</p>';
        return;
    }

    try {
        let html = '<h3>Monstres sélectionnés :</h3><ol>';

        selectedMonsters.forEach(monster => {
            const name  = monster.name && monster.name[currentLanguage] ? monster.name[currentLanguage] : 'Monstre inconnu';
            const badge = monster.variant === 'ARCH_TEMPERED'
                ? '<span class="badge-arch-tempered">Alpha Suprême</span>'
                : '';
            html += `<li>${name}${badge} <span style="color:#888;font-size:0.85em">(${monster.label})</span></li>`;
        });

        html += '</ol>';
        preview.innerHTML = html;
    } catch (error) {
        console.error("Erreur lors de la mise à jour de l'aperçu des monstres :", error);
        preview.innerHTML = '<h3>Monstres sélectionnés :</h3><p>Erreur d\'affichage des monstres</p>';
    }
}

/**
 * Basculer la sélection d'un monstre (ajout ou suppression).
 * (Fonction utilitaire conservée pour compatibilité.)
 * @param {Object} monster - L'objet monstre à basculer.
 */
function toggleMonsterSelection(monster) {
    const index = selectedMonsters.findIndex(m => m.fixedId === monster.fixedId);
    if (index === -1) {
        selectedMonsters.push(monster);
    } else {
        selectedMonsters.splice(index, 1);
    }
    updateMonsterPreview();
}
