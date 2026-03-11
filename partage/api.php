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
    'check_duplicate'   => actionCheckDuplicate(),
    'check_monsters'    => actionCheckMonsters(),
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
    if (strlen($pass) < 6)
        fail('Mot de passe trop court (6 caractères minimum).');
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
                if (strlen($newPass) < 6) fail('Mot de passe trop court (6 caractères minimum).');
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
    $newDisplay   = trim($_POST['displayName'] ?? '');
    $newPass      = $_POST['password'] ?? '';
    $currentPass  = $_POST['currentPassword'] ?? '';

    if ($currentPass === '') fail('Le mot de passe actuel est requis.');

    $users    = loadUsers();
    $newUsers = [];
    $found    = false;

    // Reconstruction du tableau sans références — copie de chaque entrée
    foreach ($users as $u) {
        if ($u['login'] === $currentLogin) {
            $found = true;

            if (!password_verify($currentPass, $u['password']))
                fail('Mot de passe actuel incorrect.');

            if ($newDisplay !== '') {
                if (strlen($newDisplay) > 30) fail('Nom d\'affichage trop long (30 max).');
                $u['displayName'] = $newDisplay;
            }
            if ($newPass !== '') {
                if (strlen($newPass) < 6) fail('Nouveau mot de passe trop court (6 caractères minimum).');
                $u['password'] = password_hash($newPass, PASSWORD_BCRYPT);
            }
        }
        $newUsers[] = $u;
    }

    if (!$found) fail('Utilisateur introuvable.');

    // On sauvegarde d'abord, on met à jour la session ensuite
    saveUsers($newUsers);

    if ($newDisplay !== '') {
        $_SESSION['displayName'] = $newDisplay;
    }

    ok([
        'message'     => 'Profil mis à jour.',
        'displayName' => $_SESSION['displayName'] ?? $currentLogin,
    ]);
}

/* ══════════════════════════════════════════════════════════
   UPLOAD
   ══════════════════════════════════════════════════════════ */

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

    ok(['message' => "Quête « {$filename} » validée."]);
}

function actionAdminRefuse(): void {
    requireAuth();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $path = ATTENTE_DIR . $filename;
    if (!file_exists($path)) fail('Fichier introuvable.');
    unlink($path);

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
        $monsterStars = resolveDifficultyStars($diffUuid, $diffName);

        $bossRushParams = $data['_BossRushParams'] ?? [];
        $isSequential   = is_array($bossRushParams) && array_reduce(
            $bossRushParams,
            fn($carry, $p) => $carry || (($p['_PopType'] ?? -1) === 2),
            false
        );

        $quests[] = [
            'filename'     => $filename,
            'id'           => $questId,
            'pseudo'       => $pseudo,
            'title'        => $title,
            'client'       => $client,
            'desc'         => $desc,
            'level'        => (int)($data['_QuestLv']                        ?? 8),
            'timeLimit'    => (int)($data['_TimeLimit']                       ?? 50),
            'money'        => (int)($data['_RemMoney']                        ?? 0),
            'questLife'    => (int)($data['_QuestLife']                       ?? 3),
            'maxPlayers'   => (int)($data['_OrderCondition']['_MaxPlayerNum'] ?? 4),
            'minRC'        => (int)($data['_OrderCondition']['_OrderHR']      ?? 1),
            'stageVal'     => (int)($data['_Stage']['_Value']                 ?? 0),
            'stageName'    => $data['_Stage']['_Name'] ?? '',
            'sequential'   => $isSequential,
            'monsterStars' => $monsterStars,
            'monsters'     => $monsters,
            'rewards'      => $ext['rewardItems'] ?? [],
            'addedAt'      => filemtime($path),
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

function resolveDifficultyStars(string $uuid, string $name): int {
    $knownUuids = [
        '14627cdc-9c1a-43e6-ab18-d01c45120a4b' => 3,
        '6d893ac4-5f81-4850-b1ac-a2c23845cb15' => 3,
        '64938e94-d384-4567-8ed5-af922379600d' => 5,
    ];
    if (isset($knownUuids[$uuid])) return $knownUuids[$uuid];
    if (preg_match('/★\d+-(\d+)/', $name, $m)) return (int)$m[1];
    return 3;
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