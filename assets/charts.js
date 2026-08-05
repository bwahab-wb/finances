/* ==========================================================================
   charts.js — graphiques SVG, sans dépendance.

   Specs de marque appliquées partout :
     barres ≤ 24 px, extrémité arrondie 4 px côté donnée, carrée sur la ligne de base
     courbes 2 px, marqueurs ≥ 8 px cerclés de 2 px en couleur de surface
     aplat d'aire à 10 %, grille en filet 1 px pleine (jamais pointillée)
     2 px de surface entre deux marques qui se touchent
     un seul axe, jamais deux échelles
     étiquettes directes parcimonieuses ; les valeurs restantes sont portées par
     l'axe, la légende et l'infobulle
   ========================================================================== */

const Fmt = (() => {
  const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const pct1 = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

  return {
    eur: (v) => eur0.format(v || 0),
    eur2: (v) => eur2.format(v || 0),
    /** Compact pour les axes et les grands nombres : 12,9 k€ */
    eurK: (v) => {
      const a = Math.abs(v);
      if (a >= 10000) return `${num0.format(Math.round(v / 1000))} k€`;
      return `${num0.format(Math.round(v))} €`;
    },
    signed: (v) => (v > 0 ? "+" : "") + eur0.format(v || 0),
    pct: (v) => pct1.format(v || 0),
    num: (v) => num0.format(v || 0),
    day: (ts) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    dayLong: (ts) =>
      new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    dayGroup: (ts) => new Date(ts).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    monthLong: (key) => {
      const [y, m] = key.split("-");
      return new Date(+y, +m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    },
    monthShort: (key) => {
      const [y, m] = key.split("-");
      return new Date(+y, +m - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
    },
  };
})();

const Charts = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const el = (n, attrs = {}) => {
    const e = document.createElementNS(NS, n);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    return e;
  };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#8b93a1";

  /* ---------- Infobulle partagée ---------- */

  let tipEl = null;
  function tip() {
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.className = "tip";
      tipEl.setAttribute("role", "status");
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add("show");
    const w = t.offsetWidth;
    const clamped = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, x));
    t.style.left = clamped + "px";
    t.style.top = Math.max(48, y - 10) + "px";
  }
  function hideTip() {
    if (tipEl) tipEl.classList.remove("show");
  }
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest || !e.target.closest(".chart")) hideTip();
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  /** Rend la marque atteignable au doigt : la cible de survol dépasse la marque. */
  function hoverable(node, hitNode, htmlFn) {
    const handler = (ev) => {
      const r = (hitNode || node).getBoundingClientRect();
      showTip(htmlFn(), r.left + r.width / 2, r.top);
      ev.stopPropagation();
    };
    node.style.cursor = "pointer";
    node.addEventListener("pointerenter", handler);
    node.addEventListener("pointerdown", handler);
    node.addEventListener("pointerleave", hideTip);
  }

  /* ---------- Géométrie des marques ---------- */

  const BAR_MAX = 24;
  const GAP = 2; // le séparateur est de la surface, jamais un contour

  /** Colonne montante : extrémité haute arrondie, pied carré sur la ligne de base. */
  function colPath(x, w, yBase, yTop, r = 4) {
    const h = Math.abs(yBase - yTop);
    const rr = Math.max(0, Math.min(r, w / 2, h));
    if (yTop <= yBase) {
      return `M${x},${yBase} L${x},${yTop + rr} Q${x},${yTop} ${x + rr},${yTop} L${x + w - rr},${yTop} Q${x + w},${yTop} ${x + w},${yTop + rr} L${x + w},${yBase} Z`;
    }
    // colonne descendante (variance négative) : arrondi en bas
    return `M${x},${yBase} L${x},${yTop - rr} Q${x},${yTop} ${x + rr},${yTop} L${x + w - rr},${yTop} Q${x + w},${yTop} ${x + w},${yTop - rr} L${x + w},${yBase} Z`;
  }

  /** Barre horizontale : extrémité droite arrondie, pied carré à l'origine. */
  function barPath(y, h, xBase, xEnd, r = 4) {
    const len = Math.abs(xEnd - xBase);
    const rr = Math.max(0, Math.min(r, h / 2, len));
    return `M${xBase},${y} L${xEnd - rr},${y} Q${xEnd},${y} ${xEnd},${y + rr} L${xEnd},${y + h - rr} Q${xEnd},${y + h} ${xEnd - rr},${y + h} L${xBase},${y + h} Z`;
  }

  /** Bornes et graduations arrondies à des valeurs lisibles, y compris en négatif :
      l'axe porte les valeurs qu'on n'étiquette pas directement, il doit se lire seul. */
  function niceScale(lo, hi, count = 3) {
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const raw = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const nlo = Math.floor(lo / step) * step;
    const nhi = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = nlo; v <= nhi + step * 0.001; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { lo: nlo, hi: nhi, ticks };
  }

  function niceTicks(max, count = 4) {
    if (max <= 0) return [0];
    const raw = max / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
    return out;
  }

  function mount(container, height) {
    container.innerHTML = "";
    const w = Math.max(240, container.clientWidth || 320);
    const svg = el("svg", { class: "chart", width: w, height, viewBox: `0 0 ${w} ${height}` });
    container.appendChild(svg);
    return { svg, w, h: height };
  }

  /* ---------- 1. Donut — répartition des dépenses ---------- */

  function donut(container, slices, { size = 190, thickness = 26 } = {}) {
    container.innerHTML = "";
    const total = slices.reduce((s, d) => s + d.value, 0);
    const svg = el("svg", { class: "chart", width: size, height: size, viewBox: `0 0 ${size} ${size}` });
    const cx = size / 2,
      cy = size / 2;
    const rOut = size / 2 - 2;
    const rIn = rOut - thickness;
    const rMid = (rOut + rIn) / 2;

    if (!total) {
      svg.appendChild(el("circle", { cx, cy, r: rMid, fill: "none", stroke: cssVar("--surface-3"), "stroke-width": thickness }));
      container.appendChild(svg);
      return;
    }

    // L'écart de 2 px est converti en angle au rayon médian : deux parts voisines
    // se lisent grâce au vide, pas grâce à un contour.
    const gapAngle = GAP / rMid;
    let a0 = -Math.PI / 2;

    slices.forEach((d) => {
      const sweep = (d.value / total) * Math.PI * 2;
      const s = a0 + gapAngle / 2;
      const e = a0 + sweep - gapAngle / 2;
      a0 += sweep;
      if (e <= s) return;

      const p = el("path", {
        d: arcRing(cx, cy, rIn, rOut, s, e),
        fill: cssVar(d.slot),
        role: "img",
      });
      const pct = d.value / total;
      hoverable(p, p, () => `${escapeHtml(d.label)}<br><b>${Fmt.eur(d.value)}</b> · ${Fmt.pct(pct)}`);
      svg.appendChild(p);
    });

    container.appendChild(svg);
  }

  function arcRing(cx, cy, rIn, rOut, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + rOut * Math.cos(a0),
      y0 = cy + rOut * Math.sin(a0);
    const x1 = cx + rOut * Math.cos(a1),
      y1 = cy + rOut * Math.sin(a1);
    const x2 = cx + rIn * Math.cos(a1),
      y2 = cy + rIn * Math.sin(a1);
    const x3 = cx + rIn * Math.cos(a0),
      y3 = cy + rIn * Math.sin(a0);
    return `M${x0},${y0} A${rOut},${rOut} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 ${large} 0 ${x3},${y3} Z`;
  }

  /* ---------- 2. Colonnes groupées — revenus vs dépenses par mois ---------- */

  function monthlyColumns(container, months, { height = 190 } = {}) {
    const { svg, w } = mount(container, height);
    if (!months.length) return;

    const padL = 40,
      padR = 6,
      padT = 10,
      padB = 22;
    const plotW = w - padL - padR;
    const plotH = height - padT - padB;
    const max = Math.max(1, ...months.map((m) => Math.max(m.revenus, m.depenses)));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const y = (v) => padT + plotH - (v / top) * plotH;

    ticks.forEach((t) => {
      svg.appendChild(el("line", { class: t === 0 ? "axis-line" : "grid-line", x1: padL, x2: w - padR, y1: y(t), y2: y(t) }));
      const lb = el("text", { x: padL - 7, y: y(t) + 3.5, "text-anchor": "end" });
      lb.textContent = Fmt.eurK(t);
      svg.appendChild(lb);
    });

    const band = plotW / months.length;
    // deux colonnes par mois, 2 px de surface entre elles, largeur plafonnée
    const barW = Math.min(BAR_MAX, Math.max(3, (band - 10 - GAP) / 2));
    const groupW = barW * 2 + GAP;

    const series = [
      { key: "revenus", label: "Revenus", color: cssVar("--s3") },
      { key: "depenses", label: "Dépenses", color: cssVar("--s2") },
    ];

    months.forEach((m, i) => {
      const gx = padL + i * band + (band - groupW) / 2;
      series.forEach((s, si) => {
        const v = m[s.key];
        const x = gx + si * (barW + GAP);
        const p = el("path", { d: colPath(x, barW, y(0), y(v)), fill: s.color });
        hoverable(
          p,
          p,
          () =>
            `${escapeHtml(Fmt.monthLong(m.key))}<br>Revenus <b>${Fmt.eur(m.revenus)}</b><br>Dépenses <b>${Fmt.eur(m.depenses)}</b><br>Solde <b>${Fmt.signed(m.net)}</b>`
        );
        svg.appendChild(p);
      });

      // un mois sur deux si la place manque
      const every = band < 34 ? 2 : 1;
      if (i % every === 0 || i === months.length - 1) {
        const t = el("text", { x: padL + i * band + band / 2, y: height - 7, "text-anchor": "middle" });
        t.textContent = Fmt.monthShort(m.key);
        svg.appendChild(t);
      }
    });
  }

  /* ---------- 3. Courbe — solde cumulé ---------- */

  function areaLine(container, points, { height = 180, color = "--s1", label = "Solde" } = {}) {
    const { svg, w } = mount(container, height);
    if (points.length < 2) return;

    const padL = 44,
      padR = 10,
      padT = 12,
      padB = 20;
    const plotW = w - padL - padR;
    const plotH = height - padT - padB;
    const vals = points.map((p) => p.value);
    let rawLo = Math.min(...vals),
      rawHi = Math.max(...vals);
    if (rawLo > 0 && rawLo < (rawHi - rawLo) * 0.5) rawLo = 0;
    const scale = niceScale(rawLo, rawHi, 3);
    const lo = scale.lo,
      hi = scale.hi;

    const t0 = points[0].date,
      t1 = points[points.length - 1].date;
    const span = Math.max(1, t1 - t0);
    const x = (ts) => padL + ((ts - t0) / span) * plotW;
    const y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

    scale.ticks.forEach((v) => {
      svg.appendChild(el("line", { class: v === 0 ? "axis-line" : "grid-line", x1: padL, x2: w - padR, y1: y(v), y2: y(v) }));
      const lb = el("text", { x: padL - 7, y: y(v) + 3.5, "text-anchor": "end" });
      lb.textContent = Fmt.eurK(v);
      svg.appendChild(lb);
    });

    const c = cssVar(color);
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

    // l'aplat est un lavis à 10 %, jamais un bloc saturé
    svg.appendChild(
      el("path", {
        d: `${d} L${x(t1).toFixed(1)},${y(lo)} L${x(t0).toFixed(1)},${y(lo)} Z`,
        fill: c,
        opacity: 0.1,
      })
    );
    svg.appendChild(el("path", { class: "mark-line", d, stroke: c }));

    const last = points[points.length - 1];
    svg.appendChild(el("circle", { class: "mark-dot", cx: x(last.date), cy: y(last.value), r: 4.5, fill: c }));

    [points[0], last].forEach((p, i) => {
      const t = el("text", { x: i ? w - padR : padL, y: height - 6, "text-anchor": i ? "end" : "start" });
      t.textContent = Fmt.day(p.date);
      svg.appendChild(t);
    });

    // Réticule : une seule série, la valeur suit le doigt plutôt que d'être écrite partout
    const cross = el("line", { class: "grid-line", y1: padT, y2: padT + plotH, opacity: 0 });
    cross.setAttribute("stroke", cssVar("--baseline"));
    const dot = el("circle", { class: "mark-dot", r: 4.5, fill: c, opacity: 0 });
    svg.appendChild(cross);
    svg.appendChild(dot);

    const hit = el("rect", { x: padL, y: 0, width: plotW, height, fill: "transparent" });
    svg.appendChild(hit);

    const track = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const ratio = Math.max(0, Math.min(1, (px - padL) / plotW));
      const ts = t0 + ratio * span;
      let best = points[0];
      for (const p of points) if (Math.abs(p.date - ts) < Math.abs(best.date - ts)) best = p;
      const bx = x(best.date),
        by = y(best.value);
      cross.setAttribute("x1", bx);
      cross.setAttribute("x2", bx);
      cross.setAttribute("opacity", 1);
      dot.setAttribute("cx", bx);
      dot.setAttribute("cy", by);
      dot.setAttribute("opacity", 1);
      showTip(`${Fmt.day(best.date)}<br>${label} <b>${Fmt.eur(best.value)}</b>`, r.left + bx, r.top + by);
    };
    hit.addEventListener("pointermove", track);
    hit.addEventListener("pointerdown", track);
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("opacity", 0);
      dot.setAttribute("opacity", 0);
      hideTip();
    });
  }

  /* ---------- 4. Barres horizontales — postes de dépense ---------- */

  function rankedBars(container, items, { height = null, rowH = 34, total = 0 } = {}) {
    const h = height || Math.max(40, items.length * rowH + 8);
    const { svg, w } = mount(container, h);
    if (!items.length) return;

    const padL = 0,
      padR = 66;
    const plotW = w - padL - padR;
    const max = Math.max(...items.map((d) => d.value), 1);
    const barH = Math.min(BAR_MAX, rowH - 16);

    items.forEach((d, i) => {
      const yTop = i * rowH + 2;
      const labelY = yTop + 10;

      const lb = el("text", { x: padL, y: labelY, class: "lbl-strong" });
      lb.textContent = d.label.length > 26 ? d.label.slice(0, 25) + "…" : d.label;
      svg.appendChild(lb);

      const barY = labelY + 6;
      const len = Math.max(3, (d.value / max) * plotW);

      svg.appendChild(el("rect", { x: padL, y: barY, width: plotW, height: barH, rx: barH / 2, fill: cssVar("--surface-3") }));
      const p = el("path", { d: barPath(barY, barH, padL, padL + len), fill: cssVar(d.slot) });
      hoverable(
        p,
        p,
        () => `${escapeHtml(d.label)}<br><b>${Fmt.eur(d.value)}</b>${total ? ` · ${Fmt.pct(d.value / total)}` : ""}`
      );
      svg.appendChild(p);

      // valeur en bout de barre — une étiquette directe par ligne, pas davantage
      const v = el("text", { x: w, y: barY + barH / 2 + 4, "text-anchor": "end", class: "lbl-strong" });
      v.textContent = Fmt.eur(d.value);
      svg.appendChild(v);
    });
  }

  /* ---------- 5. Variance — écart au budget ---------- */

  function variance(container, items, { height = 200 } = {}) {
    const { svg, w } = mount(container, height);
    if (!items.length) return;

    const padL = 42,
      padR = 6,
      padT = 12,
      padB = 62; // les libellés inclinés ont besoin de place, sinon ils se chevauchent
    const plotW = w - padL - padR;
    const plotH = height - padT - padB;
    const rawMax = Math.max(1, ...items.map((d) => Math.abs(d.value)));
    const maxAbs = niceScale(0, rawMax, 1).hi; // arme symétrique, bornée à une valeur ronde
    const y0 = padT + plotH / 2;
    const y = (v) => y0 - (v / maxAbs) * (plotH / 2);

    svg.appendChild(el("line", { class: "axis-line", x1: padL, x2: w - padR, y1: y0, y2: y0 }));
    [maxAbs, -maxAbs].forEach((v) => {
      const t = el("text", { x: padL - 7, y: y(v) + 3.5, "text-anchor": "end" });
      t.textContent = Fmt.eurK(v);
      svg.appendChild(t);
    });

    const band = plotW / items.length;
    const barW = Math.min(BAR_MAX, Math.max(4, band - 8 - GAP));

    items.forEach((d, i) => {
      const x = padL + i * band + (band - barW) / 2;
      // couleurs divergentes : au-dessus de zéro = sous le budget
      const color = d.value >= 0 ? cssVar("--st-good") : cssVar("--st-critical");
      const p = el("path", { d: colPath(x, barW, y0, y(d.value)), fill: color });
      hoverable(
        p,
        p,
        () =>
          `${escapeHtml(d.label)}<br>Prévu <b>${Fmt.eur(d.planned)}</b><br>Réalisé <b>${Fmt.eur(d.actual)}</b><br>${d.value >= 0 ? "Sous le budget" : "Dépassement"} <b>${Fmt.eur(Math.abs(d.value))}</b>`
      );
      svg.appendChild(p);

      const g = el("g", { transform: `translate(${padL + i * band + band / 2 + 3}, ${height - padB + 16}) rotate(-52)` });
      const t = el("text", { "text-anchor": "end" });
      t.textContent = d.label.length > 13 ? d.label.slice(0, 12) + "…" : d.label;
      g.appendChild(t);
      svg.appendChild(g);
    });
  }

  /* ---------- 6. Sparkline — carte de compte ---------- */

  function sparkline(container, points, { height = 30, color = "--s1" } = {}) {
    container.innerHTML = "";
    const w = Math.max(56, container.clientWidth || 72);
    if (points.length < 2) return;
    const svg = el("svg", { class: "chart", width: w, height, viewBox: `0 0 ${w} ${height}` });
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals),
      hi = Math.max(...vals);
    const span = hi - lo || 1;
    const step = w / (points.length - 1);
    const d = points
      .map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 3 - ((p.value - lo) / span) * (height - 6)).toFixed(1)}`)
      .join(" ");
    svg.appendChild(el("path", { class: "mark-line", d, stroke: cssVar(color), opacity: 0.85 }));
    container.appendChild(svg);
  }

  /* ---------- 7. Prévisionnel 30 jours ---------- */

  function forecastLine(container, points, { height = 150 } = {}) {
    const { svg, w } = mount(container, height);
    if (points.length < 2) return;

    const padL = 46,
      padR = 10,
      padT = 12,
      padB = 20;
    const plotW = w - padL - padR;
    const plotH = height - padT - padB;
    const vals = points.map((p) => p.value);
    const scale = niceScale(Math.min(...vals, 0), Math.max(...vals), 2);
    const lo = scale.lo,
      hi = scale.hi;

    const t0 = points[0].date,
      t1 = points[points.length - 1].date;
    const span = Math.max(1, t1 - t0);
    const x = (ts) => padL + ((ts - t0) / span) * plotW;
    const y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

    scale.ticks.forEach((v) => {
      svg.appendChild(el("line", { class: v === 0 ? "axis-line" : "grid-line", x1: padL, x2: w - padR, y1: y(v), y2: y(v) }));
      const t = el("text", { x: padL - 7, y: y(v) + 3.5, "text-anchor": "end" });
      t.textContent = Fmt.eurK(v);
      svg.appendChild(t);
    });

    const end = points[points.length - 1].value;
    const c = end >= 0 ? cssVar("--s1") : cssVar("--st-critical");
    const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    svg.appendChild(el("path", { d: `${d} L${x(t1)},${y(lo)} L${x(t0)},${y(lo)} Z`, fill: c, opacity: 0.1 }));
    svg.appendChild(el("path", { class: "mark-line", d, stroke: c }));
    svg.appendChild(el("circle", { class: "mark-dot", cx: x(t1), cy: y(end), r: 4.5, fill: c }));

    const a = el("text", { x: padL, y: height - 6, "text-anchor": "start" });
    a.textContent = "aujourd'hui";
    svg.appendChild(a);
    const b = el("text", { x: w - padR, y: height - 6, "text-anchor": "end" });
    b.textContent = Fmt.day(t1);
    svg.appendChild(b);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  return { donut, monthlyColumns, areaLine, rankedBars, variance, sparkline, forecastLine, cssVar, hideTip, escapeHtml };
})();
