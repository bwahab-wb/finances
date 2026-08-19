# Mes Comptes — suivi de comptes personnels

Application mobile de suivi des comptes personnels, dans l'esprit de **Linxo** et **Bankin'** —
mais sans agrégation bancaire : **le classeur `OperationsOfficiel.xlsm` tient lieu de base de
données**.

En ligne : `https://bwahab-wb.github.io/finances/`

---

## Ce qui a été repris des deux applications

| Source | Élément repris |
|---|---|
| **Bankin'** | Accueil « Comptes » listant tous les comptes avec le patrimoine consolidé en tête · budget en **jauges colorées** par catégorie avec « reste à dépenser » et alerte visuelle de dépassement · catégorisation avec **icône + couleur** par poste · répartition simplifiée en familles *Essentiel / Plaisir / Épargne / Extra* |
| **Linxo** | Accueil dense qui donne tout d'un coup d'œil · **prévisionnel à 30 jours** avec indicateur météo ☀️/🌧️ · graphiques d'évolution et répartition dès la page d'accueil · groupement et nommage des comptes |
| **Les deux** | Barre d'onglets basse à 5 entrées · liste d'opérations groupée par jour avec sous-total · recherche et filtres en pastilles · feuille modale de détail |

Ce qui **n'a pas** été repris : la connexion aux banques, le compte utilisateur, le cashback,
les offres partenaires. Il n'y a ni serveur, ni identifiant, ni réseau.

---

## Les cinq écrans

1. **Comptes** — patrimoine consolidé, prévisionnel 30 jours, cartes de comptes avec
   sparkline, solde net et taux d'épargne du mois, top des postes, dernières opérations.
2. **Opérations** — recherche plein texte, filtres période / compte / catégorie,
   liste groupée par jour avec sous-total quotidien, détail en feuille modale.
3. **Budget** — sélecteur de mois, reste à dépenser global, une jauge par catégorie
   (vert → jaune → orange → rouge selon le taux de consommation), graphique d'écart au budget.
4. **Analyse** — **fenêtre navigable** : les pastilles donnent sa largeur (1 mois, 3 mois,
   1 an, tout), les flèches la déplacent d'un pas égal à cette largeur, sans chevauchement.
   Carte **Balance** comparant entrées et sorties de la fenêtre par deux blocs proportionnels
   sur une base commune, puis répartition en donut, revenus vs dépenses par mois, solde
   cumulé, postes classés, familles et comparaison à N-1 — devenue exacte depuis que la
   fenêtre est ancrée sur un mois plutôt que sur « aujourd'hui ».
5. **Réglages** — import du classeur, inventaire des feuilles lues, règles de lecture,
   nommage des comptes et soldes d'ouverture, thème, effacement des données.

---

## Le classeur attendu

La détection est tolérante : les en-têtes sont reconnus **sans tenir compte des accents,
de la casse ni de la ponctuation**, et la ligne d'en-tête est cherchée dans les 40 premières
lignes de chaque feuille (un titre au-dessus du tableau ne gêne pas).

### Feuille d'opérations — le `TabOpérations` du classeur

| Colonne | Synonymes acceptés | Obligatoire |
|---|---|---|
| `Date` | Date opération, Date valeur, Date comptable, Jour | **oui** |
| `Montant` | Somme, Valeur, Amount | **oui**, sauf si Débit/Crédit |
| `Débit` / `Crédit` | Dépense/Sortie, Recette/Entrée | alternative au montant signé |
| `Libellé` | Description, Intitulé, Nature, Objet | non |
| `Catégorie` | Cat, Poste, Rubrique | non |
| `BK` | Compte, Banque, Cpte | non |
| `Type` | Moyen de paiement, Mode | non |

Le montant est **signé** : négatif = sortie d'argent. Formats acceptés : `-1 234,56`,
`1.234,56`, `1,234.56`, `(120,00)`, `45,00 €`.

Toutes les feuilles reconnues comme feuilles d'opérations sont **fusionnées** — utile pour
la reprise d'historique HB/SG remontée à septembre 2021.

### Feuille de budget — le `Budget2025Nov`

| Colonne | Synonymes acceptés |
|---|---|
| `Catégorie` | Cat, Poste, Rubrique |
| `Montant Prévu` | Prévu, Budget, Prévisionnel, Planned |

Montant **négatif pour une dépense**. Les lignes positives (ex. `Salaire +1 600`) sont
ignorées côté budget de dépense — c'est ce qui évite le dépassement fictif. Si plusieurs
feuilles de budget existent, la plus fournie est retenue.

---

## Les arbitrages de lecture

Deux règles reprises du rapport Power BI « Finances personnelles », activées par défaut et
débrayables :

- **Virements internes exclus.** De l'argent déplacé entre tes propres comptes, pas une
  dépense. Sans ce filtre, c'est le premier poste du classement et il écrase les vrais.
- **Épargne exclue des dépenses.** Une épargne sort du compte courant mais reste ton argent :
  l'exclure rend le taux d'épargne juste et fait du solde net « ce qui reste réellement
  disponible ». L'arbitrage inverse est défendable, d'où l'interrupteur.

Ces règles s'appliquent aux **analyses et au budget**, jamais aux **soldes** : un virement
déplace bien de l'argent, il compte toujours dans le solde de chaque compte et dans le solde
cumulé.

L'épargne est l'arbitrage qui se rediscute le plus souvent : son interrupteur est donc posé
**directement sur les quatre écrans de données** (Comptes, Opérations, Budget, Analyse), au-dessus
des chiffres qu'il modifie, plutôt que d'obliger à passer par les réglages. Deux positions
explicites — *Exclus* / *Inclus* — au lieu d'une bascule : sur un bouton unique, on ne sait
jamais si l'étiquette décrit l'état courant ou ce qu'un appui produirait. Le réglage est
unique et persistant : le changer sur un écran le change partout, et il survit à la fermeture
de l'application. Les virements internes, eux, restent dans les réglages — cet arbitrage-là
ne se rediscute pas au quotidien.

Le contrôle tient sur **une seule ligne en capsule** (~44 px). Une première version en carte
à deux lignes en occupait 109, soit un quart de l'écran utile d'un téléphone avant même le
premier chiffre : pour un réglage d'arrière-plan, c'était trop cher. L'explication complète de
la règle reste dans les réglages ; sur les écrans de données, seul l'état est affiché. Si le
libellé ne tient pas, c'est lui qui s'abrège — les deux cibles gardent leur taille.

Les mesures reprennent celles du modèle Power BI (revenus, dépenses en positif, solde net,
taux d'épargne, solde cumulé, dépenses N-1, évolution %, budget, écart, % consommé).

### Soldes d'ouverture

Le classeur ne contient pas de solde de départ. Tant qu'aucun solde d'ouverture n'est saisi,
l'écran d'accueil affiche « **Solde reconstitué** » — le cumul des opérations, pas le solde
réel. Saisis les soldes de départ dans les réglages pour obtenir le vrai patrimoine.

### Prévisionnel

Seules les opérations **récurrentes détectées** sont projetées : même libellé normalisé,
montant stable (écart-type < 20 % de la moyenne), présent sur au moins 3 mois distincts,
rejouées à leur jour habituel. Les dépenses ponctuelles ne sont pas extrapolées — un
prévisionnel prudent vaut mieux qu'une projection inventée.

---

## Confidentialité

Le fichier est lu **par le navigateur, sur l'appareil**, via SheetJS. Les données normalisées
sont conservées en **IndexedDB** locale. Aucune requête réseau ne transporte de donnée
financière, il n'y a ni compte ni serveur. Le classeur d'origine n'est **jamais modifié** :
l'application ne fait que le lire. Pour corriger une ligne, on la corrige dans Excel et on
réimporte.

---

## Installer sur le téléphone

C'est une PWA : elle s'installe sur l'écran d'accueil et fonctionne ensuite hors ligne.

- **iOS / Safari** — ouvrir l'URL, *Partager* → *Sur l'écran d'accueil*.
- **Android / Chrome** — ouvrir l'URL, menu ⋮ → *Installer l'application*.

Le service worker met en cache la coquille applicative uniquement ; les données restent en
IndexedDB.

### Publier une mise à jour

**Bumper `VERSION` dans `sw.js` à chaque publication.** Le nom du cache est ce qui déclenche
la purge de l'ancien : tant qu'il ne change pas, l'étape `activate` n'a rien à supprimer et
l'ancienne version survit indéfiniment sur les appareils qui ont déjà ouvert l'application.

Le service worker sert les fichiers de l'application (`index.html`, `assets/`) en
**réseau d'abord**, cache en secours : une nouvelle version apparaît dès le premier
rechargement. Seuls la bibliothèque et les icônes, qui ne changent pas, restent en cache
d'abord. Quand un nouveau worker prend la main, la page se recharge une fois toute seule —
sans quoi elle continuerait de tourner sur les CSS et JS déjà chargés.

En cas de doute sur ce qui est réellement servi, ouvrir l'URL dans une **fenêtre privée** :
elle n'a ni service worker ni cache, et montre donc l'état réel du déploiement.

---

## Structure

```
.
├── index.html                 coquille : barre de titre, vue, onglets, feuille modale
├── assets/
│   ├── app.css                design system (tokens, composants, thème clair/sombre)
│   ├── data.js                lecture Excel, normalisation, mesures, règles, IndexedDB
│   ├── charts.js              graphiques SVG + formatage FR
│   ├── views.js               les cinq écrans
│   └── app.js                 état, navigation, événements, import, persistance
├── vendor/xlsx.mini.min.js    SheetJS 0.18.5 (Apache-2.0), embarqué pour le hors-ligne
├── icons/                     icônes PWA
├── manifest.webmanifest
├── sw.js                      cache de la coquille
└── .gitignore                 bloque *.xlsm / *.xlsx / *.csv — aucun classeur ne doit
                               atterrir dans ce dépôt public
```

Aucun build, aucune dépendance à installer : ce sont des fichiers statiques.

### Lancer en local

Le service worker et le chargement des scripts exigent HTTP : ouvrir `index.html` en
`file://` ne fonctionne pas. N'importe quel serveur statique convient.

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Tous les chemins sont relatifs : l'application fonctionne à la racine d'un domaine comme
dans un sous-dossier, sans reconfiguration.

### Liquid Glass

L'interface reprend le matériau introduit par iOS 26 : un fond coloré vivant (quatre halos
qui dérivent lentement) et, au-dessus, des surfaces translucides qui le laissent
transparaître, accrochent la lumière sur leurs arêtes et **flottent** au lieu d'être posées —
barre d'onglets détachée en capsule, feuille modale décollée des bords, rayons concentriques.

La **barre d'onglets** porte une lentille de verre qui *glisse* d'un onglet à l'autre avec un
léger dépassement élastique, bordée de franges violet et cyan — l'aberration chromatique qui
signale une lentille. La réfraction optique d'iOS 26 repose sur un `feDisplacementMap` que
Safari mobile refuse dans `backdrop-filter` : l'effet est donc reproduit par ses signes
visibles (grossissement, spéculaire, franges, ressort du déplacement), pas par un calcul
optique. Le **sélecteur de période** est une carte à flèches cerclées et libellé centré, avec
une rangée de pastilles contournées qui passe à la ligne plutôt que de défiler.

Trois décisions non évidentes :

- **Le fond n'est pas une décoration.** Sans quelque chose derrière, du verre translucide ne
  montre rien et l'effet retombe à plat. Les halos sont dimensionnés en `vmax`, jamais en
  `vw` : sur un téléphone (390 × 844), des halos en `vw` se réduisent à de petits disques
  tassés dans les coins et laissent le centre nu.
- **Le flou d'arrière-plan est réservé aux éléments flottants** — barre de titre, barre
  d'onglets, feuille, pastilles — c'est-à-dire à ceux qui recouvrent du contenu en mouvement.
  Les cartes qui défilent s'en passent : l'aurore derrière elles est un dégradé lisse, la
  flouter ne change rien à l'œil et coûterait une couche de composition par carte.
- **Le verre coûte du contraste, il faut le mesurer.** Les couleurs ne sont pas validées sur
  un fond opaque théorique mais sur la surface **réellement composée** (halo le plus saturé +
  verre).

### Palette

Validée pour le daltonisme sur ces surfaces composées (`#eff0fd` clair, `#1e2e4b` sombre) :
bande de clarté, plancher de chroma, séparation CVD (ΔE 9,1 / 8,4) et vision normale
(19,6 / 19,3) — tous les seuils sont franchis. Quatre teintes passent sous 3:1 en clair, une
en sombre : chaque graphique catégoriel est donc doublé d'une **légende et d'une vue
tableau**, l'identité ne repose jamais sur la couleur seule. Au-delà de huit catégories, les
suivantes sont regroupées dans « Autres » plutôt que de recevoir une teinte générée. Les
encres du texte secondaire ont été recalculées pour tenir 4,5:1 sur ces mêmes surfaces.

Trois réglages système sont respectés : `prefers-reduced-transparency` rend le verre opaque,
`prefers-reduced-motion` fige les halos, `forced-colors` supprime le fond et cerne les
surfaces.

---

## Crédits

Lecture des classeurs : [SheetJS](https://sheetjs.com/) 0.18.5, licence Apache-2.0
(voir `vendor/LICENSE-sheetjs.txt`). Tout le reste est écrit à la main, sans framework.
