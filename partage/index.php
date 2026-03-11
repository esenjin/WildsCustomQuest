<?php
/* ============================================================
   index.php – Hub de partage de quêtes MHWilds
   Page principale : liste des quêtes + interface admin
   ============================================================ */

require_once __DIR__ . '/config.php';
session_name(SESSION_NAME);
session_start();
$isAdmin = !empty($_SESSION['admin']);
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hub de quêtes – Monster Hunter Wilds</title>
    <link rel="icon" type="image/x-icon" href="../favicon.ico">
    <meta name="description" content="Regarde et télécharge les quêtes personnalisées créées par la communauté pour Monster Hunter Wilds. Partage ta propre quête et découvre celles des autres chasseurs !">
	<meta property="og:image" content="../logo.png">
    <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>

<div class="hub-wrapper">

    <!-- ── En-tête ─────────────────────────────────────────── -->
    <header class="hub-header">
        <div class="hub-header-left">
            <div class="hub-breadcrumb">
                <a href="../index.html">⬅ Générateur de quêtes</a> › Hub communautaire
            </div>
            <h1 class="hub-title">Comptoir des quêtes</h1>
            <p class="hub-subtitle">Quêtes personnalisées partagées par la communauté</p>
        </div>
        <div class="hub-header-actions">
            <?php if ($isAdmin): ?>
                <span class="admin-badge">⚙ Admin</span>
                <button class="btn btn-secondary btn-sm" id="btnLogout">Déconnexion</button>
            <?php else: ?>
                <button class="btn btn-ghost btn-sm" id="btnShowLogin" title="Accès administrateur">⚙</button>
            <?php endif; ?>
            <a href="soumettre.php" class="btn btn-primary">✦ Soumettre une quête</a>
        </div>
    </header>

    <!-- ── Tabs principaux ─────────────────────────────────── -->
    <div class="main-tabs">
        <button class="main-tab active" data-tab="quests">Quêtes communautaires</button>
        <?php if ($isAdmin): ?>
            <button class="main-tab" data-tab="pending">
                Quêtes en attente
                <span class="pending-badge" id="pendingBadge" style="display:none"></span>
            </button>
        <?php endif; ?>
    </div>

    <!-- ══════════════════════════════════════════════════════
         ONGLET : QUÊTES COMMUNAUTAIRES
         ══════════════════════════════════════════════════════ -->
    <div class="tab-panel active" id="tab-quests">

        <!-- Recherche & filtres -->
        <section class="search-section">
            <div class="search-row">
                <div class="search-input-wrap">
                    <span class="search-icon">🔍</span>
                    <input type="search" id="searchInput" class="search-input"
                           placeholder="Titre, description, auteur, monstre…"
                           autocomplete="off" spellcheck="false">
                </div>
                <div class="search-actions">
                    <button class="btn btn-secondary" id="btnReset">↺ Réinitialiser</button>
                </div>
            </div>
            <div class="filters-grid">
                <div class="filter-group">
                    <label class="filter-label" for="filterLevel">Niveau</label>
                    <select id="filterLevel" class="filter-select">
                        <option value="">Tous</option>
                        <?php foreach ([1,2,3,4,5,6,7,8,9,10] as $l): ?>
                            <option value="<?= $l ?>"><?= str_repeat('★',$l) ?> (<?= $l ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterMonster">Monstre</label>
                    <select id="filterMonster" class="filter-select">
                        <option value="">Tous</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterZone">Zone</label>
                    <select id="filterZone" class="filter-select">
                        <option value="">Toutes</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterPlayers">Joueurs</label>
                    <select id="filterPlayers" class="filter-select">
                        <option value="">Tous</option>
                        <option value="1">Solo</option>
                        <option value="2">Duo</option>
                        <option value="3">Trio</option>
                        <option value="4">Quatuor</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterAuthor">Auteur</label>
                    <input type="text" id="filterAuthor" class="filter-input" placeholder="Pseudo…">
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterMaxDeaths">💀 max</label>
                    <input type="number" id="filterMaxDeaths" class="filter-input" placeholder="Ex : 3" min="1">
                </div>
                <div class="filter-group">
                    <label class="filter-label" for="filterMaxTime">⏱ max (minutes)</label>
                    <input type="number" id="filterMaxTime" class="filter-input" placeholder="Ex : 50" min="1">
                </div>
            </div>
        </section>

        <!-- Méta + tri -->
        <div class="results-meta">
            <p class="results-count" id="resultsCount">Chargement…</p>
            <div class="sort-control">
                <label for="sortSelect">Trier par</label>
                <select id="sortSelect" class="sort-select">
                    <option value="recent">Plus récentes</option>
                    <option value="oldest">Plus anciennes</option>
                    <option value="level-d">Niveau ↓</option>
                    <option value="level-a">Niveau ↑</option>
                    <option value="title">Titre A–Z</option>
                </select>
            </div>
        </div>

        <!-- Grille -->
        <main id="questGrid" class="quest-grid" aria-live="polite">
            <div class="state-message"><span class="spinner"></span>Chargement…</div>
        </main>

    </div><!-- /tab-quests -->

    <?php if ($isAdmin): ?>
    <!-- ══════════════════════════════════════════════════════
         ONGLET ADMIN : EN ATTENTE
         ══════════════════════════════════════════════════════ -->
    <div class="tab-panel" id="tab-pending">
        <div class="admin-panel-header">
            <h2 class="admin-panel-title">⏳ Quêtes en attente de validation</h2>
            <button class="btn btn-secondary btn-sm" id="btnRefreshPending">↺ Actualiser</button>
        </div>
        <div id="pendingList" class="pending-list">
            <div class="state-message"><span class="spinner"></span>Chargement…</div>
        </div>
    </div>
    <?php endif; ?>

</div><!-- /hub-wrapper -->

<!-- ── Pied de page ─────────────────────────────────────────── -->
<footer class="hub-footer">
    <span class="hub-footer-label">Ressources</span>
    <nav class="hub-footer-links">
        <a href="https://git.crystalyx.net/Esenjin_Asakha/WildsQuetesPerso/wiki/Hub-communautaire"
           target="_blank" rel="noopener" class="hub-footer-link">
            📖 Infos &amp; Guide
        </a>
        <span class="hub-footer-sep">·</span>
        <a href="https://git.crystalyx.net/Esenjin_Asakha/WildsQuetesPerso/wiki/FAQ"
           target="_blank" rel="noopener" class="hub-footer-link">
            ❓ FAQ
        </a>
    </nav>
</footer>

<!-- ════════════════════════════════════════════════════════
     MODAL DÉTAIL DE QUÊTE
     ════════════════════════════════════════════════════════ -->
<div id="modalOverlay" class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
        <div id="modalBanner" class="modal-banner"></div>
        <div class="modal-header">
            <div class="modal-header-left">
                <div class="modal-type-badge">⚔ Quête Événement · Chasse</div>
                <h2 class="modal-title" id="modalTitle"></h2>
                <div id="modalClient" class="modal-client"></div>
                <div class="modal-stars" id="modalStars"></div>
            </div>
            <button class="modal-close" id="modalClose" aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body">
            <div class="modal-section">
                <div class="modal-section-title">Description</div>
                <p class="modal-desc" id="modalDesc"></p>
            </div>
            <div class="modal-section">
                <div class="modal-section-title">Informations</div>
                <div class="modal-info-grid">
                    <div class="modal-info-cell">
                        <div class="modal-info-cell-label">Zone</div>
                        <div class="modal-info-cell-value accent" id="modalZone"></div>
                    </div>
                    <div class="modal-info-cell">
                        <div class="modal-info-cell-label">Temps limite</div>
                        <div class="modal-info-cell-value" id="modalTime"></div>
                    </div>
                    <div class="modal-info-cell">
                        <div class="modal-info-cell-label">Prime</div>
                        <div class="modal-info-cell-value accent" id="modalMoney"></div>
                    </div>
                    <div class="modal-info-cell">
                        <div class="modal-info-cell-label">Puissance des monstres</div>
                        <div class="modal-info-cell-value" id="modalMonsterStars"></div>
                    </div>
                </div>
                <div id="modalSequential" style="display:none; margin-top:10px;">
                    <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(var(--accent-rgb,200,140,60),0.12); border:1px solid rgba(var(--accent-rgb,200,140,60),0.35); border-radius:6px; color:var(--accent); font-size:.88em; font-weight:600;">
                        ⚔ Mode séquentiel — les monstres apparaissent l'un après l'autre
                    </span>
                </div>
            </div>
            <div class="modal-section">
                <div class="modal-section-title">Conditions &amp; Échec</div>
                <div class="modal-conditions">
                    <div class="modal-cond-block">
                        <div class="modal-cond-block-title cond-ok">✓ Conditions</div>
                        <ul class="modal-cond-list">
                            <li id="modalRC"></li>
                            <li id="modalPlayers"></li>
                        </ul>
                    </div>
                    <div class="modal-cond-block">
                        <div class="modal-cond-block-title cond-fail">✗ Échec</div>
                        <ul class="modal-cond-list">
                            <li>Temps imparti écoulé</li>
                            <li id="modalDeaths"></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="modal-section">
                <div class="modal-section-title">Monstres à chasser</div>
                <div class="modal-monsters-list" id="modalMonsters"></div>
            </div>
            <div class="modal-section">
                <div class="modal-section-title">Récompenses</div>
                <div class="modal-rewards-list" id="modalRewards"></div>
            </div>
            <div class="modal-author-row">
                <span>Proposée par <span class="modal-author-name" id="modalAuthor"></span></span>
                <a id="modalDownload" href="#" class="btn btn-primary" download>⬇ Télécharger</a>
            </div>
            <?php if ($isAdmin): ?>
            <div class="modal-admin-actions" id="modalAdminActions" style="display:none">
                <hr style="border-color:var(--border);margin:0">
                <div style="display:flex;gap:10px;padding-top:4px;flex-wrap:wrap">
                    <button class="btn btn-danger btn-sm" id="btnAdminDelete">🗑 Supprimer cette quête</button>
                </div>
            </div>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- ════════════════════════════════════════════════════════
     MODAL LOGIN ADMIN
     ════════════════════════════════════════════════════════ -->
<?php if (!$isAdmin): ?>
<div id="loginOverlay" class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal" style="max-width:380px">
        <div class="modal-banner" style="background:linear-gradient(90deg,var(--blue),var(--blue-h))"></div>
        <div class="modal-header">
            <div class="modal-header-left">
                <div class="modal-type-badge">Accès restreint</div>
                <h2 class="modal-title">Administration</h2>
            </div>
            <button class="modal-close" id="loginClose">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label" for="loginInput">Identifiant</label>
                <input type="text" id="loginInput" class="form-input" autocomplete="username">
            </div>
            <div class="form-group">
                <label class="form-label" for="passwordInput">Mot de passe</label>
                <input type="password" id="passwordInput" class="form-input" autocomplete="current-password">
            </div>
            <div id="loginError" class="login-error" style="display:none"></div>
            <div style="margin-top:16px">
                <button class="btn btn-primary" id="btnLogin" style="width:100%">Se connecter</button>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<!-- ── Scripts ─────────────────────────────────────────────── -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>const IS_ADMIN = <?= $isAdmin ? 'true' : 'false' ?>;</script>
<script src="assets/js/hub.js"></script>

</body>
</html>