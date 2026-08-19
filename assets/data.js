/* ==========================================================================
   data.js — le classeur Excel tient lieu de base de données.
   Aucune connexion bancaire : le fichier est lu dans le navigateur (SheetJS),
   normalisé, puis conservé en IndexedDB sur l'appareil. Rien ne sort du téléphone.

   Schéma attendu, repris de OperationsOfficiel.xlsm :
     TabOpérations  : Date · Libellé · Catégorie · BK · Type · Montant (signé)
     Budget2025Nov  : Catégorie · Montant Prévu (signé, négatif = dépense)
   La détection reste tolérante : en-têtes reconnus par synonymes, colonnes
   Débit/Crédit acceptées à la place d'un montant signé, feuilles multiples
   fusionnées (utile pour les reprises d'historique HB/SG).
   ========================================================================== */

const Data = (() => {
  "use strict";

  /* ---------- Normalisation ---------- */

  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const HEADERS = {
    date: ["date", "dateoperation", "datedeloperation", "datevaleur", "datecomptable", "jour"],
    label: ["libelle", "libelledoperation", "description", "intitule", "operation", "detail", "nature", "objet"],
    category: ["categorie", "cat", "poste", "rubrique"],
    account: ["bk", "compte", "banque", "cpte", "account", "bank"],
    type: ["type", "typeoperation", "moyendepaiement", "modedepaiement", "mode", "moyen"],
    amount: ["montant", "montanteuro", "montanteur", "somme", "valeur", "amount", "montanteu"],
    debit: ["debit", "depense", "sortie"],
    credit: ["credit", "recette", "entree"],
    planned: ["montantprevu", "prevu", "budget", "montantbudget", "previsionnel", "montantprevisionnel", "planned"],
  };

  function matchHeader(cell) {
    const n = norm(cell);
    if (!n) return null;
    for (const [key, syns] of Object.entries(HEADERS)) {
      if (syns.includes(n)) return key;
    }
    return null;
  }

  /** Excel stocke les dates en série depuis 1900 ; on accepte aussi Date et texte FR. */
  function toDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "number") {
      if (v < 1 || v > 60000) return null;
      const ms = Math.round((v - 25569) * 86400000);
      const d = new Date(ms);
      return isNaN(d) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (m) {
      let [, d, mo, y] = m;
      y = +y < 100 ? 2000 + +y : +y;
      const dt = new Date(y, +mo - 1, +d);
      return isNaN(dt) ? null : dt;
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const dt = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(dt) ? null : dt;
    }
    return null;
  }

  /** Gère « 1 234,56 », « -1.234,56 », « 1,234.56 », « (120,00) », « 45,00 € ». */
  function toNumber(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/ |\s/g, "").replace(/[€$£]/g, "");
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1);
    }
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > -1 && lastDot > -1) {
      // le séparateur décimal est le dernier des deux
      if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (lastComma > -1) {
      s = s.replace(/,/g, ".");
    }
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  }

  /* ---------- Lecture du classeur ---------- */

  /**
   * Cherche la ligne d'en-tête dans les 40 premières lignes : celle qui reconnaît
   * le plus de colonnes connues. Retourne { row, map: {clé -> index} }.
   */
  function findHeader(rows) {
    let best = null;
    const limit = Math.min(rows.length, 40);
    for (let r = 0; r < limit; r++) {
      const row = rows[r] || [];
      const map = {};
      let hits = 0;
      for (let c = 0; c < row.length; c++) {
        const key = matchHeader(row[c]);
        if (key && !(key in map)) {
          map[key] = c;
          hits++;
        }
      }
      if (hits >= 2 && (!best || hits > best.hits)) best = { row: r, map, hits };
    }
    return best;
  }

  function classify(map) {
    const hasAmount = "amount" in map || "debit" in map || "credit" in map;
    if ("date" in map && hasAmount) return "operations";
    if ("category" in map && "planned" in map) return "budget";
    return null;
  }

  function readOperations(rows, header, sheetName) {
    const { row: hr, map } = header;
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => c == null || c === "")) continue;

      const date = toDate(row[map.date]);
      if (!date) continue;

      let amount = null;
      if ("amount" in map) amount = toNumber(row[map.amount]);
      if (amount == null && ("debit" in map || "credit" in map)) {
        const d = "debit" in map ? toNumber(row[map.debit]) : null;
        const c = "credit" in map ? toNumber(row[map.credit]) : null;
        if (d != null && d !== 0) amount = -Math.abs(d);
        else if (c != null && c !== 0) amount = Math.abs(c);
      }
      if (amount == null || amount === 0) continue;

      out.push({
        date: date.getTime(),
        label: String(row[map.label] ?? "").trim() || "Opération",
        category: String(row[map.category] ?? "").trim() || "Non catégorisé",
        account: String(row[map.account] ?? "").trim() || "—",
        type: String(row[map.type] ?? "").trim(),
        amount: Math.round(amount * 100) / 100,
        sheet: sheetName,
      });
    }
    return out;
  }

  function readBudget(rows, header) {
    const { row: hr, map } = header;
    const out = [];
    for (let r = hr + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const cat = String(row[map.category] ?? "").trim();
      const amt = toNumber(row[map.planned]);
      if (!cat || amt == null) continue;
      out.push({ category: cat, planned: Math.round(amt * 100) / 100 });
    }
    return out;
  }

  /** Point d'entrée : ArrayBuffer -> { operations, budget, sheets, warnings } */
  function parseWorkbook(buffer, fileName) {
    if (typeof XLSX === "undefined") throw new Error("La bibliothèque de lecture Excel n'a pas pu être chargée.");

    const wb = XLSX.read(buffer, { type: "array", cellDates: true, cellNF: false, cellText: false });
    const operations = [];
    let budget = [];
    const sheets = [];
    const warnings = [];

    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: null });
      if (!rows.length) continue;

      const header = findHeader(rows);
      if (!header) {
        sheets.push({ name, kind: "ignorée", rows: 0 });
        continue;
      }
      const kind = classify(header.map);
      if (kind === "operations") {
        const ops = readOperations(rows, header, name);
        operations.push(...ops);
        sheets.push({ name, kind: "opérations", rows: ops.length });
      } else if (kind === "budget") {
        const b = readBudget(rows, header);
        // Plusieurs onglets de budget peuvent coexister (Budget2025Nov, Budget2026…) :
        // on garde le plus fourni plutôt que de les additionner.
        if (b.length > budget.length) budget = b;
        sheets.push({ name, kind: "budget", rows: b.length });
      } else {
        sheets.push({ name, kind: "ignorée", rows: 0 });
      }
    }

    if (!operations.length) {
      throw new Error(
        "Aucune opération trouvée. Une feuille doit contenir au minimum une colonne de date et une colonne de montant (ou Débit/Crédit)."
      );
    }

    operations.sort((a, b) => a.date - b.date || a.label.localeCompare(b.label));

    // Doublons stricts : signalés, jamais supprimés en silence (deux achats
    // identiques le même jour sont légitimes).
    const seen = new Set();
    let dups = 0;
    for (const o of operations) {
      const k = `${o.date}|${o.label}|${o.amount}|${o.account}`;
      if (seen.has(k)) dups++;
      else seen.add(k);
    }
    if (dups) warnings.push(`${dups} opération${dups > 1 ? "s" : ""} en double détectée${dups > 1 ? "s" : ""} (non supprimée${dups > 1 ? "s" : ""}).`);
    if (!budget.length) warnings.push("Aucun onglet de budget reconnu : l'écran Budget restera vide.");

    return { operations, budget, sheets, warnings, fileName, importedAt: Date.now() };
  }

  /* ---------- Catalogue de catégories ---------- */

  const ICONS = [
    [/virementinterne|transfertinterne|interne/, "↔️"],
    [/salaire|revenu|paie|paye|remuneration/, "💰"],
    [/epargne|livret|pel|placement|investissement/, "🐖"],
    [/loyer|logement|immobilier|charge(s)?copro|habitation/, "🏠"],
    [/course|alimentation|supermarche|epicerie|nourriture/, "🛒"],
    [/restaurant|resto|bar|cafe|brasserie|fastfood|traiteur/, "🍽️"],
    [/carburant|essence|gasoil|peage|auto|voiture|garage|parking/, "⛽"],
    [/transport|train|sncf|metro|bus|tram|taxi|uber|velo/, "🚆"],
    [/sante|pharmacie|medecin|mutuelle|dentiste|opticien|hopital/, "💊"],
    [/shopping|vetement|habillement|chaussure|mode/, "🛍️"],
    [/loisir|sport|cinema|sortie|spectacle|concert|jeu|musique/, "🎬"],
    [/voyage|vacances|hotel|avion|sejour/, "✈️"],
    [/abonnement|telephone|internet|box|mobile|streaming|forfait/, "📱"],
    [/energie|electricite|gaz|eau|edf|engie/, "💡"],
    [/assurance|assur/, "🛡️"],
    [/impot|taxe|fisc|amende|contravention/, "🏛️"],
    [/banque|frais|commission|agios|interet/, "🏦"],
    [/retrait|especes|dab|liquide/, "🏧"],
    [/cadeau|don|charite|association/, "🎁"],
    [/education|formation|ecole|etude|scolarite|universite/, "🎓"],
    [/enfant|famille|bebe|creche|garde/, "👶"],
    [/animal|veterinaire|chien|chat/, "🐾"],
    [/coiffeur|beaute|soin|esthetique/, "💈"],
    [/bricolage|jardin|meuble|ameublement|deco/, "🔧"],
    [/credit|pret|emprunt|remboursement/, "🏷️"],
  ];

  function iconFor(category) {
    const n = norm(category);
    for (const [re, ic] of ICONS) if (re.test(n)) return ic;
    return "📌";
  }

  // Les quatre familles de la vue simplifiée, reprises de la « répartition » Bankin'.
  const FAMILIES = [
    [/loyer|logement|energie|electricite|eau|gaz|assurance|impot|taxe|sante|mutuelle|course|alimentation|supermarche|transport|carburant|abonnement|telephone|internet|banque|frais|credit|pret|enfant|creche|education|scolarite/, "Essentiel"],
    [/epargne|livret|pel|placement|investissement/, "Épargne"],
    [/restaurant|resto|bar|cafe|loisir|sport|cinema|sortie|shopping|vetement|voyage|vacances|hotel|cadeau|beaute|coiffeur|jeu|musique/, "Plaisir"],
  ];

  function familyFor(category) {
    const n = norm(category);
    for (const [re, f] of FAMILIES) if (re.test(n)) return f;
    return "Extra";
  }

  const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];

  /**
   * Catalogue construit UNE FOIS sur l'ensemble des données, jamais sur la vue
   * filtrée : la couleur suit la catégorie, pas son rang du moment. Un filtre qui
   * réduit le nombre de séries ne repeint donc jamais les survivantes.
   * Au-delà de 8 catégories, les suivantes basculent en gris « Autres » —
   * aucune teinte n'est générée à la volée.
   */
  function buildCatalog(operations) {
    const totals = new Map();
    for (const o of operations) {
      if (o.amount >= 0) continue;
      totals.set(o.category, (totals.get(o.category) || 0) + -o.amount);
    }
    for (const o of operations) if (!totals.has(o.category)) totals.set(o.category, 0);

    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const cat = new Map();
    ranked.forEach(([name], i) => {
      cat.set(name, {
        name,
        icon: iconFor(name),
        family: familyFor(name),
        slot: i < SLOTS.length ? SLOTS[i] : "--s-rest",
        colored: i < SLOTS.length,
        rank: i,
      });
    });
    return cat;
  }

  const FALLBACK = { name: "Non catégorisé", icon: "📌", family: "Extra", slot: "--s-rest", colored: false, rank: 99 };

  /* ---------- Comptes ---------- */

  const ACCOUNT_LABELS = {
    HB: { name: "Hello bank!", kind: "Compte courant", slot: "--s1" },
    SG: { name: "Société Générale", kind: "Compte courant", slot: "--s2" },
    RV: { name: "Revolut", kind: "Compte courant", slot: "--s3" },
  };

  function buildAccounts(operations, overrides = {}) {
    const codes = [...new Set(operations.map((o) => o.account))].sort();
    return codes.map((code, i) => {
      const known = ACCOUNT_LABELS[code.toUpperCase()] || {};
      const ov = overrides[code] || {};
      return {
        code,
        name: ov.name || known.name || code,
        kind: known.kind || "Compte",
        slot: known.slot || SLOTS[i % SLOTS.length],
      };
    });
  }

  /* ---------- Règles de lecture ---------- */

  /**
   * Deux arbitrages hérités du rapport Power BI :
   *  — les virements internes ne sont pas des dépenses, juste de l'argent déplacé
   *    entre comptes ; ils écrasent le classement s'ils restent dans le périmètre ;
   *  — l'épargne est une sortie de compte courant mais un gain de patrimoine :
   *    l'exclure des dépenses rend le taux d'épargne juste.
   * Les deux restent débrayables dans les réglages.
   */
  // Les libellés réels sont au pluriel (« Virements internes ») : le singulier
  // seul laisserait passer toute la catégorie.
  const isInternalCat = (c) => /virements?internes?|transferts?internes?/.test(norm(c));
  const isSavingCat = (c) => /^(epargnes?|sorties?depargne|livrets?|pel)/.test(norm(c));

  const isInternal = (o) => isInternalCat(o.category);
  const isSaving = (o) => isSavingCat(o.category);

  /** Vrai si la catégorie doit être écartée des analyses, quelles que soient
      les données auxquelles on l'applique (opérations comme lignes de budget). */
  function isExcluded(category, rules) {
    if (rules.excludeInternal && isInternalCat(category)) return true;
    if (rules.excludeSavings && isSavingCat(category)) return true;
    return false;
  }

  function applyRules(operations, rules) {
    return operations.filter((o) => !isExcluded(o.category, rules));
  }

  /* ---------- Mesures ---------- */

  const monthKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  /** Les mesures du modèle Power BI, transposées. Les dépenses sortent en positif. */
  function measures(ops) {
    let revenus = 0,
      depenses = 0;
    for (const o of ops) {
      if (o.amount > 0) revenus += o.amount;
      else depenses += -o.amount;
    }
    const soldeNet = revenus - depenses;
    return {
      revenus,
      depenses,
      soldeNet,
      tauxEpargne: revenus ? soldeNet / revenus : 0,
      nbOperations: ops.length,
      nbMois: new Set(ops.map((o) => monthKey(o.date))).size,
    };
  }

  function byCategory(ops, { expensesOnly = true } = {}) {
    const m = new Map();
    for (const o of ops) {
      if (expensesOnly && o.amount >= 0) continue;
      const v = expensesOnly ? -o.amount : o.amount;
      const e = m.get(o.category) || { category: o.category, total: 0, count: 0 };
      e.total += v;
      e.count++;
      m.set(o.category, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }

  function byMonth(ops) {
    const m = new Map();
    for (const o of ops) {
      const k = monthKey(o.date);
      const e = m.get(k) || { key: k, revenus: 0, depenses: 0 };
      if (o.amount > 0) e.revenus += o.amount;
      else e.depenses += -o.amount;
      m.set(k, e);
    }
    return [...m.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((e) => ({ ...e, net: e.revenus - e.depenses }));
  }

  /** Variation cumulée sur la période affichée : la somme des mouvements, en
      partant de zéro. Ce n'est PAS un solde — le classeur ne contient aucun
      point de départ, et tant qu'on n'en aura pas, aucun chiffre de cette
      application ne prétend dire ce qu'il y a sur un compte à un instant donné.

      Calculée sur les opérations NON filtrées par les règles : un virement
      interne déplace bien de l'argent, il compte dans la variation. */
  function cumulative(ops) {
    let run = 0;
    return ops
      .slice()
      .sort((a, b) => a.date - b.date)
      .map((o) => {
        run += o.amount;
        return { date: o.date, value: run };
      });
  }

  /* ---------- Persistance ---------- */

  const DB_NAME = "mes-comptes";
  const STORE = "kv";

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function save(key, value) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function load(key) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  }

  async function clear() {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ---------- Jeu de démonstration ---------- */

  /** Reproduit la forme du classeur (mêmes colonnes, mêmes comptes) pour que
      l'interface soit explorable avant d'avoir importé quoi que ce soit. */
  function demo() {
    const cats = [
      ["Loyer", -720, 1, "HB", 3],
      ["Courses", -95, 0, "HB", 0],
      ["Restaurants", -28, 0, "RV", 0],
      ["Carburant", -68, 0, "SG", 0],
      ["Abonnements", -42, 12, "HB", 1],
      ["Énergie", -89, 8, "HB", 1],
      ["Assurance", -46, 5, "SG", 1],
      ["Santé", -34, 0, "HB", 0],
      ["Shopping", -73, 0, "RV", 0],
      ["Loisirs", -39, 0, "RV", 0],
      ["Transport", -21, 0, "SG", 0],
      ["Voyages", -260, 0, "RV", 0],
      ["Téléphone", -19, 15, "HB", 1],
    ];
    const ops = [];
    const end = new Date();
    const start = new Date(end.getFullYear() - 2, end.getMonth(), 1);
    let id = 0;
    const rnd = (seed) => {
      const x = Math.sin(seed * 9301 + 49297) * 233280;
      return x - Math.floor(x);
    };

    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      const y = d.getFullYear(),
        mo = d.getMonth();
      const dim = new Date(y, mo + 1, 0).getDate();

      ops.push({
        date: new Date(y, mo, Math.min(28, dim)).getTime(),
        label: "Virement salaire",
        category: "Salaire",
        account: "HB",
        type: "Virement",
        amount: 2180 + Math.round(rnd(id++) * 60),
      });
      ops.push({
        date: new Date(y, mo, 2).getTime(),
        label: "Virement épargne",
        category: "Épargne",
        account: "HB",
        type: "Virement",
        amount: -300,
      });
      ops.push({
        date: new Date(y, mo, 3).getTime(),
        label: "Virement vers Revolut",
        category: "Virements internes",
        account: "HB",
        type: "Virement",
        amount: -250,
      });
      ops.push({
        date: new Date(y, mo, 3).getTime(),
        label: "Virement depuis Hello bank",
        category: "Virements internes",
        account: "RV",
        type: "Virement",
        amount: 250,
      });

      for (const [cat, base, fixedDay, acct, monthly] of cats) {
        const n = monthly ? 1 : 2 + Math.floor(rnd(id++) * 4);
        for (let k = 0; k < n; k++) {
          const day = fixedDay || 1 + Math.floor(rnd(id++) * (dim - 1));
          const jitter = monthly ? 1 : 0.55 + rnd(id++) * 0.9;
          ops.push({
            date: new Date(y, mo, Math.min(day, dim)).getTime(),
            label: DEMO_LABELS[cat] ? DEMO_LABELS[cat][k % DEMO_LABELS[cat].length] : cat,
            category: cat,
            account: acct,
            type: monthly ? "Prélèvement" : "Carte",
            amount: Math.round(base * jitter * 100) / 100,
          });
        }
      }
    }

    ops.sort((a, b) => a.date - b.date);
    const budget = [
      { category: "Salaire", planned: 2200 },
      { category: "Loyer", planned: -720 },
      { category: "Courses", planned: -320 },
      { category: "Restaurants", planned: -110 },
      { category: "Carburant", planned: -130 },
      { category: "Abonnements", planned: -42 },
      { category: "Énergie", planned: -89 },
      { category: "Assurance", planned: -46 },
      { category: "Santé", planned: -60 },
      { category: "Shopping", planned: -120 },
      { category: "Loisirs", planned: -90 },
      { category: "Transport", planned: -50 },
      { category: "Téléphone", planned: -19 },
      { category: "Épargne", planned: -300 },
    ];

    return {
      operations: ops,
      budget,
      sheets: [
        { name: "TabOpérations (démo)", kind: "opérations", rows: ops.length },
        { name: "Budget (démo)", kind: "budget", rows: budget.length },
      ],
      warnings: [],
      fileName: "Jeu de démonstration",
      importedAt: Date.now(),
      isDemo: true,
    };
  }

  const DEMO_LABELS = {
    Courses: ["CARREFOUR MARKET", "LIDL NANTES", "SUPER U", "BIOCOOP"],
    Restaurants: ["LE BISTROT", "SUSHI SHOP", "BOULANGERIE", "PIZZERIA ROMA"],
    Carburant: ["TOTAL ENERGIES", "ESSO EXPRESS", "INTERMARCHE STATION"],
    Abonnements: ["NETFLIX", "SPOTIFY", "ICLOUD"],
    Énergie: ["EDF PRELEVEMENT"],
    Assurance: ["MAIF ASSURANCE"],
    Santé: ["PHARMACIE CENTRALE", "DR MARTIN", "MUTUELLE"],
    Shopping: ["DECATHLON", "ZARA", "FNAC", "AMAZON"],
    Loisirs: ["CINEMA PATHE", "SALLE DE SPORT", "BILLETTERIE"],
    Transport: ["SNCF CONNECT", "TAN NANTES", "UBER"],
    Voyages: ["BOOKING.COM", "AIR FRANCE"],
    Téléphone: ["FREE MOBILE"],
    Loyer: ["LOYER APPARTEMENT"],
  };

  return {
    parseWorkbook,
    buildCatalog,
    buildAccounts,
    applyRules,
    isExcluded,
    isInternal,
    isSaving,
    measures,
    byCategory,
    byMonth,
    cumulative,
    monthKey,
    iconFor,
    familyFor,
    norm,
    toNumber,
    toDate,
    save,
    load,
    clear,
    demo,
    FALLBACK,
  };
})();
