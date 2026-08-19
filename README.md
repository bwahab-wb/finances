# Mes Comptes — suivi de comptes personnels

Application mobile de suivi de comptes, dans l'esprit de **Linxo** et **Bankin'** — mais sans
agrégation bancaire : **un classeur Excel tient lieu de base de données**. Ni serveur, ni
compte utilisateur, ni identifiants bancaires.

→ https://bwahab-wb.github.io/finances/

---

## Ce qui a été repris des deux applications

| Source | Élément repris |
|---|---|
| **Bankin'** | Accueil listant tous les comptes · budget en **jauges colorées** par catégorie avec « reste à dépenser » et alerte de dépassement · catégorisation avec **icône + couleur** par poste · répartition en familles *Essentiel / Plaisir / Épargne / Extra* |
| **Linxo** | Accueil dense qui donne tout d'un coup d'œil · graphiques d'évolution et de répartition dès la page d'accueil · groupement et nommage des comptes |
| **Les deux** | Barre d'onglets à 5 entrées · liste d'opérations groupée par jour avec sous-total · recherche et filtres en pastilles · feuille modale de détail |

Ce qui **n'a pas** été repris : la connexion aux banques, le compte utilisateur, le cashback,
les offres partenaires.

---

## Les cinq écrans

1. **Comptes** — solde net du mois en tête, flux du mois compte par compte avec sparkline des
   douze derniers mois, évolution des dépenses, taux d'épargne, top des postes, dernières
   opérations.
2. **Opérations** — recherche plein texte, filtres période / compte / catégorie, liste groupée
   par jour avec sous-total quotidien, détail en feuille modale.
3. **Budget** — sélecteur de mois, reste à dépenser global, une jauge par catégorie
   (vert → jaune → orange → rouge selon le taux de consommation), graphique d'écart au budget.
4. **Analyse** — **fenêtre navigable** : les pastilles donnent sa largeur (1 mois, 3 mois,
   1 an, tout), les flèches la déplacent d'un pas égal à cette largeur, sans chevauchement.
   Carte **Balance** comparant entrées et sorties par deux blocs proportionnels sur une base
   commune, puis répartition en donut, revenus contre dépenses par mois, variation cumulée,
   postes classés, familles et comparaison à N-1.
5. **Réglages** — import du classeur, inventaire des feuilles lues, règles de lecture, nommage
   des comptes, thème, effacement des données.

---

## Le classeur attendu

La détection est tolérante : les en-têtes sont reconnus **sans tenir compte des accents, de la
casse ni de la ponctuation**, et la ligne d'en-tête est cherchée dans les 40 premières lignes
de chaque feuille — un titre au-dessus du tableau ne gêne pas.

### Feuille d'opérations

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

Toutes les feuilles reconnues comme feuilles d'opérations sont **fusionnées**, ce qui permet
de garder un historique réparti sur plusieurs onglets.

### Feuille de budget

| Colonne | Synonymes acceptés |
|---|---|
| `Catégorie` | Cat, Poste, Rubrique |
| `Montant Prévu` | Prévu, Budget, Prévisionnel, Planned |

Montant **négatif pour une dépense**. Les lignes positives, un salaire par exemple, sont
ignorées côté budget de dépense : c'est ce qui évite un dépassement fictif. Si plusieurs
feuilles de budget existent, la plus fournie est retenue.

---

## Les arbitrages de lecture

Deux règles sont activées par défaut, et débrayables.

**Virements internes exclus.** De l'argent déplacé entre ses propres comptes n'est pas une
dépense. Sans ce filtre, c'est le premier poste du classement et il écrase les vrais.

**Épargne exclue des dépenses.** Une épargne sort du compte courant mais reste votre argent :
l'exclure rend le taux d'épargne juste et fait du solde net du mois « ce qui reste réellement
disponible ». L'arbitrage inverse se défend, d'où l'interrupteur — posé directement sur les
quatre écrans de données, avec deux positions explicites *Exclus* / *Inclus*. Le choix
s'applique partout d'un coup et survit à la fermeture de l'application.

Ces règles s'appliquent aux **analyses et au budget**, jamais à la **variation cumulée** de
l'écran Analyse : un virement déplace bien de l'argent, il compte dans les mouvements.

### Aucun solde, pour l'instant

L'application **ne dit pas ce qu'il y a sur un compte à un instant donné**, et ne le
reconstitue pas. Le classeur ne contient aucun solde de départ : tout cumul d'opérations
produirait un nombre d'allure officielle mais faux, et un chiffre faux affiché en gros est
pire qu'un chiffre absent.

Tout ce qui est affiché est donc un **flux mesuré sur une période bornée** : le solde net du
mois, ce qui est entré et sorti de chaque compte, la variation cumulée sur la fenêtre
d'analyse. Aucun de ces chiffres ne demande d'hypothèse.

---

## Confidentialité

Le fichier est lu **par le navigateur, sur l'appareil**, via SheetJS. Les données normalisées
sont conservées en **IndexedDB** locale. Aucune requête réseau ne transporte d'information
financière : il n'y a ni compte ni serveur. Le classeur d'origine n'est **jamais modifié**,
l'application ne fait que le lire. Pour corriger une ligne, on la corrige dans Excel et on
réimporte.

---

## Sur ordinateur

<<<<<<< HEAD
Au-delà de **900 px de large**, la même application se réagence : la barre d'onglets passe en
haut de la fenêtre et le flux de cartes se répartit sur **deux colonnes** (trois au-delà de
1 500 px). En dessous du seuil, rien ne change — c'est la version téléphone à l'identique.

La barre haute n'est pas un nouveau composant : c'est **la capsule du téléphone, posée en haut
plutôt qu'en bas**. Icône au-dessus du libellé, largeur bornée à 620 px, et la lentille de
verre garde sa mécanique d'origine — un cinquième de la barre par cran. Il suffit de quatre
déclarations pour l'y amener.

C'est ce qui permet de **centrer le contenu sur la fenêtre** et non sur une place restante :
une colonne latérale déplace forcément tout le reste vers la droite, une barre horizontale ne
déplace rien.
=======
Au-delà de **900 px de large**, la même application se réagence : la barre d'onglets basse se
redresse en **rail vertical à gauche**, et le flux de cartes se répartit sur **deux colonnes**,
trois au-delà de 1 500 px. En dessous du seuil, rien ne change.
>>>>>>> f5fc75c1a60623ba20b876ca79e77072396dfb52

Rien n'est dupliqué : ni second jeu de vues, ni feuille de style dédiée. Une correction faite
une fois vaut pour les deux formats, ce qui évite le piège des versions « mobile » et
« bureau » qui divergent au fil des mois.

## Installer sur le téléphone

C'est une PWA : elle s'installe sur l'écran d'accueil et fonctionne ensuite hors ligne.

- **iOS / Safari** — ouvrir l'URL, *Partager* → *Sur l'écran d'accueil*.
- **Android / Chrome** — ouvrir l'URL, menu ⋮ → *Installer l'application*.

Le service worker met en cache la coquille applicative uniquement ; les données restent en
IndexedDB. Les fichiers de l'application sont servis **réseau d'abord**, cache en secours :
une nouvelle version apparaît dès le premier rechargement.

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

Aucun build, aucune dépendance à installer : ce sont des fichiers statiques. En cas de fork,
penser à incrémenter `VERSION` dans `sw.js` à chaque publication, sans quoi les appareils déjà
visités continuent de servir l'ancienne version depuis leur cache.

### Lancer en local

Le service worker et le chargement des scripts exigent HTTP : ouvrir `index.html` en `file://`
ne fonctionne pas. N'importe quel serveur statique convient.

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Tous les chemins sont relatifs : l'application fonctionne à la racine d'un domaine comme dans
un sous-dossier, sans reconfiguration.

---

## Interface

L'interface reprend le matériau translucide introduit par iOS 26 : un fond coloré vivant —
quatre halos qui dérivent lentement — et, au-dessus, des surfaces de verre qui le laissent
transparaître, accrochent la lumière sur leurs arêtes et **flottent** au lieu d'être posées.
La barre d'onglets porte une lentille qui *glisse* d'un onglet à l'autre avec un léger
dépassement élastique, bordée de franges violet et cyan — l'aberration chromatique qui signale
une lentille.

Le fond n'est pas décoratif : sans quelque chose derrière, du verre translucide ne montre rien
et l'effet retombe à plat. Le flou d'arrière-plan est réservé aux éléments qui recouvrent du
contenu en mouvement ; les cartes qui défilent s'en passent, l'aurore derrière elles étant un
dégradé lisse.

**Le verre coûte du contraste, il faut donc le mesurer sur la surface réellement composée** —
halo le plus saturé plus verre — et non sur un fond opaque théorique. La palette est validée
pour le daltonisme sur ces surfaces : bande de clarté, plancher de chroma, séparation CVD et
vision normale, tous les seuils franchis. Quelques teintes passent malgré tout sous 3:1 :
chaque graphique catégoriel est donc doublé d'une **légende et d'une vue tableau**, l'identité
ne reposant jamais sur la couleur seule. Au-delà de huit catégories, les suivantes sont
regroupées dans « Autres » plutôt que de recevoir une teinte générée.

Trois réglages système sont respectés : `prefers-reduced-transparency` rend le verre opaque,
`prefers-reduced-motion` fige les halos, `forced-colors` supprime le fond et cerne les
surfaces.

---

## Crédits

Lecture des classeurs : [SheetJS](https://sheetjs.com/) 0.18.5, licence Apache-2.0
(voir `vendor/LICENSE-sheetjs.txt`). Tout le reste est écrit à la main, sans framework.
