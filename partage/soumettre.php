<?php
/* ============================================================
   soumettre.php – Soumission d'une quête en deux temps
   ============================================================ */

require_once __DIR__ . '/config.php';
session_name(SESSION_NAME);
session_start();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soumettre une quête – Hub MHWilds</title>
    <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body class="submit-page">

<div class="hub-wrapper">

    <header class="hub-header">
        <div class="hub-header-left">
            <div class="hub-breadcrumb">
                <a href="../index.html">⬅ Générateur</a> ›
                <a href="index.php">Hub</a> ›
                Soumettre
            </div>
            <h1 class="hub-title">Soumettre une quête</h1>
            <p class="hub-subtitle">Partagez vos créations avec la communauté</p>
        </div>
    </header>

    <!-- ── Infos ─────────────────────────────────────────── -->
    <div class="submit-card">
        <div class="submit-card-header">
            <div class="submit-card-title">ℹ Comment ça fonctionne ?</div>
        </div>
        <div class="submit-card-body info-text">
            <ol>
                <li>Créez votre quête avec le <a href="../index.html">générateur</a> et exportez le ZIP.</li>
                <li>Déposez-le ici — il sera analysé automatiquement étape par étape.</li>
                <li>Une fois validé, indiquez votre pseudo et envoyez.</li>
                <li>Votre quête sera vérifiée par un modérateur avant d'apparaître dans le hub.</li>
            </ol>
            <p class="info-note">Le ZIP doit contenir un <code>.raw.json</code> et un <code>.ext.json</code> générés par l'outil. Taille max : <strong>2 Mo</strong>.</p>
        </div>
    </div>

    <!-- ══════════════════════════════════════════════════
         ÉTAPE 1 : ANALYSE DU ZIP
         ══════════════════════════════════════════════════ -->
    <div class="submit-card" id="step1Card">
        <div class="submit-card-header">
            <div class="submit-card-title">
                <span class="step-number">1</span> Analyse du fichier ZIP
            </div>
        </div>
        <div class="submit-card-body">
            <div class="dropzone" id="dropzone" role="button" tabindex="0">
                <input type="file" id="fileInput" accept=".zip">
                <span class="dropzone-icon">📦</span>
                <div class="dropzone-text">
                    <strong>Glisser-déposer</strong> un ZIP ici, ou cliquer pour parcourir
                </div>
                <div class="dropzone-filename" id="dropzoneName"></div>
            </div>

            <!-- Checklist d'analyse -->
            <div class="analysis-checklist" id="analysisChecklist" style="display:none">
                <div class="checklist-item" id="chk-format">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Format du fichier</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-size">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Taille</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-zip">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Signature ZIP</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-json">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Fichiers .raw.json et .ext.json</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-id">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">ID de quête</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-title">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Titre de la quête (FR)</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-monsters">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Monstres cibles</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-rewards">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Récompenses</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
                <div class="checklist-item" id="chk-duplicate">
                    <span class="chk-icon">⏳</span>
                    <div class="chk-text">
                        <span class="chk-label">Doublon d'ID</span>
                        <span class="chk-detail"></span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ══════════════════════════════════════════════════
         ÉTAPE 2 : ENVOI (affiché uniquement après validation)
         ══════════════════════════════════════════════════ -->
    <div class="submit-card step2-card" id="step2Card" style="display:none">
        <div class="submit-card-header">
            <div class="submit-card-title">
                <span class="step-number">2</span> Envoyer la quête
            </div>
        </div>
        <div class="submit-card-body">
            <div class="analysis-success-banner" id="successBanner">
                <span class="success-icon">✓</span>
                <span id="successBannerText">Analyse réussie — quête prête à être soumise.</span>
            </div>

            <div class="form-group" style="margin-top:16px">
                <label class="form-label" for="pseudoInput">
                    Votre pseudo <span style="color:var(--at-h)">*</span>
                </label>
                <input type="text" id="pseudoInput" class="form-input"
                       placeholder="Ex : HunterZ42"
                       maxlength="15"
                       autocomplete="nickname"
                       spellcheck="false">
                <div class="field-hint">
                    1 à 15 caractères — lettres (a-z, A-Z) et chiffres (0-9) uniquement.
                </div>
            </div>

            <div style="margin-top:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                <button class="btn btn-primary" id="btnSubmit">✦ Soumettre la quête</button>
                <button class="btn btn-secondary" id="btnReset2">Recommencer</button>
            </div>

            <div class="submit-result" id="submitResult"></div>
        </div>
    </div>

    <div style="margin-top:12px">
        <a href="index.php" class="btn btn-secondary">⬅ Retour au hub</a>
    </div>

</div>

<!-- ── Scripts ─────────────────────────────────────────────── -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="assets/js/submit.js"></script>

</body>
</html>
