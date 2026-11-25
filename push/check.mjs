/* Polarlicht-Wecker: prüft die nächsten zwei Stunden und schickt bei guter Chance eine Push-Nachricht über ntfy.
   Läuft als GitHub-Action alle 10 Minuten (siehe .github/workflows/polarlicht-wecker.yml) oder lokal:
     DRY_RUN=1 BASE=see node push/check.mjs
   Umgebungsvariablen:
     NTFY_TOPIC  geheimer Kanalname in der ntfy-App (Pflicht, außer bei DRY_RUN)
     THRESHOLD   Schwelle für die Chance, Standard 0.55
     BASE        Basis außerhalb der Reisedaten: sinetta, see, farm oder koengas
     SITE_URL    Adresse der Web-App, wird in der Nachricht verlinkt
     DRY_RUN=1   nichts senden, nur ausgeben
     FORCE=1     auch senden, wenn in den letzten 90 Minuten schon eine Nachricht kam */
await import(new URL('../radar-core.js', import.meta.url));
const R = globalThis.Radar;
const env = process.env;
const now = Date.now();
const THRESHOLD = parseFloat(env.THRESHOLD) || 0.55;
const NTFY = 'https://ntfy.sh';

/* Testnachricht, um die Einrichtung zu prüfen */
if (env.TEST_PUSH) {
  if (!env.NTFY_TOPIC) { console.log('NTFY_TOPIC fehlt.'); process.exit(1); }
  const r = await fetch(NTFY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: env.NTFY_TOPIC, title: 'Polarlicht-Wecker eingerichtet', message: 'Testnachricht. So sieht ein Alarm aus, wenn es draußen losgeht.', priority: 5, tags: ['milky_way', 'test'], click: env.SITE_URL || undefined }) });
  console.log('Testnachricht gesendet, ntfy:', r.status); process.exit(0);
}

const base = R.baseForToday(now) || env.BASE;
if (!base || !R.BASES[base]) { console.log('Außerhalb der Reise und keine BASE gesetzt, nichts zu tun.'); process.exit(0); }

async function get(url, type = 'json', ms = 30000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'polarlicht-radar (private, non-commercial)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return type === 'json' ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
const safe = async p => { try { return await p; } catch (e) { console.log('Quelle fehlt:', e.message); return null; } };

const locs = R.SPOTS.filter(s => s.base[base]).map(s => Object.assign({}, s, { min: s.base[base][0], how: s.base[base][1] }));
const la = locs.map(l => l.lat).join(','), lo = locs.map(l => l.lon).join(',');
const om = 'latitude=' + la + '&longitude=' + lo + '&past_days=1&forecast_days=2&timezone=GMT';
const iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');

const [det, ens, kpRaw, ovRaw, mag, obsXml, rmap, k1m] = await Promise.all([
  safe(get('https://api.open-meteo.com/v1/forecast?' + om + '&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&models=metno_seamless')),
  safe(get('https://ensemble-api.open-meteo.com/v1/ensemble?' + om + '&hourly=cloud_cover&models=ecmwf_ifs025,icon_seamless')),
  safe(get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json')),
  safe(get('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', 'json', 45000)),
  safe(get('https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json')),
  safe(get('https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::simple&bbox=20,66,30,70.2&parameters=n_man&starttime=' + iso(now - 40 * 60e3) + '&endtime=' + iso(now), 'text')),
  /* Offizieller Aktivitätsindex der finnischen Magnetometer (R-Index mit Schwellen je Station) */
  safe(get('https://space.fmi.fi/MIRACLE/RWC/r-index/api/map-en-esa.json')),
  safe(get('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'))
]);
if (!det && !ens) { console.log('Keine Wolkendaten, Abbruch.'); process.exit(0); }

/* FMI-Magnetometer in der Nähe: zwei nächste Stationen mit Daten */
let fmi = [];
if (rmap && rmap.data) {
  rmap.data.forEach(tr => (tr.customdata || []).forEach(c => {
    const lat = parseFloat(c[4]), lon = parseFloat(c[5]);
    if (!isFinite(lat) || /no data/i.test(c[0])) return;
    fmi.push({ label: c[0], r: Math.round(c[3]), name: c[6], km: R.haversineKm(R.BASES[base], { lat, lon }) });
  }));
  fmi = fmi.sort((a, b) => a.km - b.km).filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i).slice(0, 2);
}
/* Höchste Chance der beiden nächsten Stationen als „jetzt gemessen“ */
const rP = fmi.map(s => R.rIndexToP(s.r, s.name)).filter(v => v != null);
const actNow = rP.length ? { p: Math.max(...rP), t: now } : null;

const stations = obsXml ? R.parseFmiObs(obsXml) : [];
const obs = locs.map(l => R.nearestObs(stations, l.lat, l.lon, 40));
const bz = mag && mag[0] && now - Date.parse(mag[0].time_tag) < 90 * 60e3 ? +mag[0].bz_gsm : null;
const kpNow = R.parseKpNow(k1m);
const h0 = Math.floor(now / R.HOUR) * R.HOUR;
/* Nur laufende und nächste Stunde: Weiter reicht die Vorwarnung des Sonnenwind-Satelliten nicht */
const win = { start: h0, end: h0 + R.HOUR, label: 'jetzt und nächste Stunde' };
const results = R.evaluate({ locs, det: det ? [].concat(det) : null, ens: ens ? [].concat(ens) : null, kp: R.parseKp(kpRaw), ov: ovRaw ? R.reduceOvation(ovRaw) : null, bz, obs, kpNow, actNow, now, win });
const rec = R.recommend(results);
if (!rec) { console.log('Keine Bewertung möglich.'); process.exit(0); }
const target = rec.verdict === 'fahren' ? rec.best : rec.home;
const fmiActive = fmi.find(s => /medium|high/i.test(s.label));
const fmiHigh = fmi.find(s => /high/i.test(s.label));

const pct = v => Math.round((v || 0) * 100) + ' %';
const dark = rec.verdict !== 'hell';
const byChance = target.chance != null && target.chance >= THRESHOLD;
const byMagnet = !!fmiActive && (target.pClear || 0) >= 0.5;
const trigger = dark && (byChance || byMagnet);

const where = target.loc.min === 0 ? target.loc.name + ' (vor der Tür)' : target.loc.name + ' (' + target.loc.min + ' Min. ' + (target.loc.how === 'Auto' ? 'mit dem Auto' : target.loc.how) + ')';
const fmiTxt = fmi.length ? 'FMI-Magnetometer: ' + fmi.map(s => s.name + ' ' + ({ 'No activity': 'ruhig', 'Medium activity': 'aktiv', 'High activity': 'stark aktiv' }[s.label] || s.label) + ' (R ' + s.r + ')').join(', ') + '.' : '';
const message = 'Chance ' + pct(target.chance) + ' bei ' + where + '. Himmel klar ' + pct(target.pClear) + ', Polarlicht aktiv ' + pct(target.pAur) + '. ' + fmiTxt;
const title = fmiHigh ? 'Starkes Polarlicht gemessen, jetzt raus!' : byMagnet ? 'Magnetometer schlagen aus, jetzt raus!' : 'Gute Polarlicht-Chance, jetzt raus!';

console.log(new Date(now).toISOString(), '| Basis', base, '| Urteil', rec.verdict, '| Ziel', target.loc.name, pct(target.chance), '| klar', pct(target.pClear), '| aktiv', pct(target.pAur), '| Bz', bz, '| Kp gemessen', kpNow && kpNow.kp.toFixed(2), '| FMI', JSON.stringify(fmi.map(s => [s.name, s.label, s.r])), 'P', actNow && actNow.p.toFixed(2), '| Wetterstationen', stations.length, '| Beobachtung am Ziel', JSON.stringify(obs[locs.indexOf(target.loc)]));
console.log(trigger ? 'AUSLÖSEN: ' + title + ' ' + message : 'Kein Alarm (dunkel: ' + dark + ', Chance ≥ ' + THRESHOLD + ': ' + byChance + ', Magnetometer aktiv und klar: ' + byMagnet + ')');
if (!trigger) process.exit(0);
if (env.DRY_RUN) { console.log('DRY_RUN: nichts gesendet.'); process.exit(0); }
if (!env.NTFY_TOPIC) { console.log('NTFY_TOPIC fehlt, nichts gesendet.'); process.exit(1); }

/* Nicht öfter als alle 90 Minuten wecken */
if (!env.FORCE) {
  const recent = await safe(get(NTFY + '/' + encodeURIComponent(env.NTFY_TOPIC) + '/json?poll=1&since=90m', 'text'));
  if (recent && recent.split('\n').some(l => { try { const j = JSON.parse(l); return j.event === 'message' && (j.tags || []).includes('polarlicht'); } catch (e) { return false; } })) {
    console.log('In den letzten 90 Minuten wurde schon geweckt, diesmal nicht.'); process.exit(0);
  }
}
const res = await fetch(NTFY, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ topic: env.NTFY_TOPIC, title, message, priority: 5, tags: ['milky_way', 'polarlicht'], click: env.SITE_URL || undefined })
});
console.log('ntfy:', res.status);
