/* ============================================================
   monsters.js – Gestion de la liste et de la sélection des monstres
   ============================================================ */

/**
 * IDs des monstres disposant d'une version Alpha Suprême (LegendaryID = KING).
 * Rey Dau, Uth Duna, Nu Udra, Arkveld.
 */
const ARCH_TEMPERED_IDS = new Set([-1547364608, 1467998976, 1657778432, 746996864, 1553456768]);

/**
 * IDs des monstres exclusifs aux Cimes gelées (st402).
 * Jin Dahaad et Oméga Planetikos ne fonctionnent que dans cette zone.
 */
const FROZEN_PEAKS_ONLY_IDS = new Set([1553456768, 21849]);

/** Valeur de l'ID de zone pour les Cimes gelées. */
const FROZEN_PEAKS_LOCATION = '544388992';

/** Nombre maximum d'exemplaires d'un même monstre autorisé par quête. */
const MAX_MONSTER_COUNT = 5;

/* ── Affichage de la liste ────────────────────────────────── */

/**
 * (Re)génère toutes les cartes monstres dans le conteneur #monster-list.
 * Prend en compte la langue courante et les sélections existantes.
 */
function populateMonsterList() {
    const monsterList = document.getElementById('monster-list');
    if (!monsterList) return;

    monsterList.innerHTML = '';

    const currentLocation = document.getElementById('questLocation')?.value ?? '';

    enemiesData.forEach(monster => {
        // Ignorer les monstres sans nom dans la langue courante
        if (!monster.name || !monster.name[currentLanguage]) return;

        // Vérifier si ce monstre est réservé aux Cimes gelées
        const isFrozenOnly  = FROZEN_PEAKS_ONLY_IDS.has(monster.fixedId);
        const isZoneInvalid = isFrozenOnly && currentLocation !== FROZEN_PEAKS_LOCATION;

        const card = document.createElement('div');
        card.className = 'monster-card';
        card.dataset.monsterId    = monster.fixedId;
        card.dataset.monsterLabel = monster.label;

        if (isZoneInvalid) {
            card.classList.add('zone-locked');
        }

        // Récupérer la sélection existante pour ce monstre
        const existingSelection = selectedMonsters.find(m => m.fixedId === monster.fixedId);
        const canBeAT = ARCH_TEMPERED_IDS.has(monster.fixedId);

        // Si le monstre n'a pas de version AT et était marqué AT, repasser en TEMPERED
        if (existingSelection && existingSelection.variant === 'ARCH_TEMPERED' && !canBeAT) {
            existingSelection.variant = 'TEMPERED';
        }

        // Défaut : NONE (monstre standard non-alpha)
        const variant      = existingSelection ? (existingSelection.variant || 'NONE') : 'NONE';
        const currentCount = existingSelection ? (existingSelection.count || 1) : 1;
        const isSelected   = !!existingSelection;

        // Appliquer les classes visuelles si déjà sélectionné
        if (isSelected) {
            card.classList.add('selected');
            applyVariantClass(card, variant);
        }

        const cbAlphaId  = `alpha-${monster.fixedId}`;
        const cbATId     = `arch-${monster.fixedId}`;
        const counterId  = `count-${monster.fixedId}`;
        const isAlpha        = variant === 'TEMPERED';
        const isArchTempered = variant === 'ARCH_TEMPERED';

        // ── Zone de spawn ──────────────────────────────────
        // Déterminer les zones disponibles pour la région courante
        const spawnZones      = LOCATION_SPAWN_ZONES[currentLocation] ?? null;
        const hasSpawnChoice  = spawnZones && spawnZones.length > 1;
        // Zone déjà stockée sur ce monstre, ou zone par défaut de la région
        const currentSpawnZone = existingSelection?.spawnZone ?? getDefaultSpawnZone(currentLocation);

        // Récupérer les étoiles stockées sur ce monstre (défaut : 5 pour les variants)
        card.innerHTML = `
            <h3>${monster.name[currentLanguage]}</h3>
            <p style="margin:2px 0;font-size:0.85em;color:var(--text-dim);">ID : ${monster.fixedId}</p>
            <p style="margin:2px 0;font-size:0.85em;color:var(--text-dim);">Label : ${monster.label}</p>
            ${isZoneInvalid ? `
            <p class="zone-locked-msg">⛔ Uniquement disponible en zone <strong>Cimes gelées</strong></p>
            ` : `
            <div class="monster-controls">
                <label for="${cbAlphaId}" style="color:var(--alpha-h);">
                    <input type="checkbox" id="${cbAlphaId}" class="cb-alpha" ${isAlpha || isArchTempered ? 'checked' : ''}>
                    Alpha
                </label>
                ${canBeAT
                    ? `<label for="${cbATId}" style="color:var(--at-h);">
                           <input type="checkbox" id="${cbATId}" class="cb-at" ${isArchTempered ? 'checked' : ''} ${isAlpha || isArchTempered ? '' : 'disabled'}>
                           Alpha Suprême
                       </label>`
                    : ''
                }
            </div>
            ${hasSpawnChoice ? `
            <div class="spawn-zone-control ${isSelected ? 'visible' : ''}" id="spawn-ctrl-${monster.fixedId}">
                <label class="spawn-zone-label" for="spawn-${monster.fixedId}">Zone de départ :</label>
                <select class="spawn-zone-select" id="spawn-${monster.fixedId}">
                    ${spawnZones.map(z => `<option value="${z}" ${z === currentSpawnZone ? 'selected' : ''}>${z}</option>`).join('')}
                </select>
            </div>
            ` : ''}
            <div class="monster-count-control ${isSelected ? 'visible' : ''}">
                <button class="count-btn count-minus" type="button">−</button>
                <span class="count-value" id="${counterId}">${currentCount}</span>
                <button class="count-btn count-plus" type="button">+</button>
                <span class="count-label">/ ${MAX_MONSTER_COUNT}</span>
            </div>
            `}
        `;

        /**
         * Calcule la variante en fonction de l'état des deux cases à cocher.
         * Alpha Suprême ne peut être coché que si Alpha est coché.
         */
        function _getVariantFromCheckboxes(card) {
            const cbA  = card.querySelector('.cb-alpha');
            const cbAT = card.querySelector('.cb-at');
            if (cbAT && cbAT.checked) return 'ARCH_TEMPERED';
            if (cbA  && cbA.checked)  return 'TEMPERED';
            return 'NONE';
        }

        // Clic sur la carte (hors contrôles interactifs) : toggle de la sélection
        card.addEventListener('click', function (e) {
            // Bloquer si le monstre est incompatible avec la zone sélectionnée
            if (isZoneInvalid) return;

            // Ignorer si le clic vient d'un contrôle interactif
            if (e.target.type === 'checkbox'
                || e.target.tagName === 'LABEL'
                || e.target.closest('label')
                || e.target.closest('.monster-count-control')) return;

            const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
            if (sel) {
                // Désélectionner le monstre et réinitialiser
                selectedMonsters.splice(selectedMonsters.indexOf(sel), 1);
                card.classList.remove('selected', 'alpha', 'arch-tempered');
                const cbA  = card.querySelector('.cb-alpha');
                const cbAT = card.querySelector('.cb-at');
                if (cbA)  { cbA.checked  = false; }
                if (cbAT) { cbAT.checked = false; cbAT.disabled = true; }
                _setCountControlVisible(card, false);
                _setSpawnZoneVisible(card, false);
                _setCountDisplay(card, monster.fixedId, 1);
            } else {
                // Sélectionner le monstre avec la variante lue depuis les cases
                const newVariant = _getVariantFromCheckboxes(card);
                const spawnSel   = card.querySelector('.spawn-zone-select');
                const spawnZone  = spawnSel ? parseInt(spawnSel.value) : getDefaultSpawnZone(document.getElementById('questLocation')?.value ?? '');
                selectedMonsters.push({ ...monster, variant: newVariant, count: 1, spawnZone });
                card.classList.add('selected');
                applyVariantClass(card, newVariant);
                _setCountControlVisible(card, true);
                _setSpawnZoneVisible(card, true);
            }
            updateMonsterPreview();
        });

        // Checkbox Alpha : active/désactive Alpha et met à jour la case AT
        const cbAlpha = card.querySelector('.cb-alpha');
        if (cbAlpha) {
            cbAlpha.addEventListener('change', function (e) {
                e.stopPropagation();
                const cbAT = card.querySelector('.cb-at');
                if (!this.checked) {
                    // Décocher alpha désactive aussi AT
                    if (cbAT) { cbAT.checked = false; cbAT.disabled = true; }
                } else {
                    if (cbAT) cbAT.disabled = false;
                }
                const newVariant = _getVariantFromCheckboxes(card);
                const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
                if (sel) {
                    sel.variant = newVariant;
                } else {
                    selectedMonsters.push({ ...monster, variant: newVariant, count: 1 });
                    card.classList.add('selected');
                    _setCountControlVisible(card, true);
                }
                applyVariantClass(card, newVariant);
                updateMonsterPreview();
            });
        }

        // Checkbox Alpha Suprême : uniquement si Alpha est coché
        const cbAT = card.querySelector('.cb-at');
        if (cbAT) {
            cbAT.addEventListener('change', function (e) {
                e.stopPropagation();
                const newVariant = _getVariantFromCheckboxes(card);
                const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
                if (sel) {
                    sel.variant = newVariant;
                } else {
                    selectedMonsters.push({ ...monster, variant: newVariant, count: 1, stars: 5 });
                    card.classList.add('selected');
                    _setCountControlVisible(card, true);
                }
                applyVariantClass(card, newVariant);
                updateMonsterPreview();
            });
        }

        // Sélecteur de zone de spawn : mémorise la zone choisie sur le monstre
        const spawnSelect = card.querySelector('.spawn-zone-select');
        if (spawnSelect) {
            // Bloquer la propagation du clic pour ne pas déclencher le toggle de la carte
            spawnSelect.addEventListener('click', e => e.stopPropagation());
            spawnSelect.addEventListener('change', function (e) {
                e.stopPropagation();
                const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
                const zone = parseInt(this.value);
                if (sel) {
                    sel.spawnZone = zone;
                }
            });
        }

        // Bouton « − » : décrémenter le compteur (minimum 1) — absent sur les cartes zone-locked
        card.querySelector('.count-minus')?.addEventListener('click', function (e) {
            e.stopPropagation();
            const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
            if (!sel) return;
            if (sel.count > 1) {
                sel.count--;
                _setCountDisplay(card, monster.fixedId, sel.count);
                updateMonsterPreview();
            }
        });

        // Bouton « + » : incrémenter le compteur (maximum MAX_MONSTER_COUNT) — absent sur les cartes zone-locked
        card.querySelector('.count-plus')?.addEventListener('click', function (e) {
            e.stopPropagation();
            const sel = selectedMonsters.find(m => m.fixedId === monster.fixedId);
            if (!sel) return;
            if (sel.count < MAX_MONSTER_COUNT) {
                sel.count++;
                _setCountDisplay(card, monster.fixedId, sel.count);
                updateMonsterPreview();
            }
        });

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
    else if (variant === 'TEMPERED')  card.classList.add('alpha');
    // NONE : pas de classe supplémentaire (style sélectionné standard)
}

/* ── Fonctions internes ───────────────────────────────────── */

/**
 * Affiche ou masque le contrôle de quantité d'une carte.
 * @param {HTMLElement} card    - La carte monstre.
 * @param {boolean}     visible - true pour afficher, false pour masquer.
 */
function _setCountControlVisible(card, visible) {
    const ctrl = card.querySelector('.monster-count-control');
    if (ctrl) ctrl.classList.toggle('visible', visible);
}

/**
 * Affiche ou masque le contrôle de zone de spawn d'une carte.
 * @param {HTMLElement} card    - La carte monstre.
 * @param {boolean}     visible - true pour afficher, false pour masquer.
 */
function _setSpawnZoneVisible(card, visible) {
    const ctrl = card.querySelector('.spawn-zone-control');
    if (ctrl) ctrl.classList.toggle('visible', visible);
}

/**
 * Met à jour l'affichage du compteur dans une carte.
 * @param {HTMLElement} card      - La carte monstre.
 * @param {number}      fixedId   - L'ID du monstre (pour cibler le bon span).
 * @param {number}      count     - La nouvelle valeur à afficher.
 */
function _setCountDisplay(card, fixedId, count) {
    const span = card.querySelector(`#count-${fixedId}`);
    if (span) span.textContent = count;
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
 * Affiche leur nom, leur variante et leur quantité dans la langue courante.
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
                : monster.variant === 'TEMPERED'
                    ? '<span class="badge-alpha">Alpha</span>'
                    : '';
            const count = monster.count && monster.count > 1
                ? ` <span style="color:var(--accent);font-size:0.85em;">×${monster.count}</span>`
                : '';
            html += `<li>${name}${badge}${count} <span style="color:#888;font-size:0.85em">(${monster.label})</span></li>`;
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
        selectedMonsters.push({ ...monster, count: 1 });
    } else {
        selectedMonsters.splice(index, 1);
    }
    updateMonsterPreview();
}
