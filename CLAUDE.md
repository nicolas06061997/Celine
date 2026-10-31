# Céline

Application web (PWA) en un seul fichier `index.html` pour Céline : ménage de la semaine, courses, repas, agenda.
Publiée par GitHub Pages depuis la branche `main` : https://nicolas06061997.github.io/Celine/
Projet indépendant de La Fine Crasse et de Krinkels Plan : ne rien mélanger.

L'utilisateur parle français et n'est pas développeur : réponses courtes, en français, étape par étape.

## À chaque modification de l'appli
1. Changer `APPV` en bas de `index.html` **et** `v` dans `version.json` (même valeur, format `AAAA-MM-JJ.n`, différente à chaque fois).
   Mettre dans `notes` de `version.json` une phrase courte : elle s'affiche dans « Nouvelle mise à jour disponible ».
   Le service worker est enregistré en `sw.js?v=APPV` : son cache (`celine-<version>`) change tout seul.
2. Commit + push sur `main` ; GitHub Pages publie en 2-3 minutes.

## Lancer
`python3 -m http.server 8000` puis `http://localhost:8000/`. Pas de build, aucune bibliothèque externe.

## Données
Objet `st` sauvegardé dans `localStorage` clé `celine1` : `tasks` (jour 0-6 = lundi-dimanche, 7 = n'importe quand ; `done` = lundi de la semaine où c'est fait), `shop` (`c` = index dans `CATS`), `hist`, `meals`, `events`, `memo`.
`tidy()` remet la semaine à zéro. Sauvegarde/restauration en JSON dans les réglages.

## Partage entre les téléphones de la famille
Firebase Realtime Database du compte Google de l'utilisateur (projet `celine-fcdb2`, Belgique).
`FB` = adresse de la base, `FAM` = code fixe : tout le monde qui ouvre l'appli partage `FB/familles/FAM.json`. Un seul lien à envoyer, rien à configurer.
Écoute en direct (EventSource) + relecture toutes les 30 s.
Chaque élément a `u` (date de modif.), les suppressions vont dans `gone` : `merge()` garde le plus récent, puis PUT du tout.
Toute modification doit mettre à jour `u` (ou `mu` pour les repas, `memoU` pour le pense-bête) puis appeler `save()`.
`name`, `mealsAuto`, `noBanner` restent propres à chaque téléphone.
Règles Firebase : `{"rules":{"familles":{"$code":{".read":"$code.length >= 20",".write":"$code.length >= 20"}}}}`
La session de développement ne peut pas joindre Firebase : tester avec un faux serveur (route Playwright).

## Installation
Écran plein `#ins` (`showIns()`, `insHTML()`) au démarrage si l'appli n'est pas installée : adapte les explications
(WhatsApp/Messenger sur iPhone → bouton `x-safari-https://…` + étapes ; Android → `intent://` vers Chrome ; Safari → Partager ⬆️ → « Sur l'écran d'accueil »).
« Plus tard » le cache 24 h (clé `celine-ins`). Un iPhone ne permet pas d'installer automatiquement : seulement guider.

## Notifications d'anniversaire
Web Push : le téléphone s'abonne (`notifOn()`, clé publique `VAPID`) et range l'abonnement dans `FB/familles/FAM-push/<id>.json`.
`.github/workflows/anniversaires.yml` lance chaque matin `scripts/anniversaires.js` : jour J et veille des événements `type:'anniv'`.
Clé privée VAPID : secret GitHub `VAPID_PRIVATE` (jamais dans le code). Abonnements morts (404/410) supprimés.
`sw.js` affiche la notification (`push`) et ouvre l'agenda au clic. Sur iPhone : seulement si l'appli est installée (iOS 16.4+).
