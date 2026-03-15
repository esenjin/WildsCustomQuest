<?php
/* ============================================================
   api.php – Endpoints AJAX du hub
   Actions disponibles (POST, champ "action") :
     login              Connexion
     logout             Déconnexion
     check_session      Vérifie session + rôle
     upload             Upload d'un ZIP en attente
     admin_validate     Valider un ZIP en attente → base/
     admin_refuse       Refuser (supprimer) un ZIP en attente
     admin_delete       Supprimer un ZIP validé
     list_quests        Liste les quêtes validées (JSON)
     list_pending       Liste les quêtes en attente (JSON, auth)
     list_moderators    Liste des modérateurs (admin)
     create_moderator   Créer un modérateur (admin)
     update_moderator   Modifier un modérateur (admin)
     delete_moderator   Supprimer un modérateur (admin)
     update_profile     Modifier son propre profil (auth)
     check_duplicate    Vérifie doublon d'ID
     check_monsters     Vérifie les IDs de monstres
   ============================================================ */

require_once __DIR__ . '/config.php';

session_name(SESSION_NAME);
session_start();

header('Content-Type: application/json; charset=utf-8');

/* ══════════════════════════════════════════════════════════
   GESTION DES UTILISATEURS (users.json)
   ══════════════════════════════════════════════════════════ */

/**
 * Charge users.json depuis le disque.
 * Pas de cache statique : on relit toujours le fichier pour éviter
 * toute donnée périmée après une écriture dans la même requête.
 */
function loadUsers(): array {
    if (!file_exists(USERS_FILE)) {
        $users = [[
            'login'       => DEFAULT_ADMIN_LOGIN,
            'password'    => password_hash(DEFAULT_ADMIN_PASSWORD, PASSWORD_BCRYPT),
            'role'        => 'admin',
            'displayName' => DEFAULT_ADMIN_LOGIN,
        ]];
        saveUsers($users);
        return $users;
    }
    $raw = file_get_contents(USERS_FILE);
    if ($raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Écrit users.json de manière atomique via un fichier temporaire + rename().
 * Évite toute troncature en cas d'erreur d'écriture.
 * N'utilise JAMAIS de références (&) sur le tableau passé.
 */
function saveUsers(array $users): void {
    $json = json_encode(
        array_values($users),
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    $tmp = USERS_FILE . '.tmp.' . getmypid();
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        @unlink($tmp);
        fail('Impossible d\'écrire users.json (droits ?).');
    }
    if (!rename($tmp, USERS_FILE)) {
        @unlink($tmp);
        fail('Impossible de finaliser l\'écriture de users.json.');
    }
}

/**
 * Cherche un utilisateur par login. Relit toujours depuis le disque.
 */
function findUser(string $login): ?array {
    foreach (loadUsers() as $u) {
        if ($u['login'] === $login) return $u;
    }
    return null;
}

/* ── Helpers réponse ─────────────────────────────────────── */
function ok(array $data = []): void {
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 422): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function requireAuth(): void {
    if (empty($_SESSION['login'])) fail('Non autorisé.', 403);
}

function requireAdmin(): void {
    if (empty($_SESSION['login']) || ($_SESSION['role'] ?? '') !== 'admin')
        fail('Réservé à l\'administrateur.', 403);
}

/**
 * Valide la complexité d'un mot de passe.
 * Règles : 12 caractères min, au moins 1 lettre, 1 chiffre, 1 caractère spécial.
 * Appelle fail() si invalide.
 */
function validatePassword(string $pass): void {
    if (strlen($pass) < 12)
        fail('Mot de passe trop court (12 caractères minimum).');
    if (!preg_match('/[a-zA-Z]/', $pass))
        fail('Le mot de passe doit contenir au moins une lettre.');
    if (!preg_match('/[0-9]/', $pass))
        fail('Le mot de passe doit contenir au moins un chiffre.');
    if (!preg_match('/[^a-zA-Z0-9]/', $pass))
        fail('Le mot de passe doit contenir au moins un caractère spécial.');
}

/* ── Routing ─────────────────────────────────────────────── */
$action = $_POST['action'] ?? $_GET['action'] ?? '';

match ($action) {
    'login'             => actionLogin(),
    'logout'            => actionLogout(),
    'check_session'     => actionCheckSession(),
    'upload'            => actionUpload(),
    'admin_validate'    => actionAdminValidate(),
    'admin_refuse'      => actionAdminRefuse(),
    'admin_delete'      => actionAdminDelete(),
    'list_quests'       => actionListQuests(),
    'list_pending'      => actionListPending(),
    'list_moderators'   => actionListModerators(),
    'create_moderator'  => actionCreateModerator(),
    'update_moderator'  => actionUpdateModerator(),
    'delete_moderator'  => actionDeleteModerator(),
    'update_profile'    => actionUpdateProfile(),
    'list_logs'         => actionListLogs(),
    'clear_logs'        => actionClearLogs(),
    'check_duplicate'   => actionCheckDuplicate(),
    'check_monsters'    => actionCheckMonsters(),
    'admin_edit_quest'  => actionAdminEditQuest(),
    'get_warnings'      => actionGetWarnings(),
    'version'           => actionVersion(),
    'report_quest'      => actionReportQuest(),
    'list_reports'      => actionListReports(),
    'dismiss_report'    => actionDismissReport(),
    'delete_reported'   => actionDeleteReported(),
    default             => fail('Action inconnue.', 400),
};

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */

function actionLogin(): void {
    $login = trim($_POST['login'] ?? '');
    $pass  = $_POST['password'] ?? '';

    if ($login === '') fail('Identifiant requis.');

    $user = findUser($login);

    if ($user !== null && password_verify($pass, $user['password'])) {
        $_SESSION['login']       = $user['login'];
        $_SESSION['role']        = $user['role'];
        $_SESSION['displayName'] = $user['displayName'] ?? $user['login'];
        ok([
            'message'     => 'Connecté.',
            'role'        => $user['role'],
            'displayName' => $_SESSION['displayName'],
        ]);
    }

    sleep(1);
    fail('Identifiants incorrects.', 401);
}

function actionLogout(): void {
    session_destroy();
    ok(['message' => 'Déconnecté.']);
}

function actionCheckSession(): void {
    if (!empty($_SESSION['login'])) {
        ok([
            'authenticated' => true,
            'role'          => $_SESSION['role'] ?? 'modo',
            'login'         => $_SESSION['login'],
            'displayName'   => $_SESSION['displayName'] ?? $_SESSION['login'],
        ]);
    }
    ok(['authenticated' => false]);
}

/* ══════════════════════════════════════════════════════════
   GESTION DES MODÉRATEURS (admin uniquement)
   ══════════════════════════════════════════════════════════ */

function actionListModerators(): void {
    requireAdmin();
    $users = loadUsers();
    $list  = array_map(fn($u) => [
        'login'       => $u['login'],
        'role'        => $u['role'],
        'displayName' => $u['displayName'] ?? $u['login'],
    ], $users);
    ok(['users' => $list]);
}

function actionCreateModerator(): void {
    requireAdmin();

    $login       = trim($_POST['login'] ?? '');
    $pass        = $_POST['password'] ?? '';
    $displayName = trim($_POST['displayName'] ?? '');

    if (!preg_match('/^[a-zA-Z0-9_-]{2,30}$/', $login))
        fail('Identifiant invalide (2–30 caractères alphanumériques, - ou _).');
    validatePassword($pass);
    if ($displayName === '') $displayName = $login;
    if (strlen($displayName) > 30)
        fail('Nom d\'affichage trop long (30 max).');

    $users = loadUsers();
    foreach ($users as $u) {
        if ($u['login'] === $login) fail('Cet identifiant est déjà utilisé.');
    }

    // Construction du nouvel utilisateur dans une variable locale propre
    $newUser = [
        'login'       => $login,
        'password'    => password_hash($pass, PASSWORD_BCRYPT),
        'role'        => 'modo',
        'displayName' => $displayName,
    ];

    $users[] = $newUser;
    saveUsers($users);

    ok(['message' => "Modérateur « {$login} » créé."]);
}

function actionUpdateModerator(): void {
    requireAdmin();

    $login       = trim($_POST['login'] ?? '');
    $newPass     = $_POST['password'] ?? '';
    $displayName = trim($_POST['displayName'] ?? '');

    if ($login === '') fail('Identifiant requis.');

    $users    = loadUsers();
    $newUsers = [];
    $found    = false;

    // Reconstruction du tableau sans références — copie de chaque entrée
    foreach ($users as $u) {
        if ($u['login'] === $login) {
            if ($u['role'] === 'admin')
                fail('Impossible de modifier le rôle de l\'administrateur.');
            $found = true;
            if ($displayName !== '') {
                if (strlen($displayName) > 30) fail('Nom d\'affichage trop long (30 max).');
                $u['displayName'] = $displayName;
            }
            if ($newPass !== '') {
                validatePassword($newPass);
                $u['password'] = password_hash($newPass, PASSWORD_BCRYPT);
            }
        }
        $newUsers[] = $u;
    }

    if (!$found) fail('Utilisateur introuvable.');
    saveUsers($newUsers);

    ok(['message' => "Modérateur « {$login} » mis à jour."]);
}

function actionDeleteModerator(): void {
    requireAdmin();

    $login = trim($_POST['login'] ?? '');
    if ($login === '') fail('Identifiant requis.');

    $users    = loadUsers();
    $newUsers = [];
    $found    = false;

    foreach ($users as $u) {
        if ($u['login'] === $login) {
            if ($u['role'] === 'admin') fail('Impossible de supprimer le compte administrateur.');
            $found = true;
            continue; // on n'ajoute pas cet utilisateur → suppression
        }
        $newUsers[] = $u;
    }

    if (!$found) fail('Utilisateur introuvable.');
    saveUsers($newUsers);

    ok(['message' => "Modérateur « {$login} » supprimé."]);
}

/* ══════════════════════════════════════════════════════════
   PROFIL (utilisateur connecté)
   ══════════════════════════════════════════════════════════ */

function actionUpdateProfile(): void {
    requireAuth();

    $currentLogin = $_SESSION['login'];
    $newLogin     = trim($_POST['newLogin'] ?? '');
    $newDisplay   = trim($_POST['displayName'] ?? '');
    $newPass      = $_POST['password'] ?? '';
    $currentPass  = $_POST['currentPassword'] ?? '';

    if ($currentPass === '') fail('Le mot de passe actuel est requis.');

    // Validation du nouvel identifiant si fourni
    if ($newLogin !== '') {
        if (!preg_match('/^[a-zA-Z0-9_-]{2,30}$/', $newLogin))
            fail('Identifiant invalide (2–30 caractères alphanumériques, - ou _).');
        if ($newLogin === $currentLogin) $newLogin = ''; // inchangé, on ignore
    }

    $users    = loadUsers();
    $newUsers = [];
    $found    = false;

    // Vérifier que le nouvel identifiant n'est pas déjà pris
    if ($newLogin !== '') {
        foreach ($users as $u) {
            if ($u['login'] === $newLogin)
                fail('Cet identifiant est déjà utilisé.');
        }
    }

    // Reconstruction du tableau sans références — copie de chaque entrée
    foreach ($users as $u) {
        if ($u['login'] === $currentLogin) {
            $found = true;

            if (!password_verify($currentPass, $u['password']))
                fail('Mot de passe actuel incorrect.');

            if ($newLogin !== '')    $u['login']       = $newLogin;
            if ($newDisplay !== '') {
                if (strlen($newDisplay) > 30) fail('Nom d\'affichage trop long (30 max).');
                $u['displayName'] = $newDisplay;
            }
            if ($newPass !== '') {
                validatePassword($newPass);
                $u['password'] = password_hash($newPass, PASSWORD_BCRYPT);
            }
        }
        $newUsers[] = $u;
    }

    if (!$found) fail('Utilisateur introuvable.');

    // On sauvegarde d'abord, on met à jour la session ensuite
    saveUsers($newUsers);

    if ($newLogin !== '')   $_SESSION['login']       = $newLogin;
    if ($newDisplay !== '') $_SESSION['displayName'] = $newDisplay;

    ok([
        'message'     => 'Profil mis à jour.',
        'login'       => $_SESSION['login'],
        'displayName' => $_SESSION['displayName'] ?? $_SESSION['login'],
    ]);
}

/* ══════════════════════════════════════════════════════════
   LOGS DE MODÉRATION
   ══════════════════════════════════════════════════════════ */

/**
 * Ajoute une entrée dans logs.json.
 * @param string $action   'validate' | 'refuse' | 'delete'
 * @param string $filename Nom du fichier de quête concerné
 */
function appendLog(string $action, string $filename): void {
    // Extraire questId depuis le nom de fichier (quest_<id>_<pseudo>.zip)
    $questId = null;
    if (preg_match('/^quest_(\d+)_/', $filename, $m)) {
        $questId = (int)$m[1];
    }

    $entry = [
        'at'          => time(),
        'login'       => $_SESSION['login']       ?? '?',
        'displayName' => $_SESSION['displayName'] ?? $_SESSION['login'] ?? '?',
        'action'      => $action,
        'filename'    => $filename,
        'questId'     => $questId,
    ];

    // Lecture avec verrou pour éviter les race conditions
    $fp = fopen(LOGS_FILE, 'c+');
    if (!$fp) return; // silencieux — le log ne doit jamais bloquer une action
    flock($fp, LOCK_EX);

    $raw  = stream_get_contents($fp);
    $logs = [];
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $logs = $decoded;
    }

    array_unshift($logs, $entry); // entrées les plus récentes en premier

    // Limiter à 500 entrées pour ne pas faire grossir le fichier indéfiniment
    if (count($logs) > 500) $logs = array_slice($logs, 0, 500);

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($logs, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    flock($fp, LOCK_UN);
    fclose($fp);
}

function actionListLogs(): void {
    requireAdmin();

    if (!file_exists(LOGS_FILE)) {
        ok(['logs' => []]);
    }

    $raw  = file_get_contents(LOGS_FILE);
    $logs = $raw ? (json_decode($raw, true) ?? []) : [];
    ok(['logs' => $logs]);
}

function actionClearLogs(): void {
    requireAdmin();
    if (file_exists(LOGS_FILE)) unlink(LOGS_FILE);
    ok(['message' => 'Historique vidé.']);
}



function actionUpload(): void {
    $pseudo = trim($_POST['pseudo'] ?? '');
    if ($pseudo === '') fail('Le pseudo est requis.');
    if (!preg_match('/^[a-zA-Z0-9]{1,15}$/', $pseudo))
        fail('Pseudo invalide (1–15 caractères alphanumériques uniquement).');

    if (empty($_FILES['questzip']) || $_FILES['questzip']['error'] !== UPLOAD_ERR_OK)
        fail(uploadErrMsg($_FILES['questzip']['error'] ?? UPLOAD_ERR_NO_FILE));

    $tmp  = $_FILES['questzip']['tmp_name'];
    $name = $_FILES['questzip']['name'];

    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'zip')
        fail('Le fichier doit être un .zip.');

    if (filesize($tmp) > MAX_ZIP_SIZE)
        fail('Le fichier dépasse la taille maximale (2 Mo).');

    $fh    = fopen($tmp, 'rb');
    $magic = fread($fh, 2);
    fclose($fh);
    if ($magic !== 'PK') fail('Le fichier n\'est pas un ZIP valide.');

    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) fail('Impossible d\'ouvrir le ZIP.');

    [$raw, $ext, $errs] = extractQuestData($zip);
    $zip->close();
    if ($errs) fail(implode(' | ', $errs));

    $questId = $raw['_DataList']['_MissionId']['_Value'] ?? null;
    if ($questId === null || (!is_int($questId) && !is_float($questId)))
        fail('ID de quête introuvable dans le ZIP.');
    $questId = (int)$questId;

    [$title] = findQuestTexts($raw);
    if ($title === '') fail('Le titre de la quête (FR) est vide dans le ZIP.');

    [$dupBase, $dupAttente] = checkDuplicateId($questId);
    if ($dupBase)    fail("L'ID #{$questId} est déjà présent dans le hub.");
    if ($dupAttente) fail("L'ID #{$questId} est déjà en attente de validation.");

    $targets = $raw['_BossZakoDataList']['_MainTargetDataList'] ?? [];
    if (empty($targets)) fail('Aucun monstre cible trouvé dans le ZIP.');

    $destName = sprintf('quest_%d_%s.zip', $questId, $pseudo);
    $destPath = ATTENTE_DIR . $destName;

    if (!is_dir(ATTENTE_DIR)) mkdir(ATTENTE_DIR, 0755, true);
    if (!move_uploaded_file($tmp, $destPath))
        fail('Impossible de sauvegarder le fichier sur le serveur.');

    // Sauvegarder les avertissements s'il y en a
    $warningsRaw = $_POST['warnings'] ?? '';
    if ($warningsRaw !== '') {
        $warnings = json_decode($warningsRaw, true);
        if (is_array($warnings) && !empty($warnings)) {
            $metaPath = ATTENTE_DIR . pathinfo($destName, PATHINFO_FILENAME) . '.meta.json';
            $meta = ['warnings' => array_values($warnings)];
            file_put_contents(
                $metaPath,
                json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }
    }

    ok([
        'filename' => $destName,
        'questId'  => $questId,
        'message'  => 'Quête soumise avec succès ! Elle sera vérifiée et ajoutée prochainement.',
    ]);
}

/* ══════════════════════════════════════════════════════════
   ACTIONS MODÉRATION (admin + modo)
   ══════════════════════════════════════════════════════════ */

function actionAdminValidate(): void {
    requireAuth();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $src = ATTENTE_DIR . $filename;
    $dst = BASE_DIR    . $filename;
    if (!file_exists($src)) fail('Fichier introuvable en attente.');
    if (!rename($src, $dst)) fail('Impossible de déplacer le fichier.');

    appendLog('validate', $filename);
    ok(['message' => "Quête « {$filename} » validée."]);
}

function actionAdminRefuse(): void {
    requireAuth();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $path = ATTENTE_DIR . $filename;
    if (!file_exists($path)) fail('Fichier introuvable.');
    unlink($path);

    // Supprimer aussi le fichier de méta-données s'il existe
    $metaPath = ATTENTE_DIR . pathinfo($filename, PATHINFO_FILENAME) . '.meta.json';
    if (file_exists($metaPath)) unlink($metaPath);

    appendLog('refuse', $filename);
    ok(['message' => "Quête « {$filename} » refusée et supprimée."]);
}

function actionAdminDelete(): void {
    requireAuth();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $path = BASE_DIR . $filename;
    if (!str_starts_with(realpath($path) ?: '', realpath(BASE_DIR)))
        fail('Chemin non autorisé.');
    if (is_dir($path)) fail('Opération non autorisée sur un dossier.');
    if (!file_exists($path)) fail('Fichier introuvable.');
    unlink($path);

    appendLog('delete', $filename);
    ok(['message' => "Quête « {$filename} » supprimée."]);
}

/* ══════════════════════════════════════════════════════════
   LISTES
   ══════════════════════════════════════════════════════════ */

function actionListQuests(): void {
    $quests = readQuestDir(BASE_DIR, skipSubdirs: true);
    ok(['quests' => $quests]);
}

function actionListPending(): void {
    requireAuth();
    $quests = readQuestDir(ATTENTE_DIR);
    ok(['quests' => $quests]);
}

/* ══════════════════════════════════════════════════════════
   VÉRIFICATIONS
   ══════════════════════════════════════════════════════════ */

function actionCheckMonsters(): void {
    $raw = $_GET['ids'] ?? $_POST['ids'] ?? '';
    if ($raw === '') fail('IDs manquants.');

    $enemies  = loadEnemies();
    $knownIds = array_map('strval', array_column($enemies, 'fixedId'));

    if (empty($knownIds)) fail('Base de monstres inaccessible sur le serveur.');

    $ids = array_filter(explode(',', $raw), fn($v) => $v !== '');
    foreach ($ids as $idStr) {
        if (!in_array(trim($idStr), $knownIds, true)) {
            $name = 'fixedId=' . trim($idStr);
            fail("Monstre inconnu ({$name}) — non présent dans la base de données.");
        }
    }
    ok(['count' => count($ids)]);
}

function actionCheckDuplicate(): void {
    $id = (int)($_GET['id'] ?? $_POST['id'] ?? 0);
    if (!$id) fail('ID manquant.');
    [$inBase, $inAttente] = checkDuplicateId($id);
    ok(['inBase' => $inBase, 'inAttente' => $inAttente]);
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

function readQuestDir(string $dir, bool $skipSubdirs = false): array {
    if (!is_dir($dir)) return [];

    $enemies = loadEnemies();
    $quests  = [];

    foreach (glob($dir . 'quest_*.zip') as $path) {
        $filename = basename($path);
        if (!preg_match('/^quest_(\d+)_([a-zA-Z0-9]{1,15})\.zip$/', $filename, $m)) continue;
        $questId = (int)$m[1];
        $pseudo  = $m[2];

        $zip = new ZipArchive();
        if ($zip->open($path) !== true) continue;
        [$raw, $ext] = extractQuestData($zip);
        $zip->close();
        if (!$raw || !$ext) continue;

        $data  = $raw['_DataList'] ?? [];
        [$title, $client, $desc] = findQuestTexts($raw);

        $targets  = $raw['_BossZakoDataList']['_MainTargetDataList'] ?? [];
        $monsters = [];
        foreach ($targets as $t) {
            $fid        = (int)($t['_EmID'] ?? 0);
            $monsters[] = [
                'fixedId' => $fid,
                'name'    => getMonsterName($fid, $enemies),
                'variant' => $t['_LegendaryID'] ?? 'NONE',
            ];
        }

        $diffUuid     = $targets[0]['_DifficultyRankId']['Value'] ?? '';
        $diffName     = $targets[0]['_DifficultyRankId']['Name']  ?? '';
        $monsterGrade = resolveDifficultyGrade($diffUuid, $diffName);

        $bossRushParams = $data['_BossRushParams'] ?? [];
        $isSequential   = is_array($bossRushParams) && array_reduce(
            $bossRushParams,
            fn($carry, $p) => $carry || (($p['_PopType'] ?? -1) === 2),
            false
        );

        // Lire les avertissements éventuels depuis le .meta.json (dossier attente uniquement)
        $warningsList = [];
        $metaPath = $dir . pathinfo($filename, PATHINFO_FILENAME) . '.meta.json';
        if (file_exists($metaPath)) {
            $metaRaw = file_get_contents($metaPath);
            if ($metaRaw !== false) {
                $meta = json_decode($metaRaw, true);
                if (is_array($meta['warnings'] ?? null)) {
                    $warningsList = $meta['warnings'];
                }
            }
        }

        $quests[] = [
            'filename'      => $filename,
            'id'            => $questId,
            'pseudo'        => $pseudo,
            'title'         => $title,
            'client'        => $client,
            'desc'          => $desc,
            'level'         => (int)($data['_QuestLv']                        ?? 8),
            'timeLimit'     => (int)($data['_TimeLimit']                       ?? 50),
            'money'         => (int)($data['_RemMoney']                        ?? 0),
            'questLife'     => (int)($data['_QuestLife']                       ?? 3),
            'maxPlayers'    => (int)($data['_OrderCondition']['_MaxPlayerNum'] ?? 4),
            'minRC'         => (int)($data['_OrderCondition']['_OrderHR']      ?? 1),
            'stageVal'      => (int)($data['_Stage']['_Value']                 ?? 0),
            'stageName'     => $data['_Stage']['_Name'] ?? '',
            'sequential'    => $isSequential,
            'monsterGrade'  => $monsterGrade,
            'monsters'      => $monsters,
            'rewards'       => $ext['rewardItems'] ?? [],
            'addedAt'       => filemtime($path),
            'warnings'      => $warningsList,
            'warningCount'  => count($warningsList),
        ];
    }

    usort($quests, fn($a, $b) => $b['addedAt'] - $a['addedAt']);
    return $quests;
}

function extractQuestData(ZipArchive $zip): array {
    $raw = null; $ext = null; $errors = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $n = $zip->getNameIndex($i);
        if (str_starts_with(basename($n), '.') || str_ends_with($n, '/')) continue;
        if (str_ends_with($n, '.raw.json')) $raw = $zip->getFromIndex($i);
        if (str_ends_with($n, '.ext.json')) $ext = $zip->getFromIndex($i);
    }
    if ($raw === null) { $errors[] = '.raw.json introuvable dans le ZIP'; }
    else {
        $raw = json_decode($raw, true);
        if ($raw === null) $errors[] = '.raw.json : JSON invalide';
    }
    if ($ext === null) { $errors[] = '.ext.json introuvable dans le ZIP'; }
    else {
        $ext = json_decode($ext, true);
        if ($ext === null) $errors[] = '.ext.json : JSON invalide';
    }
    return [$raw, $ext, $errors];
}

function checkDuplicateId(int $questId): array {
    $inBase    = !empty(glob(BASE_DIR    . "quest_{$questId}_*.zip"));
    $inAttente = !empty(glob(ATTENTE_DIR . "quest_{$questId}_*.zip"));
    return [$inBase, $inAttente];
}

function loadEnemies(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = file_exists(ENEMIES_JSON)
        ? (json_decode(file_get_contents(ENEMIES_JSON), true) ?? [])
        : [];
    return $cache;
}

function getMonsterName(int $fixedId, array $enemies): string {
    $key = (string)$fixedId;
    foreach ($enemies as $e) {
        if ((string)$e['fixedId'] === $key)
            return $e['name']['fr-fr'] ?? $e['name']['en-us'] ?? "#{$fixedId}";
    }
    return "#{$fixedId}";
}

function findLangMsg(array $raw, int $langCode): ?array {
    foreach ($raw['_MessageAssetList'] ?? [] as $ml) {
        if ((int)($ml['Language'] ?? -1) === $langCode) return $ml;
    }
    return null;
}

function findMsg(?array $langBlock, string $suffix): string {
    foreach ($langBlock['MessageData'] ?? [] as $md) {
        if (str_ends_with($md['Name'] ?? '', $suffix)) return trim($md['Text'] ?? '');
    }
    return '';
}

function findQuestTexts(array $raw): array {
    $msgFR  = findLangMsg($raw, 2);
    $title  = findMsg($msgFR, '_100');
    $client = findMsg($msgFR, '_101');
    $desc   = findMsg($msgFR, '_102');

    if ($title === '') {
        $msgEN  = findLangMsg($raw, 1);
        $title  = findMsg($msgEN, '_100');
        $client = findMsg($msgEN, '_101');
        $desc   = findMsg($msgEN, '_102');
    }
    return [$title, $client, $desc];
}

/**
 * Résout le grade du monstre (1–5) depuis l'UUID du DifficultyRankId.
 * Utilise la table exhaustive des 150 GUIDs extraits des fichiers officiels.
 * Fallback : lecture du grade dans le champ Name (format ★N-G), puis 3 par défaut.
 */
function resolveDifficultyGrade(string $uuid, string $name): int {
    // Table complète : uuid → grade (1–5)
    // Source : difficulty_ranks.json — 10 rangs × 5 grades × 3 variants
    static $table = [
        // ── Rang 1 ────────────────────────────────────────
        '8749a106-3696-4bba-a267-ec0814c4ee46' => 1,
        '234eef53-5b31-480e-b58e-ea4fe810607f' => 1,
        '4287dc88-acce-49d0-8e00-12cfadee4cca' => 2,
        'cfab05d7-9cba-4ed3-928e-144ea473f4a4' => 2,
        '2154b240-edd3-4d61-822a-3a208cdf2a9b' => 2,
        'e2dc622b-6851-4051-9a29-ea6c0af64afa' => 3,
        '834f1ed4-aa1f-4a1d-bd63-a83022c0c0fc' => 3,
        '6d29e5c2-e156-4d7e-b854-f5294de10333' => 3,
        'f62f51a9-a197-4d18-accd-6061ac2455e3' => 3,
        '1384437b-9627-4234-9072-a9f2396386cb' => 4,
        'bba03c33-d068-4e64-9027-1f243a47b70e' => 4,
        '560f97b6-a408-4c42-ad70-f410a0b7f83c' => 5,
        'ed13546e-d888-4ae4-8632-abff8d87986c' => 5,
        // ── Rang 2 ────────────────────────────────────────
        'ad6289b9-d70c-45a7-b770-f920ac0ee030' => 1,
        '512cefb4-eba1-4e21-a0d5-5486b924fcf7' => 1,
        '6ab722c0-eadf-4380-a0d6-e040082910de' => 2,
        'cc84212a-06ae-40d4-81ad-8d7cd986755e' => 2,
        'a045b4f4-593b-473c-9e14-f9338ab9829f' => 2,
        'e7504b4e-9b0d-4cc7-918e-c66abf352fcb' => 3,
        '8dbc3694-5ffd-4249-a64f-2de3dc504a75' => 3,
        '0b16a0bc-9ee6-4607-820d-7c699242afe7' => 3,
        '43b56a3d-2dec-464b-8dff-63d973dbcecc' => 4,
        'f5708b8b-3ced-4435-9750-deb05521786b' => 4,
        'ab8dceaf-a84c-48d3-a68a-9301b6b9b12b' => 5,
        '7b62fab8-0bc4-44f7-afe0-651d8c6b21a5' => 5,
        // ── Rang 3 ────────────────────────────────────────
        '844bfce6-3663-4c5c-9460-6b4c4c4c7a1a' => 1,
        'b067fbe7-5db5-4141-b2ed-44c3a7e74d61' => 1,
        'eab95bfa-10a1-4912-8e3e-1ac85c15d870' => 2,
        '31fb735f-6da0-4e3c-94d9-91151299ecea' => 2,
        '987044cd-0624-4665-a490-b6bb969ec89a' => 3,
        'f406c835-d746-49eb-b48c-272d87fcc46e' => 3,
        'ea8488e2-d9c9-426e-b83a-dd8b055dc88d' => 3,
        '430a24a5-17a3-4f8f-bb9e-fb4d17d258dd' => 3,
        '2da0620c-1ced-476f-b0e8-a0c24282940b' => 3,
        'f6bcdb59-5752-4ab0-944a-1c3f0a40016e' => 3,
        'b5da9c7e-36e0-4487-8b77-e66bf72609b9' => 4,
        '6e6ac10f-19f3-4d3f-ab81-427da22b28e3' => 4,
        '57c1f12c-d2ec-4b45-99ff-96386a91d2bb' => 5,
        'dfe07421-aa0d-4cc6-8358-9f59674d414d' => 5,
        'eca23c6b-4085-47d0-983d-059d6bd5d429' => 5,
        'f866c9ea-a8dc-4c1f-81a7-e37529f50f07' => 5,
        'a604364c-19cf-4665-84f4-825c85bac933' => 5,
        'e91b79be-c76d-4b33-aaee-64690596aa9a' => 5,
        '49c4781f-8d3b-4313-9212-4a55d8cfe6d5' => 5,
        // ── Rang 4 ────────────────────────────────────────
        'e4cb18b4-dedd-4b8b-9737-be9d882d31d6' => 1,
        'b13f1838-fade-498c-ae0c-005acf618a73' => 2,
        'd4f88490-4d9c-419a-8d1f-6c349328f22a' => 2,
        '8ac996e9-cd2a-4c72-8bbc-e42cfa8df67b' => 3,
        '67aaca56-f701-4ab4-b3c9-6960d35a0abb' => 3,
        '2018d3e6-c9b9-48a3-99fc-04bbd2e66415' => 3,
        '5193b371-7706-45ef-ba10-f3d9a5b0e05a' => 3,
        '97cfaf51-672c-48e0-b084-01de375da61f' => 3,
        'f57a60f7-deb7-4d83-8670-da1e08fef64f' => 3,
        '4a49f322-5ac2-4392-a560-fb7600b5a60e' => 3,
        '1411b42a-1c9c-4b21-87bf-d36df49a4bea' => 3,
        'df5a97f5-3646-43c3-a52b-b8cb33f3b9bb' => 3,
        'e510020a-4cca-4a3c-a9ce-758d7292c106' => 3,
        '7d03cb0b-5af6-42e5-9601-3ce065f1b770' => 3,
        '72dc9845-7063-4066-af98-7d80ff46ceb6' => 4,
        '2fbc2268-808d-466e-9ccd-40d796a62635' => 5,
        // ── Rang 5 ────────────────────────────────────────
        '6f969570-6e32-4caa-9ae0-b3fa7c131975' => 1,
        'd9e307a4-8be2-428b-9533-533e43737134' => 2,
        '8e8ae1ad-b02a-4ed7-a450-55c18d8e3dca' => 2,
        'd320da89-0663-4541-bbb5-8542f4d307f6' => 3,
        'b8b3e09e-af27-4bf6-8f29-8e843badfc41' => 3,
        '07966662-8258-4999-9eea-a6813b036da3' => 3,
        '2e71988c-b27f-4fa7-87eb-46e517b64114' => 3,
        'fc76cc29-2dbb-4978-92ca-f4ddf95c664c' => 3,
        '0c3e42b8-e13d-4502-9aba-eda79c0da015' => 3,
        'f7f8c031-9a64-4c5d-946b-265a3846c0a5' => 3,
        '5a921c0e-7e11-475f-968a-b311806fa5ba' => 3,
        '568caea5-d232-47ee-a76f-4ac986ffd559' => 3,
        '6178728a-23ed-4456-97d2-9e5d173dd1f7' => 4,
        'f5332191-0ae8-4a76-9f31-e61b5048e22d' => 5,
        '41dedb7f-71c9-4c2f-a8b1-87669d1917cd' => 5,
        // ── Rang 6 ────────────────────────────────────────
        'be8cbfe8-acd9-487c-91f1-353ea3928ef2' => 1,
        '3809f0fa-a5b1-4a0d-8db7-aa4381c4ff2d' => 2,
        '0e9c0fff-7aa6-4087-925c-501a900f602b' => 3,
        '43fad461-bc90-46ec-8c0f-fac6135b05a0' => 3,
        'c88a431f-fec6-4c62-bee3-e3a0e3756643' => 3,
        '38308372-4fc3-49d4-929a-676f7fe2565f' => 3,
        'aaf8c9db-dc00-4789-afde-38a8ac3459cb' => 3,
        '45c309a3-3fdd-4020-8ee3-cfd0a8fad7e1' => 3,
        '49b59e50-b997-4b08-8f9b-de4deed9b547' => 3,
        '1aaf4ec0-a9fd-4bec-badd-0fce9c551872' => 3,
        '4b99e6fc-15e5-4456-a693-7c20468f8305' => 3,
        'd2598eb0-9657-4cd1-b6ab-eb98e79afb29' => 3,
        '441edcab-d4ca-4bad-87db-711739478608' => 3,
        'cf311733-5f44-4b8a-8745-b9f2e2d547ec' => 3,
        '5998e97c-7f3a-41fa-8122-650e9351c250' => 4,
        '70397745-7632-471b-8f0e-41c271d5ef47' => 4,
        '3284ebab-04e6-4634-a679-044fd232dd34' => 4,
        '87d05695-2055-4afa-9fe2-091ea3b01b68' => 4,
        '776ba34f-17a9-4d4c-9794-a11918d0dc00' => 5,
        'a325aaaf-a1aa-4911-88a9-4285a73ed0db' => 5,
        'a11a4438-113a-4e6a-9188-00eaf31d04fc' => 5,
        'da836490-ea31-485a-a818-f6158f415998' => 5,
        // ── Rang 7 ────────────────────────────────────────
        '49f8e6c1-e77f-4ec3-ae2f-e0253a244bd3' => 1,
        '7f8246d1-88b0-41d8-b993-92cdd0371712' => 2,
        '80e64c45-1926-4659-a954-9654a488f2f0' => 3,
        '1f6269d4-dd88-4896-817d-9b609cbfe07a' => 3,
        '681788c2-129c-4305-b054-360c74033bf5' => 3,
        '289d3a56-3a8e-4577-bf89-873d1371b1b7' => 3,
        'b921e903-5aad-4b7c-add7-152a5b2e9d89' => 3,
        'a7dcfe8f-f189-4b7e-a153-672e3e85a96f' => 3,
        'f22e18ad-f768-4542-9611-3e6ce62a23c1' => 3,
        'dbefbbb3-47e0-4c01-ba82-0d561c98627e' => 3,
        '5277e262-576b-49a6-9bb7-efa5b89b1b85' => 3,
        'd98b7732-2063-4582-b884-bb2287600dfd' => 4,
        '672504b4-7a87-45c3-b199-90d3eb37d393' => 4,
        '556aa48c-2f42-47ae-a6e0-c54f65e90238' => 4,
        'f3e5ded8-fe74-4334-b582-9142e511c180' => 5,
        'd6c1670c-ecbb-4c5d-95e7-33c2c320800b' => 5,
        '84b51374-10ad-48e8-807d-475e9bd67db9' => 5,
        // ── Rang 8 ────────────────────────────────────────
        'b592f809-84f1-44a9-a788-3302fdf24b9e' => 1,
        '703e1672-832a-4ef8-871d-e139d9f63734' => 2,
        'ccaf8a5e-5842-4316-b328-5ad826629f42' => 3,
        '1eae46c2-ed4c-4cf7-9aa0-6ef0ac6658be' => 3,
        'f6554537-09bf-4911-8139-ce95843973fc' => 3,
        'a67d83c2-6e30-4838-baae-dcda67126a93' => 3,
        '9a1a5674-0a89-4676-b11d-f76e8146d986' => 3,
        'e1c701fe-12bf-4573-996a-57fbb266db60' => 3,
        'ee149e96-6f09-4f62-acc1-853dc53ad111' => 3,
        'ab44f2b9-244d-4957-ba67-e6735ed0b659' => 3,
        'a7238a40-6595-4b05-8f5a-3f0114e1c0f7' => 3,
        '325d8834-e5ee-4941-af5f-5dfec7cb5541' => 3,
        'd957ed05-c6ef-4460-8a0e-43c582cc3b10' => 3,
        'e40ac53b-c101-4c04-8981-bbceb6d806ff' => 4,
        '0ea0c910-1d08-44b2-970a-13c4d997e378' => 4,
        '78f9d8ae-1d3c-434e-af71-420f3e4e0d87' => 4,
        'cff3634d-be02-460b-98bd-ec7c42ad5164' => 4,
        'adac4b25-09d6-48e2-a0fd-e4ae5eacfd0e' => 4,
        '29757ab4-7b71-404a-bf7d-f84668c3d740' => 4,
        '750aa216-8969-49a1-b7f5-622f002eb47f' => 4,
        '2d410590-46af-48dc-b99b-8c0edaeed0d8' => 4,
        'a9626738-9d79-4eff-8ff2-2e335c51b02f' => 5,
        'e889e55e-cea7-4764-ae73-408ba124212c' => 5,
        '3ba88339-3d81-4ae6-85e0-dafa2af189f8' => 5,
        'ee295820-f83c-41db-a795-12d5ede464f3' => 5,
        '3b1cf740-c6c8-4849-b700-a0a1b9021c41' => 5,
        '97758969-7ec7-44ca-8731-5ba26d78d89f' => 5,
        'ae76a4eb-c2b4-4c06-a226-054096c75058' => 5,
        '25d0989d-4bbd-4985-9257-126a985bd0f9' => 5,
        'f25965da-30b5-42de-993b-d4d140986726' => 5,
        // ── Rang 9 ────────────────────────────────────────
        'f7ab0b2b-1720-4018-9bef-e46ceba77ad6' => 3,
        'e8777717-8146-41e4-a93e-870423042ac4' => 3,
        '7f1a7cb9-8154-4cd9-b64e-136a545b21e9' => 3,
        'd6e4e648-df88-4bd1-874f-d1997cf96b22' => 3,
        '323f25ba-425d-430a-8734-2de5e98f2d43' => 3,
        'b3a5ca9d-ba99-4771-9974-a7471f706d6b' => 3,
        '60296cc8-7c2b-4e7e-9609-d9f4305da417' => 3,
        'ac25e176-a1e8-4872-b34f-2e2b7a230f5c' => 4,
        '591e8610-e43f-4078-9608-6c5ff6540003' => 4,
        'de815e08-dd85-4621-8ed7-02ce8a80be4c' => 4,
        'b3f28ec1-6bb5-473e-b018-93ac9a67ac8d' => 4,
        'dc8806e3-6e7e-420b-8e03-3eb798989add' => 4,
        '06f3aa74-1810-4dd6-b881-9805cbd29248' => 4,
        'f326f227-c0ff-47bb-92e7-aa187d61ad3c' => 5,
        '1de1fb98-de58-474d-91cb-b3071a61262a' => 5,
        'aa92e87f-9a58-4a8f-8613-c00ddb9e763a' => 5,
        'f909927b-cb28-4874-b03c-4a72ff88399b' => 5,
        // ── Rang 10 ───────────────────────────────────────
        '64938e94-d384-4567-8ed5-af922379600d' => 5,
        '5ffe9dda-6926-4fd8-a3de-e9eafcf0fa50' => 5,
        '0d2f0e0c-cb6b-42b5-b1d8-5f51e5a97767' => 5,
        '38c2520b-53ab-4c1b-8d7c-335ca8a75bd6' => 5,
        'd5826b15-4244-4e85-bbd9-d2f44b8a4f7a' => 5,
        '92666b5d-ef17-4e5c-90d5-a07e97ee57ac' => 5,
        '6d893ac4-5f81-4850-b1ac-a2c23845cb15' => 5,
    ];

    if (isset($table[$uuid])) return $table[$uuid];
    // Fallback : lire le grade dans le Name (format ★N-G)
    if (preg_match('/â\d+-(\d+)/', $name, $m)) {
        $g = (int)$m[1];
        if ($g >= 1 && $g <= 5) return $g;
    }
    return 3; // défaut raisonnable
}

function actionAdminEditQuest(): void {
    requireAuth(); // accessible aux admins et modérateurs

    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier invalide.');

    $newTitle  = trim($_POST['title']  ?? '');
    $newClient = trim($_POST['client'] ?? '');
    $newDesc   = trim($_POST['desc']   ?? '');

    if ($newTitle === '') fail('Le titre ne peut pas être vide.');
    if (mb_strlen($newTitle)  > 200)  fail('Titre trop long (200 caractères max).');
    if (mb_strlen($newClient) > 200)  fail('Client trop long (200 caractères max).');
    if (mb_strlen($newDesc)   > 2000) fail('Description trop longue (2000 caractères max).');

    $path = BASE_DIR . $filename;
    if (!str_starts_with(realpath($path) ?: '', realpath(BASE_DIR)))
        fail('Chemin non autorisé.');
    if (!file_exists($path)) fail('Fichier introuvable.');

    // ── 1. Lire tous les fichiers du ZIP en mémoire ──────────
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) fail('Impossible d\'ouvrir le ZIP.');

    $files = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        $files[$name] = $zip->getFromIndex($i);
    }
    $zip->close();

    // ── 2. Localiser et patcher le .raw.json ─────────────────
    $rawKey = null;
    foreach (array_keys($files) as $n) {
        if (str_ends_with($n, '.raw.json')) { $rawKey = $n; break; }
    }
    if ($rawKey === null) fail('.raw.json introuvable dans le ZIP.');

    $raw = json_decode($files[$rawKey], true);
    if ($raw === null) fail('.raw.json : JSON invalide.');

    // Patcher le bloc FR (langCode 2)
    $patchedTitle = false;
    foreach ($raw['_MessageAssetList'] as &$ml) {
        if ((int)($ml['Language'] ?? -1) !== 2) continue;
        foreach ($ml['MessageData'] as &$md) {
            if (str_ends_with($md['Name'] ?? '', '_100')) { $md['Text'] = $newTitle;  $patchedTitle = true; }
            if (str_ends_with($md['Name'] ?? '', '_101')) { $md['Text'] = $newClient; }
            if (str_ends_with($md['Name'] ?? '', '_102')) { $md['Text'] = $newDesc;   }
        }
        unset($md);
        break;
    }
    unset($ml);

    if (!$patchedTitle) fail('Bloc de texte FR (_100) introuvable dans le .raw.json.');

    $files[$rawKey] = json_encode(
        $raw,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    // ── 3. Réécrire un ZIP temporaire ────────────────────────
    $tmpPath = $path . '.tmp.' . getmypid();
    $newZip  = new ZipArchive();
    if ($newZip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        fail('Impossible de créer le ZIP temporaire.');
    }
    foreach ($files as $n => $content) {
        $newZip->addFromString($n, $content);
    }
    $newZip->close();

    // ── 4. Remplacement atomique du ZIP original ─────────────
    if (!rename($tmpPath, $path)) {
        @unlink($tmpPath);
        fail('Impossible de remplacer le ZIP original.');
    }

    appendLog('edit_quest', $filename);
    ok(['message' => "Quête « {$filename} » modifiée avec succès."]);
}

function sanitizeFilename(string $name): string {
    $base = basename($name);
    return preg_match('/^quest_\d+_[a-zA-Z0-9]{1,15}\.zip$/', $base) ? $base : '';
}

function uploadErrMsg(int $code): string {
    return match($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux.',
        UPLOAD_ERR_PARTIAL    => 'Upload partiel, veuillez réessayer.',
        UPLOAD_ERR_NO_FILE    => 'Aucun fichier reçu.',
        UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant (config serveur).',
        UPLOAD_ERR_CANT_WRITE => 'Impossible d\'écrire le fichier temporaire.',
        default               => 'Erreur d\'upload inconnue.',
    };
}
/* ══════════════════════════════════════════════════════════
   SIGNALEMENTS (public → report_quest ; auth → list/dismiss/delete)
   ══════════════════════════════════════════════════════════ */

/**
 * Charge reports.json depuis le disque.
 */
function loadReports(): array {
    if (!file_exists(REPORTS_FILE)) return [];
    $raw = file_get_contents(REPORTS_FILE);
    if ($raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Écrit reports.json de manière atomique.
 */
function saveReports(array $reports): void {
    $json = json_encode(
        array_values($reports),
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    $tmp = REPORTS_FILE . '.tmp.' . getmypid();
    if (file_put_contents($tmp, $json, LOCK_EX) === false) {
        @unlink($tmp);
        fail('Impossible d\'écrire reports.json (droits ?).');
    }
    if (!rename($tmp, REPORTS_FILE)) {
        @unlink($tmp);
        fail('Impossible de finaliser l\'écriture de reports.json.');
    }
}

/**
 * Signaler une quête (accessible sans authentification).
 * Limite : 1 signalement par IP et par fichier.
 */
function actionReportQuest(): void {
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier invalide.');

    $reason = trim($_POST['reason'] ?? '');
    $allowed = ['broken', 'unreachable', 'cheat'];
    if (!in_array($reason, $allowed, true))
        fail('Raison de signalement invalide.');

    $comment = trim($_POST['comment'] ?? '');
    if (mb_strlen($comment) > 300)
        fail('Commentaire trop long (300 caractères max).');

    // Vérifier que la quête existe bien dans base/
    if (!file_exists(BASE_DIR . $filename))
        fail('Quête introuvable.');

    // Extraire titre et questId depuis le fichier
    $questId    = null;
    $questTitle = '';
    if (preg_match('/^quest_(\d+)_/', $filename, $m)) $questId = (int)$m[1];

    $zip = new ZipArchive();
    if ($zip->open(BASE_DIR . $filename) === true) {
        [$raw] = extractQuestData($zip);
        $zip->close();
        if ($raw) {
            [$questTitle] = findQuestTexts($raw);
        }
    }

    // Anti-doublon : 1 signalement par IP + filename
    $ip      = $_SERVER['REMOTE_ADDR'] ?? '';
    $reports = loadReports();
    foreach ($reports as $r) {
        if ($r['filename'] === $filename && ($r['ip'] ?? '') === $ip)
            fail('Vous avez déjà signalé cette quête.');
    }

    // Générer un UUID v4 simple
    $uid = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );

    $entry = [
        'id'         => $uid,
        'at'         => time(),
        'filename'   => $filename,
        'questId'    => $questId,
        'questTitle' => $questTitle,
        'reason'     => $reason,
        'comment'    => $comment,
        'ip'         => $ip,
    ];

    array_unshift($reports, $entry);
    if (count($reports) > 1000) $reports = array_slice($reports, 0, 1000);
    saveReports($reports);

    ok(['message' => 'Signalement enregistré. Merci pour votre retour !']);
}

/**
 * Lister les signalements (admin + modo).
 */
function actionListReports(): void {
    requireAuth();
    $reports = loadReports();
    ok(['reports' => $reports]);
}

/**
 * Ignorer un signalement (le supprimer de la liste sans toucher à la quête).
 */
function actionDismissReport(): void {
    requireAuth();
    $id = trim($_POST['id'] ?? '');
    if ($id === '') fail('ID de signalement requis.');

    $reports    = loadReports();
    $newReports = array_values(array_filter($reports, fn($r) => $r['id'] !== $id));
    if (count($newReports) === count($reports)) fail('Signalement introuvable.');

    // Récupérer les infos du signalement pour le log
    $found = null;
    foreach ($reports as $r) { if ($r['id'] === $id) { $found = $r; break; } }

    saveReports($newReports);
    if ($found) appendLog('dismiss_report', $found['filename']);
    ok(['message' => 'Signalement ignoré.']);
}

/**
 * Supprimer la quête signalée ET retirer le signalement.
 */
function actionDeleteReported(): void {
    requireAuth();
    $id = trim($_POST['id'] ?? '');
    if ($id === '') fail('ID de signalement requis.');

    $reports = loadReports();
    $found   = null;
    foreach ($reports as $r) { if ($r['id'] === $id) { $found = $r; break; } }
    if (!$found) fail('Signalement introuvable.');

    $filename = $found['filename'];
    $path     = BASE_DIR . $filename;

    if (!str_starts_with(realpath($path) ?: '', realpath(BASE_DIR)))
        fail('Chemin non autorisé.');
    if (!file_exists($path)) fail('Fichier de quête introuvable (déjà supprimé ?).');
    unlink($path);

    // Retirer tous les signalements de cette quête
    $newReports = array_values(array_filter($reports, fn($r) => $r['filename'] !== $filename));
    saveReports($newReports);

    appendLog('delete_reported', $filename);
    ok(['message' => "Quête « {$filename} » supprimée suite à signalement."]);
}

/* ══════════════════════════════════════════════════════════
   AVERTISSEMENTS D'UNE QUÊTE EN ATTENTE
   ══════════════════════════════════════════════════════════ */

/**
 * Retourne la liste des avertissements associés à un fichier en attente.
 * Accessible aux modérateurs et admins authentifiés.
 */
function actionGetWarnings(): void {
    requireAuth();

    $filename = sanitizeFilename($_GET['filename'] ?? $_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $metaPath = ATTENTE_DIR . pathinfo($filename, PATHINFO_FILENAME) . '.meta.json';
    if (!file_exists($metaPath)) {
        ok(['warnings' => [], 'count' => 0]);
    }

    $raw  = file_get_contents($metaPath);
    $meta = $raw !== false ? (json_decode($raw, true) ?? []) : [];
    $warnings = is_array($meta['warnings'] ?? null) ? $meta['warnings'] : [];

    ok(['warnings' => $warnings, 'count' => count($warnings)]);
}

/* ══════════════════════════════════════════════════════════
   VERSION
   ══════════════════════════════════════════════════════════ */

/**
 * Retourne la version et le nom de version de l'outil.
 * Accessible sans authentification.
 */
function actionVersion(): void {
    echo json_encode([
        'version' => APP_VERSION,
        'name'    => APP_VERSION_NAME,
    ]);
}