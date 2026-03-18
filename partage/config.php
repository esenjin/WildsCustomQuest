<?php
/* ============================================================
   config.php – Configuration du hub de partage de quêtes
   ⚠️  NE PAS VERSIONNER CE FICHIER — ajouté au .gitignore
   ============================================================ */

/* ── Fichier de stockage des utilisateurs ────────────────── */
// users.json est créé automatiquement au premier lancement
// Structure : [{ "login": "...", "password": "<bcrypt>", "role": "admin"|"modo", "displayName": "..." }]
define('USERS_FILE', __DIR__ . '/users.json');

/* ── Fichier de logs de modération ───────────────────────── */
// logs.json est créé automatiquement à la première action loggée
// Structure : [{ "at": <timestamp>, "login": "...", "displayName": "...", "action": "...", "filename": "...", "questId": ... }]
define('LOGS_FILE', __DIR__ . '/logs.json');

/* ── Fichier de signalements ─────────────────────────────── */
// reports.json est créé automatiquement au premier signalement
// Structure : [{ "id": "<uuid>", "at": <timestamp>, "filename": "...", "questId": ..., "questTitle": "...", "reason": "broken|unreachable|cheat", "comment": "...", "ip": "..." }]
define('REPORTS_FILE', __DIR__ . '/reports.json');

/* ── Compte admin par défaut (premier lancement uniquement) ─ */
// Ces valeurs ne servent qu'à initialiser users.json s'il n'existe pas encore.
// Une fois créé, modifiez votre profil via l'interface.
define('DEFAULT_ADMIN_LOGIN',    'admin');
define('DEFAULT_ADMIN_PASSWORD', 'changeme'); // sera hashé automatiquement

/* ── Chemins ─────────────────────────────────────────────── */
define('BASE_DIR',    __DIR__ . '/base/');
define('ATTENTE_DIR', __DIR__ . '/base/attente/');
define('VIP_DIR',         __DIR__ . '/base/vip/');
define('VIP_ATTENTE_DIR', __DIR__ . '/base/vip/attente/');
// Chemin vers enemies.json — cherche d'abord datas/, puis la racine
define('ENEMIES_JSON', (function() {
    $candidates = [
        __DIR__ . '/../datas/enemies.json',
        __DIR__ . '/../enemies.json',
    ];
    foreach ($candidates as $p) {
        if (file_exists($p)) return $p;
    }
    return $candidates[0];
})());

/* ── Contraintes ─────────────────────────────────────────── */
define('MAX_ZIP_SIZE', 2 * 1024 * 1024); // 2 Mo

/* ── Session ─────────────────────────────────────────────── */
define('SESSION_NAME', 'mhw_hub_admin');
/* ── Version de l'outil ──────────────────────────────────── */
define('APP_VERSION',      '2.3.5');
define('APP_VERSION_NAME', 'Le Gelidron chétif');
