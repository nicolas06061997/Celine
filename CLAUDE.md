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
Web Push : le premier téléphone qui active crée la paire de clés (`pushKey()`, WebCrypto) dans `FB/familles/FAM-pushkey` ; chacun s'abonne (`notifOn()`) et range l'abonnement dans `FB/familles/FAM-push/<id>.json`.
`.github/workflows/anniversaires.yml` lance chaque matin `scripts/anniversaires.js` : jour J et veille des événements `type:'anniv'`. Rappel aussi sur l'accueil le jour J.
Rien à configurer côté GitHub. Abonnements morts (404/410) supprimés.
Accueil : `alertCard()` met en haut les événements du jour (et ceux de demain) ; « À venir » commence à demain.
`sw.js` affiche la notification (`push`) et ouvre l'agenda au clic. Sur iPhone : seulement si l'appli est installée (iOS 16.4+).

## Horaire de travail (agenda)
`st.shifts` = types de journée (`{id,e,n,h,c,u}`, 6 par défaut `s1`…`s6`), `st.sched[date]={v:id,u}` (v vide = effacé), partagés comme le reste.
Heures d'un jour précis : `daySheet(k)` → `st.sched[k].h` (remplace les heures du type ; `shiftOn()` les fusionne).
« Ma semaine type » (`weekSheet()`/`applyPat()`, type + heures par jour, option 1 semaine sur 2) remplit une période ; « Recopier une semaine » (`repeatSheet()`) ; « Plusieurs jours » = mode pinceau (`paint`).
Les heures ne sont stockées dans `sched[k].h` que si elles diffèrent de celles du type (`schedVal()`) ; les fenêtres préremplissent les heures du type (`typeHM()`).
Jours de plus de 120 jours supprimés (`schedMin()`, aussi dans `merge()`). Horaire du jour et de demain sur l'accueil.
