// Vue « Réservations par jour » : histogramme + tableau.
// Fonctions sans accès Firestore : renderResaJour() reçoit la liste des réservations.
(function () {
  const SERIES = [
    { nom: 'Perpignan', couleur: '#C3171F' },
    { nom: 'Montpellier', couleur: '#2a78d6' }
  ];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ajouter = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const midi = s => new Date(s + 'T12:00:00');
  const el = id => document.getElementById(id);

  function bornes(periode, auj) {
    const t = midi(auj);
    if (periode === 'avenir') return [t, ajouter(t, 29)];
    if (periode === 'mois') return [new Date(t.getFullYear(), t.getMonth(), 1, 12), new Date(t.getFullYear(), t.getMonth() + 1, 0, 12)];
    if (periode === 'mois-1') return [new Date(t.getFullYear(), t.getMonth() - 1, 1, 12), new Date(t.getFullYear(), t.getMonth(), 0, 12)];
    return [ajouter(t, 1 - Number(periode)), t];
  }

  // base = 'repas' (date de la table) ou 'prise' (jour où la résa a été créée, heure locale)
  function jourDe(r, base) {
    if (base === 'repas') return r.date || '';
    if (!r.creeLe) return '';
    const d = new Date(r.creeLe);
    return isNaN(d) ? '' : iso(d);
  }

  function agreger(resas, { base, periode, resto, auj }) {
    const [debut, fin] = bornes(periode, auj);
    const jours = new Map();
    for (let d = debut; iso(d) <= iso(fin); d = ajouter(d, 1)) {
      jours.set(iso(d), { jour: iso(d), resas: 0, couverts: 0, annulees: 0, noShows: 0, viaLien: 0,
        parResto: Object.fromEntries(SERIES.map(s => [s.nom, { resas: 0, couverts: 0 }])) });
    }
    resas.forEach(r => {
      if (resto && r.restaurant !== resto) return;
      const j = jours.get(jourDe(r, base));
      if (!j) return;
      if (r.statut === 'annulee') { j.annulees++; return; }
      const pax = Number(r.pax) || 0;
      j.resas++; j.couverts += pax;
      if (r.statut === 'no_show') j.noShows++;
      if (r.linkId) j.viaLien++;
      const p = j.parResto[r.restaurant];
      if (p) { p.resas++; p.couverts += pax; }
    });
    return Array.from(jours.values());
  }

  // Graduations entières et rondes
  function pasRond(max) {
    const brut = Math.max(1, max / 4);
    const p = Math.pow(10, Math.floor(Math.log10(brut)));
    return [1, 2, 5, 10].map(m => m * p).find(v => v >= brut);
  }

  const court = j => midi(j).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const long = j => midi(j).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  function dessiner(jours, series, mesure) {
    const boite = el('rjChart');
    const L = Math.max(boite.clientWidth || 800, 320), H = 260, g = 36, h = 8, b = 24;
    const valeur = (j, s) => j.parResto[s.nom][mesure];
    const total = j => series.reduce((a, s) => a + valeur(j, s), 0);
    const pas = pasRond(Math.max(...jours.map(total), 1));
    const max = Math.ceil(Math.max(...jours.map(total), 1) / pas) * pas;
    const y = v => H - b - v / max * (H - b - h);
    const col = (L - g) / jours.length;
    const larg = Math.max(2, Math.min(24, col - 2));
    const chaque = Math.max(1, Math.ceil(jours.length / Math.floor((L - g) / 64)));
    let svg = '';
    for (let v = 0; v <= max; v += pas) {
      svg += `<line x1="${g}" x2="${L}" y1="${y(v)}" y2="${y(v)}" stroke="#EAD9C8"/><text x="${g - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    jours.forEach((j, i) => {
      const x = g + i * col + (col - larg) / 2;
      const presents = series.filter(s => valeur(j, s) > 0);
      let cumul = 0;
      presents.forEach((s, k) => {
        const bas = y(cumul) - (k ? 2 : 0);   // 2 px de séparation entre segments
        cumul += valeur(j, s);
        const haut = Math.min(y(cumul), bas - 1);
        const r = k === presents.length - 1 ? Math.min(4, larg / 2, bas - haut) : 0;
        svg += `<path fill="${s.couleur}" d="M${x},${bas}V${haut + r}Q${x},${haut} ${x + r},${haut}H${x + larg - r}Q${x + larg},${haut} ${x + larg},${haut + r}V${bas}Z"/>`;
      });
      if ((jours.length - 1 - i) % chaque === 0) {
        const cx = Math.min(g + i * col + col / 2, L - 22);
        svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${court(j.jour)}</text>`;
      }
      svg += `<rect class="rj-hit" data-i="${i}" x="${g + i * col}" y="0" width="${col}" height="${H - b}" tabindex="0" aria-label="${long(j.jour)} : ${total(j)}"/>`;
    });
    boite.innerHTML = `<svg width="${L}" height="${H}" viewBox="0 0 ${L} ${H}" role="img" aria-label="Histogramme par jour">${svg}</svg><div class="rj-tip" hidden></div>`;

    const tip = boite.querySelector('.rj-tip');
    const montrer = e => {
      const i = Number(e.target.dataset.i), j = jours[i];
      const unite = mesure === 'resas' ? 'réservation(s)' : 'couvert(s)';
      tip.innerHTML = `<b>${long(j.jour)}</b><br>${total(j)} ${unite}` +
        (series.length > 1 ? series.map(s => `<br><i style="background:${s.couleur}"></i>${s.nom} : ${valeur(j, s)}`).join('') : '');
      tip.hidden = false;
      const x = g + i * col + col / 2;
      tip.style.left = Math.max(0, Math.min(x + 10, L - tip.offsetWidth)) + 'px';
    };
    boite.querySelectorAll('.rj-hit').forEach(z => {
      z.addEventListener('mouseenter', montrer);
      z.addEventListener('focus', montrer);
      z.addEventListener('mouseleave', () => { tip.hidden = true; });
      z.addEventListener('blur', () => { tip.hidden = true; });
    });
  }

  function renderResaJour(resas) {
    const resto = el('rjResto').value, base = el('rjBase').value, mesure = el('rjMesure').value;
    const auj = iso(new Date());
    // « 30 jours à venir » n'a pas de sens pour la date de prise
    const optAvenir = el('rjPeriode').querySelector('[value="avenir"]');
    optAvenir.disabled = base === 'prise';
    if (optAvenir.disabled && el('rjPeriode').value === 'avenir') el('rjPeriode').value = '30';
    const jours = agreger(resas, { base, resto, periode: el('rjPeriode').value, auj });
    const series = SERIES.filter(s => !resto || s.nom === resto);

    const somme = k => jours.reduce((a, j) => a + j[k], 0);
    const nb = somme('resas'), couverts = somme('couverts');
    const record = jours.reduce((a, j) => j[mesure] > a[mesure] ? j : a, jours[0]);
    const f = n => n.toFixed(1).replace('.', ',');
    el('rjKpis').innerHTML = `
      <div class="kpi"><div class="val">${nb}</div><div class="lbl">Réservations</div></div>
      <div class="kpi"><div class="val">${couverts}</div><div class="lbl">Couverts</div></div>
      <div class="kpi"><div class="val">${f(somme(mesure) / jours.length)}</div><div class="lbl">${mesure === 'resas' ? 'Résas' : 'Couverts'} / jour (moyenne)</div></div>
      <div class="kpi"><div class="val">${record[mesure]}</div><div class="lbl">Meilleur jour${record[mesure] ? ' : ' + long(record.jour) : ''}</div></div>`;

    el('rjTitre').textContent = (mesure === 'resas' ? 'Réservations' : 'Couverts') + ' par ' +
      (base === 'repas' ? 'jour de repas' : 'jour de prise de réservation') + (resto ? ' · ' + resto : '');
    el('rjLegende').innerHTML = series.length > 1
      ? series.map(s => `<span><i style="background:${s.couleur}"></i>${s.nom}</span>`).join('') : '';
    dessiner(jours, series, mesure);

    const parResto = series.length > 1;
    const cellules = j => `<td>${j.resas}</td><td>${j.couverts}</td>` +
      (parResto ? series.map(s => `<td>${j.parResto[s.nom].resas} · ${j.parResto[s.nom].couverts}</td>`).join('') : '') +
      `<td>${j.viaLien}</td><td>${j.annulees}</td><td>${j.noShows}</td>`;
    const totaux = { resas: nb, couverts, viaLien: somme('viaLien'), annulees: somme('annulees'), noShows: somme('noShows'),
      parResto: Object.fromEntries(SERIES.map(s => [s.nom, {
        resas: jours.reduce((a, j) => a + j.parResto[s.nom].resas, 0),
        couverts: jours.reduce((a, j) => a + j.parResto[s.nom].couverts, 0) }])) };
    el('rjTable').innerHTML = `<table><thead><tr><th>Jour</th><th>Résas</th><th>Couverts</th>` +
      (parResto ? series.map(s => `<th>${s.nom} (résas · couv.)</th>`).join('') : '') +
      `<th>Via un lien</th><th>Annulées</th><th>No-shows</th></tr></thead><tbody>` +
      `<tr class="rj-total"><td>Total période</td>${cellules(totaux)}</tr>` +
      jours.slice().reverse().map(j => `<tr${j.jour === auj ? ' class="rj-auj"' : ''}><td>${long(j.jour)}${j.jour === auj ? ' · aujourd’hui' : ''}</td>${cellules(j)}</tr>`).join('') +
      `</tbody></table>`;
  }

  window.renderResaJour = renderResaJour;
  window.resaJourAgreger = agreger;
})();
