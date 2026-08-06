/* ==========================================================================
   app.js — état, navigation, événements.

   Toute la donnée vit dans le navigateur : le classeur est lu à l'import,
   normalisé, puis conservé en IndexedDB. Aucun réseau, aucun compte.
   ========================================================================== */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const SCREENS = {
    comptes: { label: "Comptes", title: "Mes comptes" },
    operations: { label: "Opérations", title: "Opérations" },
    budget: { label: "Budget", title: "Budget" },
    analyse: { label: "Analyse", title: "Analyse" },
    reglages: { label: "Réglages", title: "Réglages" },
  };

  const DEFAULT_SETTINGS = {
    rules: { excludeInternal: true, excludeSavings: true },
    accounts: {},
    theme: "auto",
  };

  const state = {
    screen: "comptes",
    raw: null,
    all: [],
    ops: [],
    viewOps: [],
    catalog: new Map(),
    accounts: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    filters: { period: "3m", account: "all", category: "all", query: "", limit: 50, anaSize: "1m", anaAnchor: null, budgetMonth: null },
  };

  const view = $("#view");
  const topbar = $("#topbar");
  const tabbar = $("#tabbar");

  /* ---------- Dérivations ---------- */

  function rebuild() {
    if (!state.raw) return;
    state.all = state.raw.operations;
    state.catalog = Data.buildCatalog(state.all);
    state.accounts = Data.buildAccounts(state.all, state.settings.accounts);
    state.ops = Data.applyRules(state.all, state.settings.rules);
    if (!state.filters.budgetMonth) {
      const months = [...new Set(state.ops.map((o) => Data.monthKey(o.date)))].sort();
      const current = Data.monthKey(Date.now());
      state.filters.budgetMonth = months.includes(current) ? current : months[months.length - 1] || current;
    }
  }

  /* ---------- Rendu ---------- */

  let renderToken = 0;

  function render() {
    const token = ++renderToken;
    Charts.hideTip();

    if (!state.raw) {
      renderWelcome();
      return;
    }

    tabbar.hidden = false;
    $("#btn-settings").hidden = false;
    const meta = SCREENS[state.screen];
    $("#title").textContent = meta.title;
    $("#subtitle").textContent = subtitleFor();

    let html = "";
    switch (state.screen) {
      case "comptes":
        html = Views.comptes(state);
        break;
      case "operations":
        html = Views.operations(state);
        break;
      case "budget":
        html = Views.budget(state);
        break;
      case "analyse":
        html = Views.analyse(state);
        break;
      case "reglages":
        html = Views.reglages(state);
        break;
    }
    view.innerHTML = html;

    // Les graphiques ont besoin de la largeur réelle : on monte après la mise en page.
    requestAnimationFrame(() => {
      if (token !== renderToken) return;
      try {
        if (state.screen === "comptes") Views.mountComptes(state, view);
        if (state.screen === "analyse") Views.mountAnalyse(state, view);
        if (state.screen === "budget") Views.mountBudget(state, view);
      } catch (err) {
        console.error("Rendu des graphiques :", err);
      }
    });

    $$("#tabbar button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === state.screen));
    // La lentille se déplace par colonnes entières : cinq onglets, donc 100 % de
    // sa propre largeur (20 % de la barre) par cran.
    tabbar.style.setProperty("--tab-i", Object.keys(SCREENS).indexOf(state.screen));
  }

  function subtitleFor() {
    if (!state.raw) return "";
    if (state.screen === "operations") return `${Fmt.num(state.viewOps.length)} opération${state.viewOps.length > 1 ? "s" : ""}`;
    if (state.screen === "reglages") return state.raw.isDemo ? "Données de démonstration" : state.raw.fileName || "";
    const n = state.raw.operations.length;
    return `${Fmt.num(n)} opérations · ${state.accounts.length} compte${state.accounts.length > 1 ? "s" : ""}`;
  }

  function renderWelcome() {
    tabbar.hidden = true;
    $("#btn-settings").hidden = true; // rien à régler tant qu'aucune donnée n'est chargée
    $("#title").textContent = "Mes comptes";
    $("#subtitle").textContent = "";
    view.innerHTML = `
      <div class="hero" style="margin-top:8px">
        <div class="label">Bienvenue</div>
        <div class="value" style="font-size:28px;line-height:1.25">Ton classeur Excel,<br>en application mobile</div>
        <p style="margin:14px 0 0;font-size:13.5px;opacity:.9;line-height:1.5;position:relative">
          Les écrans de Linxo et Bankin', sans connexion bancaire :
          <b>OperationsOfficiel.xlsm</b> tient lieu de base de données.
        </p>
      </div>

      <div class="card">
        <div class="file-drop" data-drop>
          <div style="font-size:30px;margin-bottom:8px">📊</div>
          <div><b>Glisse ton classeur ici</b> ou touche pour choisir</div>
          <div style="margin-top:4px;font-size:12px">.xlsm · .xlsx · .csv</div>
        </div>
        <input type="file" accept=".xlsm,.xlsx,.xls,.csv" hidden data-file>
        <button class="btn" data-pick>Importer mon classeur</button>
        <button class="btn ghost" style="margin-top:8px" data-demo>Explorer avec des données de démonstration</button>
      </div>

      <div class="card">
        <div class="card-head"><h2>Ce que l'application attend</h2></div>
        <p style="margin:0 0 10px;font-size:13.5px;color:var(--ink-2);line-height:1.55">
          Une feuille d'opérations avec au minimum une colonne <b>Date</b> et une colonne <b>Montant</b>
          (ou un couple <b>Débit</b> / <b>Crédit</b>). Les colonnes <b>Libellé</b>, <b>Catégorie</b>,
          <b>BK</b> et <b>Type</b> sont reconnues si elles existent.
        </p>
        <p style="margin:0;font-size:13.5px;color:var(--ink-2);line-height:1.55">
          Pour l'écran Budget, une seconde feuille avec <b>Catégorie</b> et <b>Montant Prévu</b>
          (négatif pour une dépense) — c'est exactement la forme de ton onglet <b>Budget2025Nov</b>.
        </p>
      </div>

      <div class="banner">
        <span class="em">🔒</span>
        <span>Le fichier est lu par le navigateur, sur l'appareil. Rien n'est envoyé sur un serveur, il n'y a ni compte ni identifiants bancaires.</span>
      </div>`;
  }

  /* ---------- Feuille modale ---------- */

  const scrim = $("#scrim");
  const sheet = $("#sheet");

  function openSheet(html) {
    $("#sheet-body").innerHTML = html;
    scrim.classList.add("open");
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }
  function closeSheet() {
    scrim.classList.remove("open");
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
  scrim.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  /* ---------- Persistance ---------- */

  async function persist() {
    try {
      if (state.raw) await Data.save("dataset", state.raw);
      await Data.save("settings", state.settings);
    } catch (err) {
      console.error("Sauvegarde impossible :", err);
      toast("Sauvegarde impossible sur cet appareil. Les données restent valables pour cette session.");
    }
  }

  let toastTimer;
  function toast(msg) {
    let t = $("#toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "tip";
      t.style.cssText = "left:50%;bottom:calc(var(--tab-h) + 24px);top:auto;transform:translateX(-50%);max-width:88vw;text-align:center";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 4200);
  }

  /* ---------- Import ---------- */

  async function importFile(file) {
    if (!file) return;
    toast("Lecture du classeur…");
    try {
      const buf = await file.arrayBuffer();
      const parsed = Data.parseWorkbook(new Uint8Array(buf), file.name);
      state.raw = parsed;
      state.filters.budgetMonth = null;
      state.filters.anaAnchor = null;
      rebuild();
      await persist();
      state.screen = "comptes";
      render();
      toast(`${Fmt.num(parsed.operations.length)} opérations importées.`);
    } catch (err) {
      console.error(err);
      openSheet(`
        <h2>Import impossible</h2>
        <p style="font-size:14px;color:var(--ink-2);line-height:1.55">${Charts.escapeHtml(err.message || String(err))}</p>
        <p style="font-size:13px;color:var(--ink-3);line-height:1.55">
          Vérifie qu'une feuille contient bien une ligne d'en-tête avec au minimum <b>Date</b> et <b>Montant</b>.
          Les en-têtes sont reconnus sans tenir compte des accents ni de la casse.
        </p>
        <button class="btn ghost" style="margin-top:12px" data-close>Fermer</button>`);
    }
  }

  async function loadDemo() {
    state.raw = Data.demo();
    state.filters.budgetMonth = null;
    rebuild();
    await persist();
    state.screen = "comptes";
    render();
    toast("Données de démonstration chargées.");
  }

  /* ---------- Thème ---------- */

  function applyTheme() {
    const t = state.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const dark =
      t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a0c11" : "#eef1f6");
  }

  /* ---------- Événements ---------- */

  tabbar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    state.screen = b.dataset.tab;
    window.scrollTo(0, 0);
    render();
  });

  view.addEventListener("click", async (e) => {
    const t = e.target;

    const tab = t.closest("[data-goto]");
    if (tab) {
      state.screen = tab.dataset.goto;
      window.scrollTo(0, 0);
      render();
      return;
    }

    const acct = t.closest("[data-account]");
    if (acct) {
      state.filters.account = acct.dataset.account;
      state.filters.limit = 50;
      state.screen = "operations";
      window.scrollTo(0, 0);
      render();
      return;
    }

    const op = t.closest("[data-op]");
    if (op) {
      const list = state.screen === "operations" ? state.viewOps : state.ops;
      const o = list[+op.dataset.op];
      if (o) openSheet(Views.opDetail(state, o));
      return;
    }

    const period = t.closest("[data-period]");
    if (period) {
      state.filters.period = period.dataset.period;
      state.filters.limit = 50;
      render();
      return;
    }

    const size = t.closest("[data-anasize]");
    if (size) {
      state.filters.anaSize = size.dataset.anasize;
      render();
      return;
    }

    const step = t.closest("[data-anastep]");
    if (step) {
      const months = [...new Set(state.ops.map((o) => Data.monthKey(o.date)))].sort();
      if (months.length) {
        const w = Views.anaWindow(state);
        if (w.anchor) {
          const delta = (step.dataset.anastep === "prev" ? -1 : 1) * w.size.months;
          const [y, mo] = w.anchor.split("-").map(Number);
          const d = new Date(y, mo - 1 + delta, 1);
          let next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          // On reste dans l'historique : la fenêtre ne sort jamais des données.
          if (next < months[0]) next = months[0];
          if (next > months[months.length - 1]) next = months[months.length - 1];
          state.filters.anaAnchor = next;
          render();
        }
      }
      return;
    }

    const a = t.closest("[data-acct]");
    if (a) {
      state.filters.account = a.dataset.acct;
      state.filters.limit = 50;
      render();
      return;
    }

    const c = t.closest("[data-cat]");
    if (c) {
      state.filters.category = c.dataset.cat;
      state.filters.limit = 50;
      render();
      return;
    }

    if (t.closest("[data-more]")) {
      state.filters.limit += 50;
      render();
      return;
    }

    const month = t.closest("[data-month]");
    if (month) {
      const months = [...new Set(state.ops.map((o) => Data.monthKey(o.date)))].sort();
      const i = months.indexOf(state.filters.budgetMonth);
      const next = month.dataset.month === "prev" ? i - 1 : i + 1;
      if (next >= 0 && next < months.length) {
        state.filters.budgetMonth = months[next];
        render();
      }
      return;
    }

    const tbl = t.closest("[data-table]");
    if (tbl) {
      const body = tbl.parentElement.querySelector("[data-table-body]");
      const open = body.hasAttribute("hidden");
      body.toggleAttribute("hidden", !open);
      tbl.textContent = open ? "Masquer le tableau" : "Afficher le tableau";
      return;
    }

    const rule = t.closest("[data-rule]");
    if (rule) {
      const k = rule.dataset.rule;
      state.settings.rules[k] = !state.settings.rules[k];
      rebuild();
      await persist();
      render();
      return;
    }

    if (t.closest("[data-pick]") || t.closest("[data-drop]")) {
      $("[data-file]", view).click();
      return;
    }

    if (t.closest("[data-demo]")) {
      await loadDemo();
      return;
    }

    if (t.closest("[data-clear]")) {
      openSheet(`
        <h2>Effacer les données ?</h2>
        <p style="font-size:14px;color:var(--ink-2);line-height:1.55">
          Les opérations importées seront supprimées de cet appareil. Ton classeur Excel, lui, n'est pas touché —
          il n'a jamais été modifié et tu pourras le réimporter.
        </p>
        <button class="btn danger" style="margin-top:6px" data-clear-confirm>Effacer</button>
        <button class="btn ghost" style="margin-top:8px" data-close>Annuler</button>`);
      return;
    }
  });

  view.addEventListener("change", async (e) => {
    const f = e.target.closest("[data-file]");
    if (f && f.files && f.files[0]) {
      await importFile(f.files[0]);
      return;
    }

    const th = e.target.closest("[data-theme]");
    if (th) {
      state.settings.theme = th.value;
      applyTheme();
      await persist();
      render();
      return;
    }

    const name = e.target.closest("[data-acct-name]");
    if (name) {
      const code = name.dataset.acctName;
      state.settings.accounts[code] = { ...(state.settings.accounts[code] || {}), name: name.value.trim() || code };
      rebuild();
      await persist();
      return;
    }

    const open = e.target.closest("[data-acct-open]");
    if (open) {
      const code = open.dataset.acctOpen;
      state.settings.accounts[code] = { ...(state.settings.accounts[code] || {}), opening: Number(open.value) || 0 };
      rebuild();
      await persist();
      return;
    }
  });

  // Recherche : on ne re-rend qu'après la frappe, en gardant le focus et le curseur.
  let searchTimer;
  view.addEventListener("input", (e) => {
    const s = e.target.closest("[data-search]");
    if (!s) return;
    state.filters.query = s.value;
    state.filters.limit = 50;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const pos = s.selectionStart;
      render();
      const next = $("[data-search]", view);
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(pos, pos);
        } catch {}
      }
    }, 220);
  });

  sheet.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) {
      closeSheet();
      return;
    }
    if (e.target.closest("[data-clear-confirm]")) {
      await Data.clear();
      state.raw = null;
      state.settings = structuredClone(DEFAULT_SETTINGS);
      applyTheme();
      closeSheet();
      render();
      toast("Données effacées.");
    }
  });

  // Glisser-déposer sur l'écran d'accueil ou de réglages
  ["dragenter", "dragover"].forEach((ev) =>
    view.addEventListener(ev, (e) => {
      const d = e.target.closest("[data-drop]");
      if (!d) return;
      e.preventDefault();
      d.classList.add("over");
    })
  );
  view.addEventListener("dragleave", (e) => {
    const d = e.target.closest("[data-drop]");
    if (d) d.classList.remove("over");
  });
  view.addEventListener("drop", async (e) => {
    const d = e.target.closest("[data-drop]");
    if (!d) return;
    e.preventDefault();
    d.classList.remove("over");
    await importFile(e.dataTransfer.files[0]);
  });

  // Ombre de la barre de titre au défilement
  window.addEventListener(
    "scroll",
    () => topbar.classList.toggle("is-stuck", window.scrollY > 6),
    { passive: true }
  );

  // Les graphiques sont dessinés en pixels : on les redessine si la largeur change
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return; // le clavier mobile ne change que la hauteur
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 180);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    applyTheme();
    if (state.raw) render();
  });

  /* ---------- Démarrage ---------- */

  (async function boot() {
    try {
      const [saved, settings] = await Promise.all([Data.load("dataset"), Data.load("settings")]);
      if (settings) state.settings = { ...structuredClone(DEFAULT_SETTINGS), ...settings, rules: { ...DEFAULT_SETTINGS.rules, ...(settings.rules || {}) } };
      if (saved && saved.operations && saved.operations.length) state.raw = saved;
    } catch (err) {
      console.warn("Stockage local indisponible :", err);
    }
    applyTheme();
    rebuild();
    render();

    if ("serviceWorker" in navigator && window.isSecureContext) {
      // Quand un nouveau service worker prend la main, la page tourne encore sur
      // les anciens CSS/JS déjà chargés : on la recharge une fois, sinon la mise
      // à jour n'apparaît qu'à la visite suivante.
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  })();
})();
