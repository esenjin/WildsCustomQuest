<?php
/* ============================================================
   api.php – Endpoints AJAX du hub
   Actions disponibles (POST, champ "action") :
     login          Connexion admin
     logout         Déconnexion admin
     check_session  Vérifie si l'admin est connecté
     upload         Upload d'un ZIP en attente
     admin_validate Valider un ZIP en attente → base/
     admin_refuse   Refuser (supprimer) un ZIP en attente
     admin_delete   Supprimer un ZIP validé
     list_quests    Liste les quêtes validées (JSON)
     list_pending   Liste les quêtes en attente (JSON, admin)
   ============================================================ */

require_once __DIR__ . '/config.php';

session_name(SESSION_NAME);
session_start();

header('Content-Type: application/json; charset=utf-8');

/* ── Helper réponse ──────────────────────────────────────── */
function ok(array $data = []): void {
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 422): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
function requireAdmin(): void {
    if (empty($_SESSION['admin'])) fail('Non autorisé.', 403);
}

/* ── Routing ─────────────────────────────────────────────── */
$action = $_POST['action'] ?? $_GET['action'] ?? '';

match ($action) {
    'login'            => actionLogin(),
    'logout'           => actionLogout(),
    'check_session'    => actionCheckSession(),
    'upload'           => actionUpload(),
    'admin_validate'   => actionAdminValidate(),
    'admin_refuse'     => actionAdminRefuse(),
    'admin_delete'     => actionAdminDelete(),
    'list_quests'      => actionListQuests(),
    'list_pending'     => actionListPending(),
    'check_duplicate'  => actionCheckDuplicate(),
    'check_monsters'   => actionCheckMonsters(),
    default            => fail('Action inconnue.', 400),
};

/* ══════════════════════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════════════════════ */

function actionLogin(): void {
    $login = trim($_POST['login'] ?? '');
    $pass  = $_POST['password'] ?? '';
    if ($login === ADMIN_LOGIN && password_verify($pass, ADMIN_PASSWORD)) {
        $_SESSION['admin'] = true;
        ok(['message' => 'Connecté.']);
    }
    // Délai anti-brute-force
    sleep(1);
    fail('Identifiants incorrects.', 401);
}

function actionLogout(): void {
    session_destroy();
    ok(['message' => 'Déconnecté.']);
}

function actionCheckSession(): void {
    ok(['admin' => !empty($_SESSION['admin'])]);
}

function actionCheckMonsters(): void {
    $raw = $_GET['ids'] ?? $_POST['ids'] ?? '';
    if ($raw === '') fail('IDs manquants.');

    $enemies  = loadEnemies();
    // Comparaison en string pour éviter les problèmes de type int/float
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
   UPLOAD
   ══════════════════════════════════════════════════════════ */

function actionUpload(): void {
    /* ── Pseudo ────────────────────────────────────────────── */
    $pseudo = trim($_POST['pseudo'] ?? '');
    if ($pseudo === '')                          fail('Le pseudo est requis.');
    if (!preg_match('/^[a-zA-Z0-9]{1,15}$/', $pseudo))
        fail('Pseudo invalide (1–15 caractères alphanumériques uniquement).');

    /* ── Fichier ───────────────────────────────────────────── */
    if (empty($_FILES['questzip']) || $_FILES['questzip']['error'] !== UPLOAD_ERR_OK)
        fail(uploadErrMsg($_FILES['questzip']['error'] ?? UPLOAD_ERR_NO_FILE));

    $tmp  = $_FILES['questzip']['tmp_name'];
    $name = $_FILES['questzip']['name'];

    if (strtolower(pathinfo($name, PATHINFO_EXTENSION)) !== 'zip')
        fail('Le fichier doit être un .zip.');

    if (filesize($tmp) > MAX_ZIP_SIZE)
        fail('Le fichier dépasse la taille maximale (2 Mo).');

    // Magic bytes PK
    $fh    = fopen($tmp, 'rb');
    $magic = fread($fh, 2);
    fclose($fh);
    if ($magic !== 'PK') fail('Le fichier n\'est pas un ZIP valide.');

    /* ── Contenu ZIP ───────────────────────────────────────── */
    $zip = new ZipArchive();
    if ($zip->open($tmp) !== true) fail('Impossible d\'ouvrir le ZIP.');

    [$raw, $ext, $errs] = extractQuestData($zip);
    $zip->close();
    if ($errs) fail(implode(' | ', $errs));

    /* ── ID de quête ───────────────────────────────────────── */
    $questId = $raw['_DataList']['_MissionId']['_Value'] ?? null;
    if ($questId === null || (!is_int($questId) && !is_float($questId)))
        fail('ID de quête introuvable dans le ZIP.');
    $questId = (int)$questId;

    /* ── Titre FR ──────────────────────────────────────────── */
    [$title] = findQuestTexts($raw);
    if ($title === '') fail('Le titre de la quête (FR) est vide dans le ZIP.');

    /* ── Doublon d\'ID ─────────────────────────────────────── */
    [$dupBase, $dupAttente] = checkDuplicateId($questId);
    if ($dupBase)    fail("L'ID #{$questId} est déjà présent dans le hub.");
    if ($dupAttente) fail("L'ID #{$questId} est déjà en attente de validation.");

    /* ── Monstres dans enemies.json ────────────────────────── */
    $targets = $raw['_BossZakoDataList']['_MainTargetDataList'] ?? [];
    if (empty($targets)) fail('Aucun monstre cible trouvé dans le ZIP.');

    /* ── Sauvegarde ────────────────────────────────────────── */
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
   ACTIONS ADMIN
   ══════════════════════════════════════════════════════════ */

function actionAdminValidate(): void {
    requireAdmin();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $src  = ATTENTE_DIR . $filename;
    $dst  = BASE_DIR    . $filename;
    if (!file_exists($src)) fail('Fichier introuvable en attente.');
    if (!rename($src, $dst)) fail('Impossible de déplacer le fichier.');

    ok(['message' => "Quête « {$filename} » validée."]);
}

function actionAdminRefuse(): void {
    requireAdmin();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $path = ATTENTE_DIR . $filename;
    if (!file_exists($path)) fail('Fichier introuvable.');
    unlink($path);

    ok(['message' => "Quête « {$filename} » refusée et supprimée."]);
}

function actionAdminDelete(): void {
    requireAdmin();
    $filename = sanitizeFilename($_POST['filename'] ?? '');
    if (!$filename) fail('Nom de fichier manquant.');

    $path = BASE_DIR . $filename;
    // Sécurité : ne pas remonter dans attente/ ou ailleurs
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
    requireAdmin();
    $quests = readQuestDir(ATTENTE_DIR);
    ok(['quests' => $quests]);
}

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

/**
 * Lit tous les quest_*.zip d'un dossier, extrait les métadonnées.
 */
function readQuestDir(string $dir, bool $skipSubdirs = false): array {
    if (!is_dir($dir)) return [];

    $enemies = loadEnemies();
    $quests  = [];

    foreach (glob($dir . 'quest_*.zip') as $path) {
        $filename = basename($path);
        // Extraire id + pseudo depuis le nom
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
            $fid  = (int)($t['_EmID'] ?? 0);
            $monsters[] = [
                'fixedId' => $fid,
                'name'    => getMonsterName($fid, $enemies),
                'variant' => $t['_LegendaryID'] ?? 'NONE',
            ];
        }

        $bossRushParams = $data['_BossRushParams'] ?? [];
        $isSequential   = is_array($bossRushParams) && array_reduce(
            $bossRushParams,
            fn($carry, $p) => $carry || (($p['_PopType'] ?? -1) === 2),
            false
        );

        $quests[] = [
            'filename'   => $filename,
            'id'         => $questId,
            'pseudo'     => $pseudo,
            'title'      => $title,
            'client'     => $client,
            'desc'       => $desc,
            'level'      => (int)($data['_QuestLv']                        ?? 8),
            'timeLimit'  => (int)($data['_TimeLimit']                       ?? 50),
            'money'      => (int)($data['_RemMoney']                        ?? 0),
            'questLife'  => (int)($data['_QuestLife']                       ?? 3),
            'maxPlayers' => (int)($data['_OrderCondition']['_MaxPlayerNum'] ?? 4),
            'minRC'      => (int)($data['_OrderCondition']['_OrderHR']      ?? 1),
            'stageVal'   => (int)($data['_Stage']['_Value']                 ?? 0),
            'stageName'  => $data['_Stage']['_Name'] ?? '',
            'sequential' => $isSequential,
            'monsters'   => $monsters,
            'rewards'    => $ext['rewardItems'] ?? [],
            'addedAt'    => filemtime($path),
        ];
    }

    usort($quests, fn($a, $b) => $b['addedAt'] - $a['addedAt']);
    return $quests;
}

/**
 * Extrait raw + ext depuis un ZipArchive ouvert.
 * Retourne [$raw, $ext, $errors].
 */
function extractQuestData(ZipArchive $zip): array {
    $raw = null; $ext = null; $errors = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $n = $zip->getNameIndex($i);
        if (str_starts_with(basename($n), '.') || str_ends_with($n, '/')) continue;
        if (str_ends_with($n, '.raw.json')) $raw = $zip->getFromIndex($i);
        if (str_ends_with($n, '.ext.json')) $ext = $zip->getFromIndex($i);
    }
    if ($raw === null) { $errors[] = '.raw.json introuvable dans le ZIP'; $raw = null; }
    else {
        $raw = json_decode($raw, true);
        if ($raw === null) $errors[] = '.raw.json : JSON invalide';
    }
    if ($ext === null) { $errors[] = '.ext.json introuvable dans le ZIP'; $ext = null; }
    else {
        $ext = json_decode($ext, true);
        if ($ext === null) $errors[] = '.ext.json : JSON invalide';
    }
    return [$raw, $ext, $errors];
}

/**
 * Vérifie qu'aucun fixedId de monstre n'est absent de enemies.json.
 * Lève fail() si un ID est inconnu.
 */
function validateMonsters(array $targets): void {
    $enemies  = loadEnemies();
    // Comparer en string pour éviter les problèmes int/float sur les grands fixedId
    $knownIds = array_map('strval', array_column($enemies, 'fixedId'));
    foreach ($targets as $t) {
        $fid = (string)($t['_EmID'] ?? 0);
        if (!in_array($fid, $knownIds, true))
            fail("Monstre inconnu (fixedId={$fid}) — non présent dans la base de données.");
    }
}

/**
 * Retourne [bool $inBase, bool $inAttente] pour un ID de quête donné.
 */
function checkDuplicateId(int $questId): array {
    $inBase    = !empty(glob(BASE_DIR    . "quest_{$questId}_*.zip"));
    $inAttente = !empty(glob(ATTENTE_DIR . "quest_{$questId}_*.zip"));
    return [$inBase, $inAttente];
}

/** Charge enemies.json, retourne un tableau (avec cache statique). */
function loadEnemies(): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = file_exists(ENEMIES_JSON)
        ? (json_decode(file_get_contents(ENEMIES_JSON), true) ?? [])
        : [];
    return $cache;
}

/** Retourne le nom FR d'un monstre depuis son fixedId. */
function getMonsterName(int $fixedId, array $enemies): string {
    $key = (string)$fixedId;
    foreach ($enemies as $e) {
        if ((string)$e['fixedId'] === $key)
            return $e['name']['fr-fr'] ?? $e['name']['en-us'] ?? "#{$fixedId}";
    }
    return "#{$fixedId}";
}

/** Cherche le bloc MessageAssetList pour une langue donnée. */
function findLangMsg(array $raw, int $langCode): ?array {
    // Language peut être int ou string selon la source du JSON
    foreach ($raw['_MessageAssetList'] ?? [] as $ml) {
        if ((int)($ml['Language'] ?? -1) === $langCode) return $ml;
    }
    return null;
}

/** Cherche un texte dans MessageData par suffixe de Name. */
function findMsg(?array $langBlock, string $suffix): string {
    foreach ($langBlock['MessageData'] ?? [] as $md) {
        if (str_ends_with($md['Name'] ?? '', $suffix)) return trim($md['Text'] ?? '');
    }
    return '';
}

/**
 * Retourne titre/client/desc en FR (code 2), avec fallback EN (code 1)
 * si le bloc FR est absent ou vide.
 */
function findQuestTexts(array $raw): array {
    $msgFR = findLangMsg($raw, 2); // fr-fr
    $title  = findMsg($msgFR, '_100');
    $client = findMsg($msgFR, '_101');
    $desc   = findMsg($msgFR, '_102');

    // Fallback anglais si FR vide
    if ($title === '') {
        $msgEN = findLangMsg($raw, 1); // en-us
        $title  = findMsg($msgEN, '_100');
        $client = findMsg($msgEN, '_101');
        $desc   = findMsg($msgEN, '_102');
    }
    return [$title, $client, $desc];
}

/** Nettoie un nom de fichier pour éviter les traversées de chemin. */
function sanitizeFilename(string $name): string {
    $base = basename($name);
    // N'accepter que le format attendu
    return preg_match('/^quest_\d+_[a-zA-Z0-9]{1,15}\.zip$/', $base) ? $base : '';
}

/** Retourne un message lisible pour les erreurs d'upload PHP. */
function uploadErrMsg(int $code): string {
    return match($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Fichier trop volumineux.',
        UPLOAD_ERR_PARTIAL   => 'Upload partiel, veuillez réessayer.',
        UPLOAD_ERR_NO_FILE   => 'Aucun fichier reçu.',
        UPLOAD_ERR_NO_TMP_DIR => 'Dossier temporaire manquant (config serveur).',
        UPLOAD_ERR_CANT_WRITE => 'Impossible d\'écrire le fichier temporaire.',
        default => 'Erreur d\'upload inconnue.',
    };
}