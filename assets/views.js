/* ==========================================================================
   views.js — les cinq écrans.

   Comptes    : patrimoine consolidé, cartes de comptes, prévisionnel 30 jours
                (la lecture d'accueil de Linxo)
   Opérations : recherche, filtres, liste groupée par jour
   Budget     : jauges prévu / réalisé par catégorie, reste à dépenser
                (la lecture de Bankin')
   Analyse    : répartition, revenus vs dépenses, solde cumulé, comparaison N-1
   Réglages   : import du classeur, règles de lecture, comptes, thème
   ========================================================================== */

const Views = (() => {
  "use strict";

  const esc = Charts.escapeHtml;
  const $ = (sel, root = document) => root.querySelector(sel);

  /** Sérialise un bloc de données inline : "<" est neutralisé pour qu'un libellé
      venu d'Excel ne puisse jamais refermer la balise. */
  const payload = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

  function catOf(state, name) {
    return state.catalog.get(name) || { ...Data.FALLBACK, name };
  }

  /* ---------- Périodes ---------- */

  const PERIODS = [
    { id: "m", label: "Ce mois" },
    { id: "3m", label: "3 mois" },
    { id: "12m", label: "12 mois" },
    { id: "y", label: "Cette année" },
    { id: "all", label: "Tout" },
  ];

  function range(period, ref = new Date()) {
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59);
    let start;
    switch (period) {
      case "m":
        start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        break;
      case "3m":
        start = new Date(ref.getFullYear(), ref.getMonth() - 2, 1);
        break;
      case "y":
        start = new Date(ref.getFullYear(), 0, 1);
        break;
      case "all":
        start = new Date(1970, 0, 1);
        break;
      case "12m":
      default:
        start = new Date(ref.getFullYear(), ref.getMonth() - 11, 1);
    }
    return { start: start.getTime(), end: end.getTime() };
  }

  function inRange(ops, r) {
    return ops.filter((o) => o.date >= r.start && o.date <= r.end);
  }

  /* ---------- Fragments réutilisables ---------- */

  function opRow(state, o, i) {
    const c = catOf(state, o.category);
    const color = `var(${c.slot})`;
    return `
      <button class="row" data-op="${i}">
        <span class="dot" style="--c-wash:color-mix(in srgb, ${color} 15%, var(--surface))">${c.icon}</span>
        <span class="body">
          <span class="t">${esc(o.label)}</span>
          <span class="s">${esc(o.category)}${o.account ? " · " + esc(o.account) : ""}</span>
        </span>
        <span class="amt ${o.amount > 0 ? "pos" : ""}">${o.amount > 0 ? "+" : ""}${Fmt.eur2(o.amount)}</span>
      </button>`;
  }

  function dayGroups(state, ops, limit) {
    const shown = ops.slice(0, limit);
    const groups = new Map();
    shown.forEach((o, i) => {
      const k = new Date(o.date).toDateString();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push([o, i]);
    });
    let html = "";
    for (const [, items] of groups) {
      const sum = items.reduce((s, [o]) => s + o.amount, 0);
      html += `<div class="daygroup"><span>${esc(Fmt.dayGroup(items[0][0].date))}</span><span class="sum">${Fmt.signed(sum)}</span></div>`;
      html += items.map(([o, i]) => opRow(state, o, i)).join("");
    }
    if (ops.length > limit) {
      html += `<button class="load-more" data-more>Afficher 50 opérations de plus (${Fmt.num(ops.length - limit)} restantes)</button>`;
    }
    return html;
  }

  function legendOf(slices) {
    return `<div class="legend">${slices
      .map((s) => `<span><i class="swatch" style="--c:var(${s.slot})"></i>${esc(s.label)}</span>`)
      .join("")}</div>`;
  }

  /** Vue tableau : le relief exigé dès qu'une teinte passe sous 3:1 sur fond clair.
      Toujours disponible, jamais la seule voie d'accès à la donnée. */
  function tableView(slices, total) {
    return `
      <button class="table-toggle" data-table>Afficher le tableau</button>
      <div hidden data-table-body>
        <table class="dtable">
          <thead><tr><th>Catégorie</th><th>Montant</th><th>Part</th></tr></thead>
          <tbody>${slices
            .map(
              (s) =>
                `<tr><td>${esc(s.label)}</td><td>${Fmt.eur(s.value)}</td><td>${total ? Fmt.pct(s.value / total) : "—"}</td></tr>`
            )
            .join("")}</tbody>
        </table>
      </div>`;
  }

  function statTile(k, v, delta) {
    return `<div class="stat"><div class="k">${esc(k)}</div><div class="v">${v}</div>${
      delta ? `<div class="d ${delta.cls}">${delta.text}</div>` : ""
    }</div>`;
  }

  /* ---------- 1. Comptes ---------- */

  function comptes(state) {
    const all = state.all;
    const accounts = state.accounts;
    const bal = Data.balances(all, accounts);
    const total = [...bal.values()].reduce((s, v) => s + v, 0);

    const thisMonth = inRange(state.ops, range("m"));
    const m = Data.measures(thisMonth);

    const fc = Data.forecast(all, total, 30);
    const opening = accounts.some((a) => a.opening);

    const recent = state.ops.slice().sort((a, b) => b.date - a.date).slice(0, 6);
    const topCats = Data.byCategory(thisMonth)
      .slice(0, 5)
      .map((c) => ({ label: c.category, value: c.total, slot: catOf(state, c.category).slot }));
    const monthTotal = topCats.reduce((s, c) => s + c.value, 0);

    return `
      <div class="hero">
        <div class="label">${opening ? "Patrimoine total" : "Solde reconstitué"}</div>
        <div class="value">${Fmt.eur(total)}</div>
        <div class="meta">
          <div><div class="k">Revenus du mois</div><div class="v">${Fmt.eur(m.revenus)}</div></div>
          <div><div class="k">Dépenses du mois</div><div class="v">${Fmt.eur(m.depenses)}</div></div>
        </div>
      </div>

      ${
        opening
          ? ""
          : `<div class="banner"><span class="em">ℹ️</span><span>Aucun solde d'ouverture renseigné : ce montant est le cumul de toutes les opérations du classeur, pas le solde réel de tes comptes. Tu peux saisir les soldes de départ dans les réglages.</span></div>`
      }

      <div class="card">
        <div class="card-head">
          <h2>Prévisionnel 30 jours</h2>
          <span class="hint">${fc.end >= 0 ? "☀️" : "🌧️"} ${Fmt.eur(fc.end)}</span>
        </div>
        <div data-chart="forecast"></div>
        <p style="margin:10px 0 0;font-size:12.5px;color:var(--ink-3);line-height:1.45">
          Projection des seules opérations récurrentes détectées
          (${Fmt.num(fc.recurringCount)} identifiée${fc.recurringCount > 1 ? "s" : ""} : même libellé, montant stable, présent sur au moins 3 mois).
          Les dépenses ponctuelles ne sont pas extrapolées.
        </p>
      </div>

      <div class="section-title">Mes comptes</div>
      <div class="card flush">
        ${accounts
          .map((a) => {
            const b = bal.get(a.code) || 0;
            return `
          <button class="acct" data-account="${esc(a.code)}">
            <span class="badge" style="background:var(${a.slot})">${esc(a.code.slice(0, 3).toUpperCase())}</span>
            <span class="body" style="flex:1;min-width:0">
              <span class="name" style="display:block">${esc(a.name)}</span>
              <span class="kind">${esc(a.kind)}</span>
            </span>
            <span style="width:64px" data-spark="${esc(a.code)}"></span>
            <span class="bal">${Fmt.eur(b)}</span>
          </button>`;
          })
          .join("")}
      </div>

      <div class="section-title">Ce mois-ci</div>
      <div class="stats">
        ${statTile("Solde net", Fmt.signed(m.soldeNet), {
          cls: m.soldeNet >= 0 ? "up-good" : "down-bad",
          text: m.soldeNet >= 0 ? "Tu épargnes" : "Tu puises dans tes réserves",
        })}
        ${statTile("Taux d'épargne", Fmt.pct(m.tauxEpargne), {
          cls: m.tauxEpargne >= 0.1 ? "up-good" : "neutral",
          text: `${Fmt.num(m.nbOperations)} opérations`,
        })}
      </div>

      ${
        topCats.length
          ? `<div class="card">
               <div class="card-head"><h2>Où part l'argent ce mois-ci</h2></div>
               <div data-chart="topcats"></div>
             </div>`
          : ""
      }

      <div class="section-title">Dernières opérations</div>
      <div class="card flush">
        ${recent.map((o, i) => opRow(state, o, state.ops.indexOf(o))).join("") || `<div class="empty"><p>Aucune opération.</p></div>`}
        <button class="load-more" data-goto="operations">Voir toutes les opérations</button>
      </div>

      <script type="application/json" data-payload="comptes">${payload({ forecast: fc.points, topCats, monthTotal })}</script>
    `;
  }

  function mountComptes(state, root) {
    const payload = JSON.parse($('[data-payload="comptes"]', root).textContent);
    Charts.forecastLine($('[data-chart="forecast"]', root), payload.forecast);
    const tc = $('[data-chart="topcats"]', root);
    if (tc) Charts.rankedBars(tc, payload.topCats, { total: payload.monthTotal });

    for (const a of state.accounts) {
      const holder = $(`[data-spark="${CSS.escape(a.code)}"]`, root);
      if (!holder) continue;
      const ops = state.all.filter((o) => o.account === a.code);
      const cum = Data.cumulative(ops, a.opening);
      const recent = cum.slice(-40);
      Charts.sparkline(holder, recent, { color: a.slot });
    }
  }

  /* ---------- 2. Opérations ---------- */

  function operations(state) {
    const f = state.filters;
    const r = range(f.period);
    let list = inRange(state.ops, r);

    if (f.account !== "all") list = list.filter((o) => o.account === f.account);
    if (f.category !== "all") list = list.filter((o) => o.category === f.category);
    if (f.query) {
      const q = Data.norm(f.query);
      list = list.filter((o) => Data.norm(o.label).includes(q) || Data.norm(o.category).includes(q));
    }
    list.sort((a, b) => b.date - a.date);
    state.viewOps = list;

    const m = Data.measures(list);
    const cats = [...new Set(state.ops.map((o) => o.category))].sort();

    return `
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" placeholder="Rechercher une opération" value="${esc(f.query)}" data-search aria-label="Rechercher une opération">
      </div>

      <div class="chips" role="group" aria-label="Période">
        ${PERIODS.map((p) => `<button class="chip" data-period="${p.id}" aria-pressed="${f.period === p.id}">${p.label}</button>`).join("")}
      </div>
      <div class="chips" role="group" aria-label="Compte et catégorie">
        <button class="chip" data-acct="all" aria-pressed="${f.account === "all"}">Tous les comptes</button>
        ${state.accounts
          .map((a) => `<button class="chip" data-acct="${esc(a.code)}" aria-pressed="${f.account === a.code}">${esc(a.name)}</button>`)
          .join("")}
        <button class="chip" data-cat="all" aria-pressed="${f.category === "all"}">Toutes catégories</button>
        ${cats
          .map(
            (c) =>
              `<button class="chip" data-cat="${esc(c)}" aria-pressed="${f.category === c}">${catOf(state, c).icon} ${esc(c)}</button>`
          )
          .join("")}
      </div>

      <div class="stats">
        ${statTile("Entrées", Fmt.eur(m.revenus))}
        ${statTile("Sorties", Fmt.eur(m.depenses))}
      </div>

      <div class="card flush">
        ${
          list.length
            ? dayGroups(state, list, f.limit)
            : `<div class="empty"><div class="em">🔍</div><h3>Aucun résultat</h3><p>Aucune opération ne correspond à ces filtres.</p></div>`
        }
      </div>`;
  }

  /* ---------- 3. Budget ---------- */

  function budget(state) {
    if (!state.raw.budget.length) {
      return `<div class="empty">
        <div class="em">🎯</div>
        <h3>Pas de budget dans le classeur</h3>
        <p>Ajoute dans <b>OperationsOfficiel.xlsm</b> une feuille avec deux colonnes — <b>Catégorie</b> et <b>Montant Prévu</b> — puis réimporte le fichier. Les montants négatifs sont lus comme des dépenses.</p>
      </div>`;
    }

    const key = state.filters.budgetMonth || Data.monthKey(Date.now());
    const [y, mo] = key.split("-").map(Number);
    const start = new Date(y, mo - 1, 1).getTime();
    const end = new Date(y, mo, 0, 23, 59, 59).getTime();
    const ops = state.ops.filter((o) => o.date >= start && o.date <= end);

    // Budget mensuel : les montants prévus sont pris tels quels, un mois à la fois.
    // Les règles de lecture s'appliquent aussi ici — sinon une ligne « Épargne »
    // afficherait un budget entier face à un réalisé vidé par le filtre.
    const plannedByCat = new Map();
    for (const b of state.raw.budget) {
      if (b.planned >= 0) continue; // les lignes de revenu ne sont pas un budget de dépense
      if (Data.isExcluded(b.category, state.settings.rules)) continue;
      plannedByCat.set(b.category, (plannedByCat.get(b.category) || 0) + -b.planned);
    }

    const actualByCat = new Map();
    for (const o of ops) if (o.amount < 0) actualByCat.set(o.category, (actualByCat.get(o.category) || 0) + -o.amount);

    const rows = [...new Set([...plannedByCat.keys(), ...actualByCat.keys()])]
      .map((c) => {
        const planned = plannedByCat.get(c) || 0;
        const actual = actualByCat.get(c) || 0;
        return { category: c, planned, actual, ratio: planned ? actual / planned : null, gap: planned - actual };
      })
      .sort((a, b) => {
        if (a.ratio == null) return 1;
        if (b.ratio == null) return -1;
        return b.ratio - a.ratio;
      });

    const totPlanned = rows.reduce((s, r) => s + r.planned, 0);
    const totActual = rows.reduce((s, r) => s + r.actual, 0);
    const remaining = totPlanned - totActual;
    const globalRatio = totPlanned ? totActual / totPlanned : 0;

    const months = [...new Set(state.ops.map((o) => Data.monthKey(o.date)))].sort();
    const idx = months.indexOf(key);

    const varianceItems = rows
      .filter((r) => r.planned > 0)
      .slice(0, 10)
      .map((r) => ({ label: r.category, value: r.gap, planned: r.planned, actual: r.actual }));

    return `
      <div class="stepper">
        <button data-month="prev" ${idx <= 0 ? "disabled" : ""} aria-label="Mois précédent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span class="lbl">${esc(Fmt.monthLong(key))}</span>
        <button data-month="next" ${idx < 0 || idx >= months.length - 1 ? "disabled" : ""} aria-label="Mois suivant">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>${remaining >= 0 ? "Reste à dépenser" : "Dépassement"}</h2>
          <span class="hint">${Fmt.pct(globalRatio)} du budget</span>
        </div>
        <div style="font-size:32px;font-weight:670;letter-spacing:-.025em;color:${
          remaining >= 0 ? "var(--ink)" : "var(--st-critical)"
        }">${Fmt.eur(Math.abs(remaining))}</div>
        <div class="track" style="margin-top:12px;--track:${meterTrack(globalRatio)}">
          <div class="fill" style="width:${Math.min(100, globalRatio * 100)}%;--fill:${meterFill(globalRatio)}"></div>
        </div>
        <div class="gauge-foot">
          <span>${Fmt.eur(totActual)} dépensés</span>
          <span>Budget ${Fmt.eur(totPlanned)}</span>
        </div>
      </div>

      <div class="section-title">Par catégorie</div>
      <div class="card flush">
        ${rows.map((r) => gauge(state, r)).join("")}
      </div>

      ${
        varianceItems.length
          ? `<div class="card">
              <div class="card-head"><h2>Écart au budget</h2><span class="hint">vert = sous le budget</span></div>
              <div data-chart="variance"></div>
              <div class="legend">
                <span><i class="swatch" style="--c:var(--st-good)"></i>Sous le budget</span>
                <span><i class="swatch" style="--c:var(--st-critical)"></i>Dépassement</span>
              </div>
            </div>`
          : ""
      }

      <script type="application/json" data-payload="budget">${payload({ varianceItems })}</script>`;
  }

  // La piste est un pas plus clair du remplissage : l'état se lit sur toute la barre.
  function meterFill(ratio) {
    if (ratio == null) return "var(--s-rest)";
    if (ratio > 1) return "var(--st-critical)";
    if (ratio > 0.9) return "var(--st-serious)";
    if (ratio > 0.75) return "var(--st-warn)";
    return "var(--st-good)";
  }
  function meterTrack(ratio) {
    return `color-mix(in srgb, ${meterFill(ratio)} 18%, var(--surface-3))`;
  }

  function gauge(state, r) {
    const c = catOf(state, r.category);
    const ratio = r.ratio;
    const pct = ratio == null ? 0 : Math.min(100, ratio * 100);
    const over = ratio != null && ratio > 1;
    return `
      <div class="gauge">
        <div class="gauge-top">
          <span class="dot sm" style="--c-wash:color-mix(in srgb, var(${c.slot}) 15%, var(--surface))">${c.icon}</span>
          <span class="n">${esc(r.category)}</span>
          <span class="v">${Fmt.eur(r.actual)} <small>/ ${r.planned ? Fmt.eur(r.planned) : "—"}</small></span>
        </div>
        <div class="track" style="--track:${meterTrack(ratio)}">
          <div class="fill" style="width:${pct}%;--fill:${meterFill(ratio)}"></div>
        </div>
        <div class="gauge-foot">
          <span>${
            ratio == null
              ? "Hors budget"
              : over
              ? `<span class="over">⚠ Dépassement de ${Fmt.eur(r.actual - r.planned)}</span>`
              : `Reste ${Fmt.eur(r.gap)}`
          }</span>
          <span>${ratio == null ? "" : Fmt.pct(ratio)}</span>
        </div>
      </div>`;
  }

  /* ---------- 4. Analyse ---------- */

  function analyse(state) {
    const f = state.filters;
    const r = range(f.anaPeriod);
    const ops = inRange(state.ops, r);
    const m = Data.measures(ops);

    // même fenêtre, décalée d'un an — la seule comparaison qui a du sens
    const prevRef = new Date();
    prevRef.setFullYear(prevRef.getFullYear() - 1);
    const rPrev = range(f.anaPeriod, prevRef);
    const prev = Data.measures(inRange(state.ops, rPrev));
    const evo = prev.depenses ? (m.depenses - prev.depenses) / prev.depenses : null;

    // Seules les catégories qui portent une teinte du catalogue deviennent des parts ;
    // tout le reste tombe dans « Autres ». Sans cela, une catégorie hors des huit
    // premières et le cumul « Autres » partageraient le même gris dans la légende —
    // deux pastilles identiques pour deux choses différentes.
    const cats = Data.byCategory(ops);
    const top = cats.filter((c) => catOf(state, c.category).colored);
    const rest = cats.filter((c) => !catOf(state, c.category).colored);
    const slices = top.map((c) => ({ label: c.category, value: c.total, slot: catOf(state, c.category).slot }));
    if (rest.length) {
      slices.push({ label: `Autres (${rest.length})`, value: rest.reduce((s, c) => s + c.total, 0), slot: "--s-rest" });
    }

    const months = Data.byMonth(ops);
    const cum = Data.cumulative(inRange(state.all, r), 0);

    // familles : la lecture simplifiée en quatre postes
    const fam = new Map();
    for (const c of cats) {
      const k = Data.familyFor(c.category);
      fam.set(k, (fam.get(k) || 0) + c.total);
    }
    const famOrder = ["Essentiel", "Plaisir", "Épargne", "Extra"];
    const famSlots = { Essentiel: "--s1", Plaisir: "--s2", Épargne: "--s3", Extra: "--s-rest" };
    const famItems = famOrder.filter((k) => fam.has(k)).map((k) => ({ label: k, value: fam.get(k), slot: famSlots[k] }));

    return `
      <div class="chips" role="group" aria-label="Période d'analyse">
        ${PERIODS.map((p) => `<button class="chip" data-anaperiod="${p.id}" aria-pressed="${f.anaPeriod === p.id}">${p.label}</button>`).join("")}
      </div>

      <div class="stats">
        ${statTile("Dépenses", Fmt.eur(m.depenses), {
          cls: evo == null ? "neutral" : evo > 0 ? "down-bad" : "up-good",
          text: evo == null ? "pas de N-1" : `${evo > 0 ? "▲" : "▼"} ${Fmt.pct(Math.abs(evo))} vs N-1`,
        })}
        ${statTile("Revenus", Fmt.eur(m.revenus), { cls: "neutral", text: `${Fmt.num(m.nbMois)} mois` })}
        ${statTile("Solde net", Fmt.signed(m.soldeNet), {
          cls: m.soldeNet >= 0 ? "up-good" : "down-bad",
          text: m.soldeNet >= 0 ? "excédent" : "déficit",
        })}
        ${statTile("Taux d'épargne", Fmt.pct(m.tauxEpargne), { cls: "neutral", text: `${Fmt.num(m.nbOperations)} opérations` })}
      </div>

      <div class="card">
        <div class="card-head"><h2>Répartition des dépenses</h2></div>
        <div class="donut-wrap">
          <div data-chart="donut"></div>
          <div class="donut-center">
            <div class="k">Total</div>
            <div class="v">${Fmt.eur(m.depenses)}</div>
          </div>
        </div>
        ${legendOf(slices)}
        ${tableView(slices, m.depenses)}
      </div>

      <div class="card">
        <div class="card-head"><h2>Revenus et dépenses par mois</h2></div>
        <div data-chart="months"></div>
        <div class="legend">
          <span><i class="swatch" style="--c:var(--s3)"></i>Revenus</span>
          <span><i class="swatch" style="--c:var(--s2)"></i>Dépenses</span>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Solde cumulé</h2><span class="hint">virements internes inclus</span></div>
        <div data-chart="cum"></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Postes de dépense</h2></div>
        <div data-chart="ranked"></div>
      </div>

      ${
        famItems.length
          ? `<div class="card">
              <div class="card-head"><h2>Essentiel, plaisir, épargne</h2></div>
              <div data-chart="fam"></div>
            </div>`
          : ""
      }

      <script type="application/json" data-payload="analyse">${payload({
        slices,
        months,
        cum: cum.filter((_, i, a) => a.length < 400 || i % Math.ceil(a.length / 400) === 0),
        ranked: top.map((c) => ({ label: c.category, value: c.total, slot: catOf(state, c.category).slot })),
        famItems,
        depenses: m.depenses,
      })}</script>`;
  }

  function mountAnalyse(state, root) {
    const p = JSON.parse($('[data-payload="analyse"]', root).textContent);
    Charts.donut($('[data-chart="donut"]', root), p.slices);
    Charts.monthlyColumns($('[data-chart="months"]', root), p.months);
    Charts.areaLine($('[data-chart="cum"]', root), p.cum, { label: "Solde" });
    Charts.rankedBars($('[data-chart="ranked"]', root), p.ranked, { total: p.depenses });
    const fam = $('[data-chart="fam"]', root);
    if (fam) Charts.rankedBars(fam, p.famItems, { total: p.depenses });
  }

  function mountBudget(state, root) {
    const holder = $('[data-chart="variance"]', root);
    if (!holder) return;
    const p = JSON.parse($('[data-payload="budget"]', root).textContent);
    Charts.variance(holder, p.varianceItems);
  }

  /* ---------- 5. Réglages ---------- */

  function reglages(state) {
    const raw = state.raw;
    const s = state.settings;
    const nOps = raw.operations.length;
    const span = nOps
      ? `${Fmt.dayLong(raw.operations[0].date)} → ${Fmt.dayLong(raw.operations[nOps - 1].date)}`
      : "—";

    return `
      <div class="section-title">Source des données</div>
      <div class="card">
        <div class="file-drop" data-drop>
          <div style="font-size:28px;margin-bottom:6px">📊</div>
          <div><b>Glisse ton classeur ici</b> ou touche pour choisir</div>
          <div style="margin-top:4px;font-size:12px">.xlsm · .xlsx · .csv — lu sur l'appareil, jamais envoyé</div>
        </div>
        <input type="file" accept=".xlsm,.xlsx,.xls,.csv" hidden data-file>
        <button class="btn" data-pick>Importer OperationsOfficiel.xlsm</button>
        <button class="btn ghost" style="margin-top:8px" data-demo>Charger le jeu de démonstration</button>
      </div>

      <div class="card flush">
        <div class="field"><div><div class="k">Fichier</div><div class="d">${esc(raw.fileName || "—")}</div></div></div>
        <div class="field"><div><div class="k">Opérations</div><div class="d">${span}</div></div><div class="k">${Fmt.num(nOps)}</div></div>
        <div class="field"><div><div class="k">Lignes de budget</div></div><div class="k">${Fmt.num(raw.budget.length)}</div></div>
        <div class="field"><div><div class="k">Importé le</div><div class="d">${raw.importedAt ? esc(Fmt.dayLong(raw.importedAt)) : "—"}</div></div></div>
      </div>

      <div class="card flush">
        ${raw.sheets
          .map(
            (sh) =>
              `<div class="field"><div><div class="k">${esc(sh.name)}</div><div class="d">${esc(sh.kind)}</div></div><div class="d">${
                sh.rows ? Fmt.num(sh.rows) + " lignes" : ""
              }</div></div>`
          )
          .join("")}
      </div>

      ${raw.warnings.map((w) => `<div class="banner warn"><span class="em">⚠️</span><span>${esc(w)}</span></div>`).join("")}

      <div class="section-title">Règles de lecture</div>
      <div class="card flush">
        <div class="field">
          <div><div class="k">Exclure les virements internes</div><div class="d">De l'argent déplacé entre tes comptes, pas une dépense. Sans ce filtre, c'est le premier poste du classement.</div></div>
          <button class="switch" role="switch" data-rule="excludeInternal" aria-checked="${s.rules.excludeInternal}" aria-label="Exclure les virements internes"></button>
        </div>
        <div class="field">
          <div><div class="k">Exclure l'épargne des dépenses</div><div class="d">Une épargne sort du compte courant mais reste ton argent. L'exclure rend le taux d'épargne juste.</div></div>
          <button class="switch" role="switch" data-rule="excludeSavings" aria-checked="${s.rules.excludeSavings}" aria-label="Exclure l'épargne des dépenses"></button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--ink-3);margin:0 4px 4px;line-height:1.45">
        Ces deux règles ne touchent ni les soldes ni le solde cumulé : un virement déplace bien de l'argent, il compte toujours dans le solde de chaque compte.
      </p>

      <div class="section-title">Comptes</div>
      <div class="card flush">
        ${state.accounts
          .map(
            (a) => `
          <div class="field">
            <div><div class="k">${esc(a.code)}</div><div class="d">Nom affiché</div></div>
            <input type="text" value="${esc(a.name)}" data-acct-name="${esc(a.code)}" aria-label="Nom du compte ${esc(a.code)}">
          </div>
          <div class="field">
            <div><div class="k">Solde d'ouverture</div><div class="d">Solde avant la première ligne du classeur</div></div>
            <input type="number" step="0.01" value="${a.opening}" data-acct-open="${esc(a.code)}" aria-label="Solde d'ouverture ${esc(a.code)}">
          </div>`
          )
          .join("")}
      </div>

      <div class="section-title">Affichage</div>
      <div class="card flush">
        <div class="field">
          <div><div class="k">Thème</div></div>
          <select data-theme aria-label="Thème">
            <option value="auto" ${s.theme === "auto" ? "selected" : ""}>Automatique</option>
            <option value="light" ${s.theme === "light" ? "selected" : ""}>Clair</option>
            <option value="dark" ${s.theme === "dark" ? "selected" : ""}>Sombre</option>
          </select>
        </div>
      </div>

      <div class="section-title">Données</div>
      <div class="card">
        <button class="btn danger" data-clear>Effacer les données de cet appareil</button>
        <p style="font-size:12px;color:var(--ink-3);margin:12px 0 0;line-height:1.5">
          Tout est stocké dans le navigateur (IndexedDB) : aucun serveur, aucun compte, aucune connexion bancaire.
          Le classeur d'origine n'est jamais modifié — l'application ne fait que le lire.
        </p>
      </div>

      <p style="text-align:center;font-size:11.5px;color:var(--ink-3);margin:22px 0 8px">
        Mes Comptes — lecture de OperationsOfficiel.xlsm<br>Lecture Excel : SheetJS (Apache-2.0)
      </p>`;
  }

  /* ---------- Feuille de détail d'opération ---------- */

  function opDetail(state, o) {
    const c = catOf(state, o.category);
    const acct = state.accounts.find((a) => a.code === o.account);
    return `
      <h2>Détail de l'opération</h2>
      <div class="row" style="padding-left:0;padding-right:0">
        <span class="dot" style="--c-wash:color-mix(in srgb, var(${c.slot}) 15%, var(--surface))">${c.icon}</span>
        <span class="body">
          <span class="t" style="font-size:16px">${esc(o.label)}</span>
          <span class="s">${esc(Fmt.dayLong(o.date))}</span>
        </span>
        <span class="amt ${o.amount > 0 ? "pos" : ""}" style="font-size:18px">${o.amount > 0 ? "+" : ""}${Fmt.eur2(o.amount)}</span>
      </div>
      <div class="card flush" style="margin-top:12px">
        <div class="field"><div class="k">Catégorie</div><div class="d">${c.icon} ${esc(o.category)}</div></div>
        <div class="field"><div class="k">Famille</div><div class="d">${esc(c.family)}</div></div>
        <div class="field"><div class="k">Compte</div><div class="d">${esc(acct ? acct.name : o.account)}</div></div>
        ${o.type ? `<div class="field"><div class="k">Type</div><div class="d">${esc(o.type)}</div></div>` : ""}
        <div class="field"><div class="k">Feuille source</div><div class="d">${esc(o.sheet || "—")}</div></div>
      </div>
      <p style="font-size:12px;color:var(--ink-3);margin:14px 2px 0;line-height:1.45">
        Cette vue est en lecture seule : la source reste le classeur Excel. Pour corriger une ligne, modifie-la dans <b>OperationsOfficiel.xlsm</b> puis réimporte le fichier.
      </p>`;
  }

  return { comptes, mountComptes, operations, budget, mountBudget, analyse, mountAnalyse, reglages, opDetail, range, inRange, PERIODS };
})();
