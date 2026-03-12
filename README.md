# WildsQuêtesPerso

Outil communautaire pour créer, partager et découvrir des quêtes personnalisées pour Monster Hunter Wilds.

- **[Accès création de quêtes](https://concepts.esenjin.xyz/mhwilds-qp)**
- **[Accès hub communautaire](https://concepts.esenjin.xyz/mhwilds-qp/partage)**

---

## Prérequis

Le mod **[Custom Quest Loader](https://www.nexusmods.com/monsterhunterwilds/mods/1096)** de kassent est indispensable pour utiliser les quêtes en jeu.

---

## Composants

### Générateur de quêtes (`/`)
Interface web pour créer des quêtes personnalisées : choix des monstres, récompenses, paramètres, export ZIP.

![capturegenerateur](https://concepts.esenjin.xyz/cyla/fichiers/69b1ba6f86d0b_1773255279.png)

### Hub communautaire (`/partage/`)
Plateforme pour soumettre et parcourir les quêtes partagées par la communauté. Les soumissions sont vérifiées automatiquement puis validées par un modérateur avant publication.

![capturehub](https://concepts.esenjin.xyz/cyla/fichiers/69b1ba6f93e0b_1773255279.png)

---

## Structure du projet

```
mhwilds-qp/
├── index.html              # Générateur de quêtes
├── assets/js/              # Logique JS (app, data, ui, monsters, rewards, quest)
├── datas/
│   ├── enemies.json        # Base de données des monstres
│   ├── items.json          # Base de données des objets
│   └── reward_list.json    # Modèles de récompenses
└── partage/
    ├── index.php           # Hub communautaire + interface admin
    ├── soumettre.php       # Page de soumission
    ├── api.php             # Endpoints AJAX
    ├── config.php          # Configuration principale du site
    └── base/
        ├── quest_<id>_<pseudo>.zip   # Quêtes validées
        └── attente/                  # Quêtes en attente de modération
```

---

## Installation rapide

Voir [le wiki](https://git.crystalyx.net/Esenjin_Asakha/WildsQuetesPerso/wiki/) pour le guide complet, ainsi que la FAQ.

---

## Crédits

- **kassent** — mod [Custom Quest Loader](https://www.nexusmods.com/monsterhunterwilds/mods/1096) et données [mhwilds_datas](https://github.com/kassent/mhwilds_data)
- Basé sur [WildCustomQuest](https://github.com/Farad77/WildCustomQuest) de Farad77

---

*Outil non officiel, non affilié à CAPCOM©.*
