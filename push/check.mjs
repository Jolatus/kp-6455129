/* Polarlicht-Wecker: läuft als GitHub-Action alle 10 Minuten (siehe .github/workflows/polarlicht-wecker.yml) oder lokal:
     DRY_RUN=1 BASE=see node push/check.mjs
     DRY_RUN=1 TEST_BRIEFING=1 BASE=farm node push/check.mjs
   Zwei Aufgaben:
     1. Abend-Briefing gegen 17 Uhr Ortszeit (leise): Lohnt sich heute Nacht, wann und wo?
     2. Alarm (laut), wenn es jetzt oder in der nächsten Stunde gut aussieht.
   Umgebungsvariablen:
     NTFY_TOPIC     geheimer Kanalname in der ntfy-App (Pflicht, außer bei DRY_RUN)
     THRESHOLD      Schwelle für den Alarm, Standard 0.55
     BASE           Basis außerhalb der Reisedaten: sinetta, see, farm oder rovaniemi
     SITE_URL       Adresse der Web-App, wird in den Nachrichten verlinkt
     BRIEFING=0     Abend-Briefing abschalten
     TEST_BRIEFING  Briefing jetzt sofort schicken (zum Testen)
     DRY_RUN=1      nichts senden, nur ausgeben
     FORCE=1        Alarm auch senden, wenn in den letzten 90 Minuten schon einer kam */
await import(new URL('../radar-core.js', import.meta.url));
const R = globalThis.Radar;
const env = process.env;
const now = Date.now();
const THRESHOLD = parseFloat(env.THRESHOLD) || 0.55;
const NTFY = 'https://ntfy.sh';
const SITE = env.SITE_URL || undefined;
const L = R.local(now);

/* Testnachricht, um die Einrichtung zu prüfen */
if (env.TEST_PUSH) {
  if (!env.NTFY_TOPIC) { console.log('NTFY_TOPIC fehlt.'); process.exit(1); }
  const r = await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: env.NTFY_TOPIC, title: 'Polarlicht-Wecker eingerichtet', message: 'Testnachricht. So sieht ein Alarm aus, wenn es draußen losgeht.', priority: 5, tags: ['milky_way', 'test'], click: SITE, actions: SITE ? [{ action: 'view', label: 'App öffnen', url: SITE }] : undefined }) });
  console.log('Testnachricht gesendet, ntfy:', r.status); process.exit(0);
}

const base = R.baseForToday(now) || env.BASE;
if (!base || !R.BASES[base]) { console.log('Außerhalb der Reise und keine BASE gesetzt, nichts zu tun.'); process.exit(0); }
const B = R.BASES[base];
/* Basis mit Abfahrtszeit (Rovaniemi): danach nichts mehr melden */
if (B.until != null && (L.h >= B.until || L.h < 12)) { console.log('Nach der Abfahrt um ' + B.until + ' Uhr, nichts zu tun.'); process.exit(0); }

async function get(url, type = 'json', ms = 30000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'polarlicht-radar (private, non-commercial)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return type === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
const safe = async p => { try { return await p; } catch (e) { console.log('Quelle fehlt:', e.message); return null; } };
async function recentMessages(since) {
  if (!env.NTFY_TOPIC) return null;
  const txt = await safe(get(NTFY + '/' + encodeURIComponent(env.NTFY_TOPIC) + '/json?poll=1&since=' + since, 'text'));
  if (txt == null) return null;
  return txt.split('\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(j => j && j.event === 'message');
}
async function send(msg) {
  if (env.DRY_RUN) { console.log('DRY_RUN, nichts gesendet:', JSON.stringify(msg)); return; }
  if (!env.NTFY_TOPIC) { console.log('NTFY_TOPIC fehlt, nichts gesendet.'); process.exitCode = 1; return; }
  const res = await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ topic: env.NTFY_TOPIC, click: SITE }, msg)) });
  console.log('ntfy:', res.status);
}

/* Alle Spots der Basis, auch die Fernziele (für das Briefing) */
const locs = R.SPOTS.filter(s => s.base[base]).map(s => Object.assign({}, s, { min: s.base[base][0], how: s.base[base][1] }));
const la = locs.map(l => l.lat).join(','), lo = locs.map(l => l.lon).join(',');
const om = 'latitude=' + la + '&longitude=' + lo + '&past_days=1&forecast_days=3&timezone=GMT';
const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

const [det, ens, kpRaw, ovRaw, mag, obsXml, rmap, k1m, rtswMag, rtswWind] = await Promise.all([
  safe(get('https://api.open-meteo.com/v1/forecast?' + om + '&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,apparent_temperature,wind_speed_10m,snowfall,wind_gusts_10m&models=metno_seamless')),
  safe(get('https://ensemble-api.open-meteo.com/v1/ensemble?' + om + '&hourly=cloud_cover&models=ecmwf_ifs025,icon_seamless', 'json', 45000)),
  safe(get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')),
  safe(get('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', 'json', 45000)),
  safe(get('https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json')),
  safe(get('https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::simple&bbox=20,66,30,70.2&parameters=n_man&starttime=' + iso(now - 40 * 60e3) + '&endtime=' + iso(now), 'text')),
  /* Offizieller Aktivitätsindex der finnischen Magnetometer (R-Index mit Schwellen je Station) */
  safe(get('https://space.fmi.fi/MIRACLE/RWC/r-index/api/map-en-esa.json')),
  safe(get('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')),
  /* Sonnenwind als Minutenwerte des letzten Tages (je etwa 1–2 MB), für das 30-Minuten-Mittel */
  safe(get('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', 'json', 45000)),
  safe(get('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', 'json', 45000))
]);
if (!det && !ens) { console.log('Keine Wolkendaten, Abbruch.'); process.exit(0); }

/* FMI-Magnetometer in der Nähe: zwei nächste Stationen mit Daten */
let fmi = [];
if (rmap && rmap.data) {
  rmap.data.forEach(tr => (tr.customdata || []).forEach(c => {
    const lat = parseFloat(c[4]), lon = parseFloat(c[5]);
    if (!isFinite(lat) || /no data/i.test(c[0])) return;
    fmi.push({ label: c[0], r: Math.round(c[3]), name: c[6], km: R.haversineKm(B, { lat, lon }) });
  }));
  fmi = fmi.sort((a, b) => a.km - b.km).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i).slice(0, 2);
}
/* Höchste Chance der beiden nächsten Stationen als „jetzt gemessen“ */
const rP = fmi.map(s => R.rIndexToP(s.r, s.name)).filter(v => v != null);
const actNow = rP.length ? { p: Math.max(...rP), t: now } : null;

const stations = obsXml ? R.parseFmiObs(obsXml) : [];
const obs = locs.map(l => R.nearestObs(stations, l.lat, l.lon, 40));
/* Sonnenwind: 30-Minuten-Mittel, sonst der letzte Einzelwert der Kurzübersicht */
const sw = R.solarWind(rtswMag, rtswWind, now);
const bz = sw ? sw.bz : mag && mag[0] && now - Date.parse(mag[0].time_tag) < 90 * 60e3 ? +mag[0].bz_gsm : null;
const v = sw ? sw.v : null;
const kpNow = R.parseKpNow(k1m);
const kp = R.parseKp(kpRaw);
const ov = ovRaw ? R.reduceOvation(ovRaw) : null;
const DET = det ? [].concat(det) : null, ENS = ens ? [].concat(ens) : null;
const run = (win, withMagnet) => R.evaluate({ locs, det: DET, ens: ENS, kp, ov, bz, v, obs, kpNow, actNow: withMagnet ? actNow : null, now, win });
/* Stärkster erwarteter Kp im Fenster, mit NOAA-Sturmstufe */
function stormIn(win) {
  let best = null;
  for (let t = Math.max(win.start, now - R.HOUR); t <= win.end; t += R.HOUR) {
    let row = null; for (const r of kp) { if (r.t <= t) row = r; else break; }
    if (row && (!best || row.kp > best.kp)) best = { kp: row.kp, g: row.g, t: Math.max(t, row.t) };
  }
  return best;
}

/* Texte wie in der App */
const pct = v => v == null ? '–' : v < 0.05 ? 'unter 5 %' : Math.round(v * 20) * 5 + ' %';
const deg = v => v == null || !isFinite(v) ? '–' : (Math.round(v) < 0 ? '−' : '') + Math.abs(Math.round(v)) + ' °C';
const hh = t => String(R.local(t).h).padStart(2, '0');
const clock = t => { const l = R.local(Math.round(t / 600e3) * 600e3); return String(l.h).padStart(2, '0') + ':' + String(l.min).padStart(2, '0'); };
const where = l => l.name + ' (' + R.howText(l) + ')';
const actionsFor = l => [].concat(l && l.min > 0 ? [{ action: 'view', label: 'Route', url: R.mapsUrl(l) }] : [], SITE ? [{ action: 'view', label: 'App öffnen', url: SITE }] : []);

/* ---------- 0. Stille Statusmeldung für die App: Magnetometer-Werte ----------
   Thema = NTFY_TOPIC + "-status". Die Handys abonnieren es nicht, nur die App liest es (ntfy erlaubt Abrufe aus dem Browser). */
async function status() {
  const payload = { v: 1, t: now, base, fmi: fmi.map(s => [s.name, s.label, s.r, Math.round(s.km)]), p: actNow ? Math.round(actNow.p * 100) / 100 : null, sw: sw ? [sw.bz, sw.v, sw.t] : null };
  if (env.DRY_RUN || !env.NTFY_TOPIC) { console.log('Status (nicht gesendet):', JSON.stringify(payload)); return; }
  try {
    const r = await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: env.NTFY_TOPIC + '-status', message: JSON.stringify(payload), priority: 1, tags: ['status'] }) });
    console.log('Status an die App, ntfy:', r.status);
  } catch (e) { console.log('Status nicht gesendet:', e.message); }
}

/* ---------- 1. Abend-Briefing ---------- */
async function briefing() {
  const due = env.TEST_BRIEFING || (env.BRIEFING !== '0' && L.h >= 17 && L.h < 19);
  if (!due) return;
  if (!env.TEST_BRIEFING && !env.DRY_RUN) {
    const recent = await recentMessages('12h');
    if (recent && recent.some(j => (j.tags || []).includes('briefing'))) { console.log('Briefing heute schon geschickt.'); return; }
  }
  const nightRec = k => { const win = R.clampWindow(R.windowFor('nacht', now, k), base); const res = run(win, false); return { win, res, rec: R.recommend(res) }; };
  const n0 = nightRec(0), n1 = nightRec(1);
  const rec = n0.rec;
  if (!rec || rec.verdict === 'hell') { console.log('Briefing: keine Bewertung möglich.'); return; }
  const t = rec.target, lv = R.level(t.chance), go = lv.key === 'gut' || lv.key === 'mittel';
  const span = R.goodSpan(t);
  const title = lv.key === 'nein' ? 'Heute Nacht lohnt sich kaum (' + pct(t.chance) + ')' : 'Heute Nacht: ' + lv.word + ' (' + pct(t.chance) + ')';
  const lines = [];
  if (go) {
    lines.push('Ziel: ' + where(t.loc) + '.');
    if (t.best) lines.push('Am besten ' + hh(t.best.t) + ' Uhr' + (span && span.to - span.from > R.HOUR ? ', gut von ' + hh(span.from) + ' bis ' + hh(span.to) + ' Uhr' : '') + '.');
  } else lines.push((lv.key === 'klein' ? 'Ein Blick nach Norden lohnt, wenn ihr ohnehin wach seid. ' : '') + 'Bester Spot: ' + t.loc.name + (t.best ? ', ' + hh(t.best.t) + ' Uhr' : '') + '.');
  if (rec.far) lines.push('In der Nähe höchstens ' + pct(rec.near.chance) + ' (' + rec.near.loc.name + '), deshalb die längere Fahrt.');
  const plan = go && t.loc.min >= 30 ? R.tripPlan(t, rec.home) : null;
  if (plan) {
    lines.push('Losfahren gegen ' + clock(plan.go) + ', zurück gegen ' + clock(plan.back) + '.');
    if (plan.snow >= 0.3) lines.push('Unterwegs Schneefall möglich.');
    if (plan.gust >= 50) lines.push('Böen bis ' + Math.round(plan.gust) + ' km/h.');
  }
  lines.push('Himmel ' + R.skyWord(t.pClear) + ' (' + pct(t.pClear) + '), Polarlicht ' + R.auroraWord(t.pAur) + '.');
  const st = stormIn(n0.win);
  if (st && st.g >= 1) lines.push('NOAA erwartet einen ' + R.gWord(st.g) + 'en Sturm (G' + st.g + ') ab etwa ' + hh(st.t) + ' Uhr.');
  if (t.feelsMin != null) lines.push('Gefühlt bis ' + deg(t.feelsMin) + '.');
  const mo = t.best && t.best.moon; if (mo && mo.light >= 0.3) lines.push('Mond: ' + R.moonWord(mo).text + '.');
  const r1 = n1.rec && n1.rec.target;
  if (r1 && r1.chance != null && r1.chance - (t.chance || 0) >= 0.15) lines.push('Morgen Nacht besser: ' + pct(r1.chance) + '.');
  if (n0.win.until != null) lines.push('Gerechnet bis ' + n0.win.until + ' Uhr (Abfahrt).');
  lines.push('Der Wecker meldet sich ab ' + pct(THRESHOLD) + '.');
  const message = lines.join(' ');
  console.log('BRIEFING:', title, '|', message);
  await send({ title, message, priority: 3, tags: ['crescent_moon', 'briefing'], actions: actionsFor(go ? t.loc : null) });
}

/* ---------- 2. Alarm ---------- */
async function alarm() {
  const h0 = Math.floor(now / R.HOUR) * R.HOUR;
  /* Nur laufende und nächste Stunde: Weiter reicht die Vorwarnung des Sonnenwind-Satelliten nicht. Keine Fernziele. */
  const results = run({ start: h0, end: h0 + R.HOUR, label: 'jetzt und nächste Stunde' }, true);
  const rec = R.recommend(results, { near: true });
  if (!rec) { console.log('Alarm: keine Bewertung möglich.'); return; }
  const target = rec.target;
  const fmiActive = fmi.find(s => /medium|high/i.test(s.label));
  const fmiHigh = fmi.find(s => /high/i.test(s.label));
  const dark = rec.verdict !== 'hell';
  const byChance = target.chance != null && target.chance >= THRESHOLD;
  const byMagnet = !!fmiActive && (target.pClear || 0) >= 0.5;
  const trigger = dark && (byChance || byMagnet);
  const fmiTxt = fmi.length ? 'FMI-Magnetometer: ' + fmi.map(s => s.name + ' ' + ({ 'No activity': 'ruhig', 'Medium activity': 'aktiv', 'High activity': 'stark aktiv' }[s.label] || s.label) + ' (R ' + s.r + ')').join(', ') + '.' : '';
  const message = where(target.loc) + '. Chance ' + pct(target.chance) + ', Himmel ' + R.skyWord(target.pClear) + ' (' + pct(target.pClear) + '), Polarlicht ' + R.auroraWord(target.pAur) + '. ' + (target.tFirst != null ? 'Draußen ' + deg(target.tFirst) + '. ' : '') + fmiTxt;
  const title = fmiHigh ? 'Starkes Polarlicht gemessen, jetzt raus!' : byMagnet ? 'Magnetometer schlagen aus, jetzt raus!' : 'Gute Polarlicht-Chance, jetzt raus!';
  console.log(new Date(now).toISOString(), '| Basis', base, '| Urteil', rec.verdict, '| Ziel', target.loc.name, pct(target.chance), '| klar', pct(target.pClear), '| aktiv', pct(target.pAur), '| Bz', bz, sw ? '(Mittel 30 Min., ' + v + ' km/s)' : '(Einzelwert)', '| Kp gemessen', kpNow && kpNow.kp.toFixed(2), '| FMI', JSON.stringify(fmi.map(s => [s.name, s.label, s.r])), 'P', actNow && actNow.p.toFixed(2), '| Wetterstationen', stations.length, '| Beobachtung am Ziel', JSON.stringify(obs[locs.findIndex(l => l.id === target.loc.id)]));
  if (!trigger) { console.log('Kein Alarm (dunkel: ' + dark + ', Chance ≥ ' + THRESHOLD + ': ' + byChance + ', Magnetometer aktiv und klar: ' + byMagnet + ')'); return; }
  console.log('AUSLÖSEN: ' + title + ' ' + message);
  /* Nicht öfter als alle 90 Minuten wecken. Ausnahme: Es wird jetzt stark und das wurde noch nicht gemeldet. */
  if (!env.FORCE && !env.DRY_RUN) {
    const recent = await recentMessages('90m');
    const alarms = (recent || []).filter(j => (j.tags || []).includes('polarlicht'));
    if (alarms.length) {
      if (fmiHigh && !alarms.some(j => (j.tags || []).includes('stark'))) console.log('Schon geweckt, aber jetzt stark: noch einmal.');
      else { console.log('In den letzten 90 Minuten wurde schon geweckt, diesmal nicht.'); return; }
    }
  }
  await send({ title, message, priority: 5, tags: ['milky_way', 'polarlicht'].concat(fmiHigh ? ['stark'] : []), actions: actionsFor(target.loc) });
}

await status();
await briefing();
await alarm();
