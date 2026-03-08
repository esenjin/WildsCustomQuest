# WildCustomQuest - Générateur de quêtes personnalisées pour Monster Hunter Wilds

Un outil pour créer des quêtes personnalisées dans Monster Hunter Wilds via une interface conviviale.

**Essayer en ligne : [https://concepts.esenjin.xyz/mhwilds-qp](https://concepts.esenjin.xyz/mhwilds-qp)**

## Présentation

WildsQuetesPerso vous permet de créer des chasses personnalisées en sélectionnant des monstres, en définissant des récompenses et en configurant les paramètres de la quête depuis une interface web simple. Générez des fichiers de quête importables directement dans le jeu pour une expérience de chasse sur mesure.

## Prérequis

Cet outil nécessite [Custom Quest Loader](https://www.nexusmods.com/monsterhunterwilds/mods/1096) de kassent pour fonctionner. Veuillez installer ce mod avant d'utiliser des quêtes personnalisées.

Un grand merci à kassent pour avoir créé le mod Custom Quest Loader qui rend tout cela possible !

## Fonctionnalités

- Créez des quêtes avec des titres, descriptions et paramètres personnalisés
- Choisissez parmi le roster complet de monstres de Monster Hunter Wilds
- Ajoutez des récompenses personnalisées avec quantités et probabilités de drop
- Support multilingue (Français, Anglais, Japonais, Chinois)
- Exportez les fichiers de quête prêts à l'emploi en jeu

## Comment utiliser

1. **Installation** :
   - Installez [Custom Quest Loader](https://www.nexusmods.com/monsterhunterwilds/mods/1096) de kassent
   - Suivez les instructions d'installation du mod

2. **Création de quêtes** :
   - Ouvrez `index.html` dans un navigateur web
   - Renseignez les détails de la quête (titre, description, difficulté, etc.)
   - Sélectionnez les monstres de votre quête
   - Configurez les objets de récompense avec leurs quantités et probabilités
   - Générez et téléchargez les fichiers de quête

3. **Installation des quêtes** :
   - Extrayez le fichier ZIP créé par le générateur
   - Placez les fichiers `.raw.json` et `.ext.json` dans le dossier approprié tel qu'indiqué par Custom Quest Loader (normalement dans `\MonsterHunterWilds\reframework\plugins\PermanentEventQuest\quests`)
   - Lancez le jeu et profitez de votre quête personnalisée !

## Structure des fichiers

- `index.html` : Fichier principal de l'application
- `enemies.json` : Base de données de tous les monstres
- `items.json` : Base de données de tous les objets
- `reward_list_*.json` : Modèles de récompenses par langue
- `quest_examples/` : Exemples de fichiers de quête pour référence

## Crédits

- Cet outil a été créé en complément du mod [Custom Quest Loader](https://www.nexusmods.com/monsterhunterwilds/mods/1096) de kassent
- Un grand merci à kassent pour avoir rendu les quêtes personnalisées possibles dans Monster Hunter Wilds
- Merci à kassent pour le dépôt [mhwilds_datas](https://github.com/kassent/mhwilds_data/tree/master) avec les données complètes à jour.
- Ce projet est un fork de [WildCustomQuest](https://github.com/Farad77/WildCustomQuest) qui ajoute essentiellement une traduction FR

## Mentions légales

Ceci est un outil non officiel créé par des fans et n'est affilié ni à CAPCOM ni à Monster Hunter Wilds. Tous les éléments et données du jeu référencés appartiennent à leurs propriétaires respectifs.