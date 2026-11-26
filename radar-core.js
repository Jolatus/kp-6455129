/* Polarlicht-Radar: Rechenkern ohne DOM. Läuft im Browser (window.Radar) und in Node (globalThis.Radar). */
(function (root) {
  'use strict';

  const TZ = 'Europe/Helsinki';
  const HOUR = 3600e3;

  /* ---------- Orte ---------- */
  /* until: Stunde (Ortszeit), bis zu der man dort ist (Rovaniemi: Abfahrt um 21 Uhr) */
  const BASES = {
    sinetta: { name: 'Sinettä', short: 'Sinettä', lat: 66.6363, lon: 25.3006 },
    see: { name: 'Hütte am See', short: 'See', lat: 68.5100, lon: 23.3205 },
    farm: { name: 'Rentierfarm', short: 'Farm', lat: 67.77397, lon: 25.23808 },
    rovaniemi: { name: 'Rovaniemi', short: 'Rovaniemi', lat: 66.5025, lon: 25.7305, until: 21 }
  };

  /* n = freier Blick nach Norden (1–3), d = Dunkelheit (1–3), wie auf der Reiseseite bewertet.
     base: { basis: [Minuten, Art] }. Ausweichpunkte liegen an der Hauptstraße, dort nur in Parkbuchten halten.
     far: Fernziel für den Wolkenloch-Finder (bis ca. 1,5 Std. Fahrt). Fahrzeiten aus OSRM plus 10 % Winterzuschlag. */
  const FAR_NOTE = 'Fernziel: am Ortsrand eine Parkbucht mit freiem Blick nach Norden suchen, nie am Straßenrand halten. Vor der Fahrt tanken.';
  const SPOTS = [
    { id: 'SH', name: 'Hof der Unterkunft', lat: 66.6363, lon: 25.3006, n: 1, d: 1, base: { sinetta: [0, 'vor der Tür'] } },
    { id: 'S1', name: 'Lehtojärvi-Vogelturm', lat: 66.63703, lon: 25.31202, n: 2, d: 1, lake: true, base: { sinetta: [1, 'Auto'] }, note: 'Treppe kann vereist sein.' },
    { id: 'SN', name: 'Straße 79 Richtung Kittilä', lat: 66.9548, lon: 25.3562, n: 2, d: 3, base: { sinetta: [35, 'Auto'] }, note: 'Ausweichpunkt, nur in einer Parkbucht halten.' },

    { id: 'A1', name: 'Seeeis vor der Hütte', lat: 68.5128, lon: 23.3222, n: 3, d: 2, lake: true, fire: true, base: { see: [3, 'zu Fuß'] } },
    { id: 'A2', name: 'Liljankivaara', lat: 68.52034, lon: 23.3312, n: 3, d: 3, base: { see: [45, 'zu Fuß'] }, noRec: true, note: 'Ohne markierten Weg. Nachts nur auf eurer eigenen Spur und bei Windstille, deshalb nie als Empfehlung.' },
    { id: 'A3', name: 'Parkplatz Straße nach Näkkälä', lat: 68.60383, lon: 23.52927, n: 3, d: 3, base: { see: [24, 'Auto'] } },
    { id: 'H3', name: 'Ounasjärvi in Hetta', lat: 68.3759, lon: 23.5874, n: 2, d: 2, lake: true, base: { see: [20, 'Auto'] } },
    { id: 'A4', name: 'Jyppyrä-Kota in Hetta', lat: 68.4006, lon: 23.6673, n: 3, d: 2, fire: true, base: { see: [43, 'Auto + Fußweg'] } },
    { id: 'AP', name: 'Palojoensuu, Straße 93', lat: 68.284, lon: 23.081, n: 2, d: 3, base: { see: [40, 'Auto'] }, note: 'Ausweichpunkt im Südwesten, Parkbucht suchen.' },
    { id: 'AR', name: 'Straße Richtung Raattama', lat: 68.3912, lon: 24.202, n: 2, d: 3, base: { see: [45, 'Auto'] }, note: 'Ausweichpunkt im Osten, Parkbucht suchen.' },

    { id: 'F1', name: 'Hof mit Rentieren', lat: 67.77397, lon: 25.23808, n: 1, d: 1, base: { farm: [0, 'vor der Tür'] } },
    { id: 'F2', name: 'Pollojärvi', lat: 67.7725, lon: 25.2250, n: 2, d: 2, lake: true, base: { farm: [10, 'zu Fuß'] } },
    { id: 'F3', name: 'Rastinjärvi', lat: 67.79139, lon: 25.26156, n: 3, d: 3, lake: true, base: { farm: [3, 'Auto'] } },
    { id: 'F4', name: 'Laavu an der Vesmantie', lat: 67.8146, lon: 25.30573, n: 1, d: 3, fire: true, base: { farm: [7, 'Auto'] } },
    { id: 'FS', name: 'Straße 79 südlich von Kittilä', lat: 67.5551, lon: 24.9222, n: 2, d: 3, base: { farm: [50, 'Auto'] }, note: 'Ausweichpunkt, nur in einer Parkbucht halten.' },
    { id: 'L7', name: 'Levi-Gipfel', lat: 67.812, lon: 24.825, n: 2, d: 1, base: { farm: [55, 'Auto'] } },
    { id: 'K8', name: 'Kätkä-Laavu Korkeaniemi', lat: 67.7835, lon: 24.7255, n: 2, d: 2, fire: true, base: { farm: [70, 'Auto + Fußweg'] } },

    /* Rovaniemi am 10.01.: ohne Auto, also zu Fuß oder mit dem Taxi */
    { id: 'R1', name: 'Ufer an der Jätkänkynttilä-Brücke', lat: 66.5031, lon: 25.7412, n: 2, d: 1, base: { rovaniemi: [10, 'zu Fuß'] }, note: 'Stadtlicht: lohnt nur bei kräftigem Polarlicht. Vom Ufer nach Norden über den Fluss schauen.' },
    { id: 'R2', name: 'Ounasvaara', lat: 66.5025, lon: 25.8021, n: 3, d: 2, base: { rovaniemi: [12, 'Taxi'] }, note: 'Hügel östlich der Stadt, dunkler als am Fluss. Taxi für den Rückweg rechtzeitig vor der Abfahrt bestellen.' },

    /* Fernziele für den Wolkenloch-Finder */
    { id: 'XKA', name: 'Kaaresuvanto', lat: 68.4500, lon: 22.4853, n: 2, d: 2, far: true, base: { see: [85, 'Auto'] }, note: FAR_NOTE },
    { id: 'XMU', name: 'Muonio', lat: 67.9593, lon: 23.6774, n: 2, d: 2, far: true, base: { see: [90, 'Auto'] }, note: FAR_NOTE },
    { id: 'XPO', name: 'Pokka', lat: 68.1585, lon: 25.7659, n: 2, d: 3, far: true, base: { farm: [60, 'Auto'] }, note: FAR_NOTE },
    { id: 'XAK', name: 'Äkäslompolo (Ylläs)', lat: 67.6029, lon: 24.1516, n: 2, d: 2, far: true, base: { farm: [95, 'Auto'] }, note: FAR_NOTE },
    { id: 'XVI', name: 'Vikajärvi, Straße 4', lat: 66.6240, lon: 26.1996, n: 2, d: 2, far: true, base: { sinetta: [55, 'Auto'] }, note: FAR_NOTE }
  ];

  /* Welche Basis an welchem Abend (Ortszeit) */
  const TRIP = [
    ['2027-01-03', 'sinetta'], ['2027-01-04', 'see'], ['2027-01-05', 'see'], ['2027-01-06', 'see'],
    ['2027-01-07', 'farm'], ['2027-01-08', 'farm'], ['2027-01-09', 'farm'], ['2027-01-10', 'rovaniemi']
  ];

  /* ---------- Zeit in Finnland ---------- */
  const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function local(ms) {
    const p = {};
    fmtParts.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, ymd: p.year + '-' + p.month + '-' + p.day };
  }
  function tzOffsetMs(ms) { const l = local(ms); return Date.UTC(l.y, l.m - 1, l.d, l.h, l.min) - Math.floor(ms / 60000) * 60000; }
  /* Zeitpunkt „Datum y-m-d um h Uhr Ortszeit“ */
  function localTime(y, m, d, h) { const guess = Date.UTC(y, m - 1, d, h); return guess - tzOffsetMs(guess); }
  function baseForToday(now) {
    const l = local(now - 12 * HOUR); /* bis 12 Uhr zählt noch der Vorabend */
    const hit = TRIP.find(t => t[0] === l.ymd);
    return hit ? hit[1] : null;
  }

  /* Zeitfenster: „jetzt“ = aktuelle Stunde plus 3 h, „nacht“ = 16–02 Uhr Ortszeit.
     k = 0 heute Nacht, 1 morgen Nacht, 2 übermorgen */
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  function windowFor(mode, now, k) {
    const h0 = Math.floor(now / HOUR) * HOUR;
    if (mode === 'jetzt') return { start: h0, end: h0 + 3 * HOUR, label: 'Nächste 3 Stunden' };
    k = k || 0;
    const l = local(now);
    const base = l.h < 2 ? local(now - 12 * HOUR) : l; /* nach Mitternacht zählt noch die laufende Nacht */
    const start = localTime(base.y, base.m, base.d + k, 16);
    const end = start + 10 * HOUR; /* 16 bis 02 Uhr */
    const ld = local(start + HOUR);
    const label = k === 0 ? 'Heute Nacht' : k === 1 ? 'Morgen Nacht' : k === -1 ? 'Letzte Nacht' : WD[new Date(Date.UTC(ld.y, ld.m - 1, ld.d)).getUTCDay()] + ' ' + String(ld.d).padStart(2, '0') + '.' + String(ld.m).padStart(2, '0') + '. Nacht';
    return { start: k === 0 ? Math.max(start, h0) : start, end, label, k, from: start };
  }
  /* Fenster kürzen, wenn man an der Basis nur bis zu einer bestimmten Stunde ist (Rovaniemi: Abfahrt um 21 Uhr) */
  function clampWindow(win, base) {
    const b = BASES[base];
    if (!win || !b || b.until == null) return win;
    const l = local(win.from != null ? win.from : win.start);
    const lim = localTime(l.y, l.m, l.d, b.until) - HOUR; /* letzte volle Stunde vor der Abfahrt */
    return Object.assign({}, win, { end: Math.min(win.end, lim), until: b.until });
  }

  /* ---------- Sonnenhöhe (NOAA-Verfahren) ---------- */
  const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  function sunAlt(ms, lat, lon) {
    const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(om));
    const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(om));
    const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam))));
    const y = Math.tan(rad(eps / 2)) ** 2;
    const eqt = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
    const d = new Date(ms), utcMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    const ha = ((utcMin + eqt + 4 * lon) % 1440 + 1440) % 1440 / 4 - 180;
    const z = deg(Math.acos(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha))));
    return 90 - z;
  }
  /* 1 = dunkel genug, 0,5 = späte Dämmerung, 0 = zu hell */
  const darkness = alt => alt < -10 ? 1 : alt < -6 ? 0.5 : 0;
  /* Tag oder Nacht am Ort? Tag = noch hell und mehr als 1 Stunde bis zur Dunkelheit (Sonne unter −6°).
     darkFrom/darkTo: Beginn und Ende der nächsten Dunkelheit (auf 10 Minuten genau, innerhalb von 24 Stunden) */
  function dayState(now, lat, lon) {
    const step = 10 * 60e3, isDark = t => sunAlt(t, lat, lon) < -6;
    let darkFrom = null, darkTo = null;
    for (let t = now; t < now + 24 * HOUR; t += step) if (isDark(t)) { darkFrom = t; break; }
    if (darkFrom != null) for (let t = darkFrom; t < darkFrom + 24 * HOUR; t += step) if (!isDark(t)) { darkTo = t; break; }
    const darkNow = darkFrom === now;
    return { day: !darkNow && (darkFrom == null || darkFrom - now > HOUR), darkNow, darkFrom, darkTo };
  }

  /* ---------- Mond: Höhe und beleuchteter Anteil (vereinfachte Bahnformeln, auf etwa 1° genau) ---------- */
  const OBL = rad(23.4397);
  const raOf = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
  const decOf = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
  function moonState(ms, lat, lon) {
    const d = ms / 86400000 + 2440587.5 - 2451545;
    const Ms = rad(357.5291 + 0.98560028 * d);
    const Ls = Ms + rad(1.9148 * Math.sin(Ms) + 0.02 * Math.sin(2 * Ms) + 0.0003 * Math.sin(3 * Ms)) + rad(102.9372) + Math.PI;
    const sDec = decOf(Ls, 0), sRa = raOf(Ls, 0);
    const L = rad(218.316 + 13.176396 * d), M = rad(134.963 + 13.064993 * d), F = rad(93.272 + 13.22935 * d);
    const l = L + rad(6.289) * Math.sin(M), b = rad(5.128) * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
    const mRa = raOf(l, b), mDec = decOf(l, b);
    const H = rad(280.16 + 360.9856235 * d) + rad(lon) - mRa, phi = rad(lat);
    const alt = deg(Math.asin(Math.sin(phi) * Math.sin(mDec) + Math.cos(phi) * Math.cos(mDec) * Math.cos(H)));
    const el = Math.acos(Math.sin(sDec) * Math.sin(mDec) + Math.cos(sDec) * Math.cos(mDec) * Math.cos(sRa - mRa));
    const inc = Math.atan2(149598000 * Math.sin(el), dist - 149598000 * Math.cos(el));
    const illum = (1 + Math.cos(inc)) / 2;
    /* Mondlicht am Himmel: 0 = keins, 1 = heller Mond hoch am Himmel */
    const light = alt <= -1 ? 0 : illum * Math.min(1, 0.4 + Math.max(0, alt) / 30);
    return { alt, illum, light };
  }
  /* Heller Mond überstrahlt schwaches Polarlicht (bis −30 %), starkes kaum */
  const moonFactor = (light, pa) => 1 - 0.3 * light * (1 - Math.max(0, Math.min(1, (pa - 0.6) / 0.35)));

  /* ---------- Polarlicht-Aktivität ---------- */
  /* Faustregel: Chance auf sichtbares Polarlicht bei klarem, dunklem Himmel.
     Kalibriert an der FMI-Statistik (bei 69° N in etwa 3 von 4 klaren Nächten Polarlicht, typischer Kp 1–2). */
  function kpToP(kp, lat) {
    const k50 = 0.6 + (69 - lat) * 0.75;
    return 0.95 / (1 + Math.exp(-(kp - k50) / 0.8)); /* nie ganz sicher */
  }
  /* Tageszeit: In Finnisch-Lappland ist Polarlicht um die magnetische Mitternacht (etwa 23:30 Uhr Ortszeit) am häufigsten,
     am frühen Abend und am Morgen seltener. Kp ist ein weltweiter Index ohne Tageszeit, deshalb dieser Faktor (0,65 bis 1). */
  function nightFactor(ms) {
    const l = local(ms);
    let dh = Math.abs(l.h + l.min / 60 - 23.5); if (dh > 12) dh = 24 - dh;
    return 0.65 + 0.35 * Math.exp(-((dh / 3.2) ** 2));
  }
  function parseKp(rows) {
    const out = [];
    (rows || []).forEach((r, i) => {
      if (Array.isArray(r)) { if (i === 0) return; out.push({ t: Date.parse(r[0].replace(' ', 'T') + 'Z'), kp: +r[1], kind: r[2] }); }
      else if (r && r.time_tag) out.push({ t: Date.parse(r.time_tag + (/Z$/.test(r.time_tag) ? '' : 'Z')), kp: +r.kp, kind: r.observed });
    });
    return out.filter(r => isFinite(r.t) && isFinite(r.kp)).sort((a, b) => a.t - b.t);
  }
  function kpAt(kp, ms) {
    let v = null;
    for (const r of kp) { if (r.t <= ms) v = r; else break; }
    return v ? v.kp : (kp.length ? kp[kp.length - 1].kp : 2);
  }
  /* OVATION auf Nordeuropa reduzieren (spart Speicher und lässt sich offline zwischenspeichern) */
  function reduceOvation(json) {
    const grid = {};
    (json.coordinates || []).forEach(([lo, la, v]) => { if (la >= 60 && la <= 80 && (lo >= 5 && lo <= 40)) grid[lo + ',' + la] = v; });
    return { grid, obs: Date.parse(json['Observation Time']), valid: Date.parse(json['Forecast Time']) };
  }
  /* Höchster Wert über und nördlich vom Spot: Polarlicht im Norden sieht man auch tief am Horizont */
  function ovationNear(ov, lat, lon) {
    if (!ov || !ov.grid) return null;
    let best = 0;
    for (let la = Math.round(lat); la <= Math.round(lat) + 4; la++) for (let lo = Math.round(lon) - 2; lo <= Math.round(lon) + 2; lo++) {
      const v = ov.grid[lo + ',' + la]; if (v > best) best = v;
    }
    return best;
  }
  const ovationFloor = v => v >= 35 ? 0.92 : v >= 20 ? 0.8 : v >= 12 ? 0.65 : 0;
  /* Stark südlicher Sonnenwind (Bz) kündigt Aktivität in den nächsten 1–2 Stunden an */
  const bzBoost = bz => bz == null ? 0 : bz <= -10 ? 1.5 : bz <= -5 ? 0.7 : 0;

  /* ---------- Wolken ---------- */
  const CLEAR_TOTAL = 40;                           /* Ensemble: unter 40 % Gesamtbewölkung gilt als klar genug */
  const RELIABLE = 0.92;                            /* Abschlag für Eisnebel und tiefe Wolken, die die Modelle oft übersehen */
  const effCloud = (lo, mi, hi) => Math.min(100, Math.max(lo || 0, mi || 0) + 0.25 * (hi || 0)); /* dünne hohe Wolken stören wenig */
  const detClear = eff => Math.max(0, Math.min(1, (70 - eff) / 45));
  function timeIndex(times) { const m = new Map(); (times || []).forEach((t, i) => m.set(Date.parse(t + 'Z'), i)); return m; }

  /* ---------- Bewertung ---------- */
  /* det/ens: Open-Meteo-Antworten (ein Eintrag je Ort, Reihenfolge wie locs), Zeiten in GMT */
  function evaluate(o) {
    const { locs, det, ens, kp, ov, bz, now, win } = o;
    const hours = [];
    for (let t = win.start; t <= win.end; t += HOUR) hours.push(t);
    return locs.map((loc, i) => {
      const D = det && det[i] && det[i].hourly, E = ens && ens[i] && ens[i].hourly;
      const di = D ? timeIndex(D.time) : null, ei = E ? timeIndex(E.time) : null;
      /* alle Läufe aller Ensemble-Modelle (ECMWF und ICON), Kontrolllauf eingeschlossen */
      const memberKeys = E ? Object.keys(E).filter(k => k.startsWith('cloud_cover')) : [];
      const ob = o.obs && o.obs[i];
      const f0 = 0.6 + 0.1 * ((loc.n || 1) - 1) + 0.1 * ((loc.d || 1) - 1);
      let kpMax = 0;
      const rows = hours.map(t => {
        const dark = darkness(sunAlt(t + 30 * 60e3, loc.lat, loc.lon));
        /* Wie nah ist die Stunde an „jetzt“? 0 = laufende Stunde, 1 = nächste, 2 = übernächste */
        const lead = t <= now && now < t + HOUR ? 0 : t > now ? Math.ceil((t - now) / HOUR) : -1;
        let k = kpAt(kp, t);
        /* Gemessener Kp schlägt die Prognose, solange er frisch ist */
        /* Innerhalb der L1-Vorwarnzeit (ca. 1 Stunde) zählt fast nur, was gerade gemessen wird */
        if (o.kpNow && now - o.kpNow.t < 30 * 60e3 && lead >= 0 && lead <= 2) { const w = [0.9, 0.7, 0.3][lead]; k = w * o.kpNow.kp + (1 - w) * k; }
        if (t < now + 2 * HOUR) k += bzBoost(bz);
        kpMax = Math.max(kpMax, k);
        let pa = kpToP(k, loc.lat) * nightFactor(t + 30 * 60e3);
        let ovv = null;
        if (ov && isFinite(ov.valid) && t <= ov.valid + 30 * 60e3) { ovv = ovationNear(ov, loc.lat, loc.lon); pa = Math.max(pa, ovationFloor(ovv)); }
        /* Lokale Magnetometer (FMI-R-Index) sind die beste Aussage über „jetzt“ */
        if (o.actNow && now - o.actNow.t < 20 * 60e3 && lead >= 0 && lead <= 1) { const w = [0.7, 0.35][lead]; pa = (1 - w) * pa + w * o.actNow.p; }
        let dc = null, eff = null, temp = null, feels = null, wind = null, snow = null, gust = null;
        if (di && di.has(t)) {
          const j = di.get(t); eff = effCloud(D.cloud_cover_low[j], D.cloud_cover_mid[j], D.cloud_cover_high[j]); dc = detClear(eff);
          if (D.temperature_2m) temp = D.temperature_2m[j];
          if (D.apparent_temperature) feels = D.apparent_temperature[j];
          if (D.wind_speed_10m) wind = D.wind_speed_10m[j];
          if (D.snowfall) snow = D.snowfall[j];
          if (D.wind_gusts_10m) gust = D.wind_gusts_10m[j];
        }
        /* Beobachtung der nächsten Wetterstation zieht die erste und zweite Stunde Richtung Wirklichkeit */
        const w = ob && now - ob.t < 75 * 60e3 ? (t <= now && now < t + HOUR ? 0.5 : t > now && t <= now + HOUR ? 0.25 : 0) : 0;
        let members = null, ec = null;
        if (ei && ei.has(t)) {
          const j = ei.get(t);
          members = memberKeys.map(key => { const v = E[key][j]; return v == null ? null : v < CLEAR_TOTAL ? 1 : 0; }).filter(v => v != null);
          if (w) members = members.map(m => (1 - w) * m + w * ob.clear);
          ec = members.length ? members.reduce((a, b) => a + b, 0) / members.length : null;
        }
        if (w && dc != null) dc = (1 - w) * dc + w * ob.clear;
        const pcRaw = ec != null && dc != null ? 0.6 * ec + 0.4 * dc : ec != null ? ec : dc;
        const pc = pcRaw == null ? null : pcRaw * RELIABLE;
        const moon = moonState(t + 30 * 60e3, loc.lat, loc.lon), mf = moonFactor(moon.light, pa);
        return { t, dark, kp: k, pa, ov: ovv, eff, dc, ec, members, pc, obsW: w, temp, feels, wind, snow, gust, moon, mf, c: pc == null ? null : pc * pa * dark * mf };
      });
      const fEff = f0 + (1 - f0) * Math.max(0, Math.min(1, (kpMax - 3) / 3));
      const darkRows = rows.filter(r => r.dark > 0);
      const noData = rows.every(r => r.pc == null);
      let cEns = null, cDet = null, clearEns = null;
      if (darkRows.length && darkRows.some(r => r.members)) {
        const nMem = Math.max(...darkRows.map(r => r.members ? r.members.length : 0));
        let sum = 0, anyClear = 0;
        for (let m = 0; m < nMem; m++) {
          let best = 0, clr = 0;
          darkRows.forEach(r => { if (r.members && r.members[m] != null) { best = Math.max(best, r.members[m] * r.pa * r.dark * r.mf); clr = Math.max(clr, r.members[m]); } });
          sum += best; anyClear += clr;
        }
        cEns = sum / nMem; clearEns = anyClear / nMem;
      }
      if (darkRows.some(r => r.dc != null)) cDet = Math.max(...darkRows.map(r => r.dc != null ? r.dc * r.pa * r.dark * r.mf : 0));
      const detMaxClear = darkRows.some(r => r.dc != null) ? Math.max(...darkRows.map(r => r.dc != null ? r.dc : 0)) : null;
      const blend = (a, b) => a != null && b != null ? 0.6 * a + 0.4 * b : a != null ? a : b;
      const chanceRaw = blend(cEns, cDet);
      const chance = chanceRaw == null ? null : chanceRaw * RELIABLE * fEff;
      const pClearRaw = blend(clearEns, detMaxClear);
      const pClear = pClearRaw == null ? null : pClearRaw * RELIABLE;
      const pAur = darkRows.length ? Math.max(...darkRows.map(r => r.pa)) : 0;
      const best = rows.reduce((b, r) => (r.c != null && (!b || r.c > b.c) ? r : b), null);
      /* Kälte: tiefste Temperatur und tiefste gefühlte Temperatur im Fenster */
      const temps = rows.filter(r => r.temp != null), feelsR = rows.filter(r => r.feels != null);
      const tMin = temps.length ? Math.min(...temps.map(r => r.temp)) : null;
      const feelsMin = feelsR.length ? Math.min(...feelsR.map(r => r.feels)) : null;
      return { loc, rows, chance, pClear, pAur, f: fEff, best: best && best.c > 0 ? best : null, dark: darkRows.length > 0, noData, tMin, feelsMin, tFirst: temps.length ? temps[0].temp : null };
    });
  }

  /* Empfehlung: lohnt sich der Weg gegenüber dem Platz vor der Tür?
     Ein anderer Spot muss um 3 Punkte plus 1,2 Punkte je 10 Minuten zusätzlichem Weg besser sein.
     Fernziele (far) kommen nur in Frage, wenn sie auch die beste Wahl in der Nähe so deutlich schlagen.
     opts.near: Fernziele ganz weglassen (Wecker: für eine lange Fahrt ist es dann zu spät).
     Rückgabe: target = Ziel, home = vor der Tür, best = Ziel bei „fahren“, sonst die stärkste Alternative. */
  const gainNeeded = (a, ref) => 0.03 + 0.0012 * Math.max(0, (a.loc.min || 0) - (ref.loc.min || 0));
  function recommend(results, opts) {
    opts = opts || {};
    const pool = results.filter(r => !r.loc.noRec && !(opts.near && r.loc.far));
    if (!pool.length) return null;
    const near = pool.filter(r => !r.loc.far);
    const home = (near.length ? near : pool).reduce((a, b) => ((a.loc.min || 0) <= (b.loc.min || 0) ? a : b));
    if (!results.some(r => r.dark)) return { target: home, best: home, home, near: home, verdict: 'hell', far: false };
    const ok = pool.filter(r => r.chance != null);
    if (!ok.length) return null;
    const ch = r => (r.chance == null ? 0 : r.chance);
    const score = r => ch(r) - (r.loc.min || 0) * 0.0012;
    const argmax = (list, f) => list.reduce((a, b) => (a == null || f(b) > f(a) ? b : a), null);
    /* beste Wahl in der Nähe */
    const nearOk = ok.filter(r => !r.loc.far);
    let target = home;
    const bestNear = argmax(nearOk, score);
    if (bestNear && bestNear !== home && ch(bestNear) - ch(home) >= gainNeeded(bestNear, home)) target = bestNear;
    const nearTarget = target;
    /* Wolkenloch-Finder: deutlich besser weiter weg? */
    const bestFar = argmax(ok.filter(r => r.loc.far), score);
    if (bestFar && ch(bestFar) - ch(nearTarget) >= gainNeeded(bestFar, nearTarget)) target = bestFar;
    let verdict;
    if (ch(target) < 0.08) { verdict = 'schlecht'; target = home; }
    else verdict = target === home ? 'bleiben' : 'fahren';
    const alt = argmax(ok.filter(r => r !== home), score);
    return { target, home, near: nearTarget, best: verdict === 'fahren' ? target : alt || home, verdict, far: verdict === 'fahren' && !!target.loc.far };
  }

  const haversineKm = (a, b) => {
    const R = 6371, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  /* ---------- Klartext ---------- */
  /* Weg zum Spot in Worten */
  const VERBS = { 'zu Fuß': 'zu Fuß', 'Auto': 'mit dem Auto', 'Taxi': 'mit dem Taxi' };
  const howText = l => !l.min ? 'direkt vor der Tür' : (l.min >= 60 ? Math.floor(l.min / 60) + ' Std. ' + (l.min % 60 ? (l.min % 60) + ' Min.' : '') : l.min + ' Min.').trim() + ' ' + (VERBS[l.how] || l.how || '');
  const mapsUrl = l => 'https://www.google.com/maps/dir/?api=1&destination=' + l.lat + ',' + l.lon;
  /* Zusammenhängendes gutes Zeitfenster um die beste Stunde (mindestens 80 % der besten Chance) */
  function goodSpan(r) {
    if (!r || !r.best) return null;
    const i = r.rows.indexOf(r.best), lim = r.best.c * 0.8;
    let a = i, b = i;
    while (a > 0 && r.rows[a - 1].c != null && r.rows[a - 1].c >= lim) a--;
    while (b < r.rows.length - 1 && r.rows[b + 1].c != null && r.rows[b + 1].c >= lim) b++;
    return { from: r.rows[a].t, to: r.rows[b].t + HOUR };
  }
  /* Ampel für die Chance */
  function level(ch) {
    if (ch == null) return { key: 'none', word: 'Keine Daten', short: '–' };
    if (ch >= 0.55) return { key: 'gut', word: 'Gute Chance', short: 'gut' };
    if (ch >= 0.3) return { key: 'mittel', word: 'Mittlere Chance', short: 'mittel' };
    if (ch >= 0.1) return { key: 'klein', word: 'Kleine Chance', short: 'klein' };
    return { key: 'nein', word: 'Kaum Chance', short: 'kaum' };
  }
  const skyWord = p => p == null ? 'unbekannt' : p >= 0.8 ? 'fast sicher klar' : p >= 0.6 ? 'meist klar' : p >= 0.35 ? 'wechselhaft' : 'wahrscheinlich bewölkt';
  const auroraWord = p => p >= 0.9 ? 'stark, auch direkt über euch möglich' : p >= 0.6 ? 'aktiv, gut sichtbar' : p >= 0.35 ? 'ruhig, schwaches Licht im Norden möglich' : 'sehr ruhig';
  /* Kleidung nach gefühlter Temperatur */
  function coldAdvice(feels) {
    if (feels == null) return '';
    if (feels <= -30) return 'Extrem kalt: höchstens 20–30 Minuten still stehen, Nase und Finger auf weiße Flecken prüfen.';
    if (feels <= -20) return 'Sehr kalt: alle Schichten, Gesicht schützen, Handwärmer und Thermoskanne mitnehmen.';
    if (feels <= -10) return 'Kalt: dicke Jacke, Mütze, Fäustlinge, warme Schuhe.';
    return 'Für Lappland mild: normale Winterkleidung reicht.';
  }

  /* ---------- Weitere Quellen ---------- */
  /* NOAA geschätzter Kp der letzten Minuten: Mittel der letzten 30 Werte */
  function parseKpNow(rows) {
    const r = (rows || []).filter(x => x && isFinite(x.estimated_kp)).slice(-30);
    if (!r.length) return null;
    return { kp: r.reduce((a, b) => a + b.estimated_kp, 0) / r.length, t: Date.parse(r[r.length - 1].time_tag + 'Z') };
  }
  /* FMI-R-Index: Schwellen je Station (gelb = 50 % Chance auf schwaches, rot = 50 % auf starkes Polarlicht), Stand 25.11.2026 */
  const RINDEX_THRESH = { Kevo: [55, 165], 'Kilpisjärvi': [61, 210], Ivalo: [72, 275], Muonio: [75, 300], Pello: [73, 285] };
  /* R relativ zur gelben Schwelle in eine Chance auf sichtbares Polarlicht umrechnen: 50 % an der Schwelle */
  const rIndexToP = (r, name) => { const th = RINDEX_THRESH[name]; if (!th || !isFinite(r)) return null; const q = Math.max(0.05, r / th[0]); return 1 / (1 + Math.pow(1 / q, 1.2)); };
  /* FMI-Wetterstationen: Gesamtbewölkung n_man in Achteln, neuester Wert je Station */
  function parseFmiObs(xml) {
    const re = /<gml:pos>([\d.]+) ([\d.]+) <\/gml:pos>[\s\S]*?<BsWfs:Time>([^<]+)<\/BsWfs:Time>[\s\S]*?<BsWfs:ParameterValue>([^<]+)</g;
    const st = {}; let m;
    while ((m = re.exec(xml))) {
      const n = parseFloat(m[4]); if (!isFinite(n)) continue;
      const k = m[1] + ',' + m[2], t = Date.parse(m[3]);
      if (!st[k] || st[k].t < t) st[k] = { lat: +m[1], lon: +m[2], t, n };
    }
    return Object.values(st);
  }
  /* 0–2 Achtel klar, 6–8 Achtel zu */
  const obsClear = n => Math.max(0, Math.min(1, (6 - n) / 4));
  function nearestObs(stations, lat, lon, maxKm) {
    let best = null;
    (stations || []).forEach(s => { const km = haversineKm({ lat, lon }, s); if (km <= (maxKm || 40) && (!best || km < best.km)) best = Object.assign({}, s, { km, clear: obsClear(s.n) }); });
    return best;
  }
  /* ---------- Rückblick: gemessene Werte vergangener Nächte ---------- */
  /* FMI „multipointcoverage“ (kompaktes Format): Stationen mit Namen und stündlichen Werten je Parameter */
  function parseFmiSeries(xml) {
    const s = String(xml || ''), names = {}; let m;
    const reP = /<gml:Point gml:id="point-\d+"[^>]*>\s*<gml:name>([^<]+)<\/gml:name>\s*<gml:pos>([\d.]+) ([\d.]+)/g;
    while ((m = reP.exec(s))) names[(+m[2]).toFixed(4) + ',' + (+m[3]).toFixed(4)] = m[1];
    const fields = [...s.matchAll(/<swe:field name="([^"]+)"/g)].map(x => x[1]);
    const list = re => ((s.match(re) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
    const pos = list(/<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/), val = list(/<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/);
    const st = {};
    for (let i = 0; i * 3 + 2 < pos.length; i++) {
      const lat = +pos[i * 3], lon = +pos[i * 3 + 1], t = +pos[i * 3 + 2] * 1000, k = lat.toFixed(4) + ',' + lon.toFixed(4);
      const o = st[k] || (st[k] = { name: names[k] || 'Wetterstation', lat, lon, v: {} });
      fields.forEach((f, j) => { const x = parseFloat(val[i * fields.length + j]); if (isFinite(x)) (o.v[f] || (o.v[f] = {}))[t] = x; });
    }
    return Object.values(st);
  }
  /* Wie gut wäre eine vergangene Nacht gewesen? Gemessene Wolken und Temperatur der nächsten Station
     mit Bewölkungsmessung, gemessener Kp, Sonne und Mond. win wie bei windowFor. */
  function hindsight(o) {
    const { stations, kp, lat, lon, win } = o;
    const st = (stations || []).filter(s => s.v && s.v.n_man).map(s => Object.assign({}, s, { km: haversineKm({ lat, lon }, s) })).sort((a, b) => a.km - b.km)[0];
    if (!st || st.km > 70) return { station: null, rows: [], best: null, chance: null };
    /* Wert für die Stunde t…t+1: Mittel der Messungen zu Beginn und Ende */
    const at = (p, t) => { const s2 = st.v[p] || {}, a = s2[t], b = s2[t + HOUR]; return a != null && b != null ? (a + b) / 2 : a != null ? a : b != null ? b : null; };
    const rows = [];
    for (let t = win.start; t < win.end; t += HOUR) {
      const mid = t + 30 * 60e3, dark = darkness(sunAlt(mid, lat, lon));
      const n = at('n_man', t), temp = at('t2m', t), k = kp && kp.length ? kpAt(kp, mid) : null, pa = k == null ? 0 : kpToP(k, lat) * nightFactor(mid);
      const clear = n == null ? null : obsClear(n), moon = moonState(mid, lat, lon), mf = moonFactor(moon.light, pa);
      rows.push({ t, n, temp, kp: k, pa, dark, clear, moon, c: clear == null || k == null ? null : clear * pa * dark * mf });
    }
    const ok = rows.filter(r => r.c != null);
    const best = ok.reduce((b, r) => (!b || r.c > b.c ? r : b), null);
    const darkRows = rows.filter(r => r.dark > 0);
    const clearRows = darkRows.filter(r => r.clear != null && r.clear >= 0.75);
    const temps = rows.filter(r => r.temp != null).map(r => r.temp);
    return {
      station: st, rows, best: best && best.c > 0 ? best : null, chance: ok.length ? (best ? best.c : 0) : null,
      clearFrom: clearRows.length ? clearRows[0].t : null, clearTo: clearRows.length ? clearRows[clearRows.length - 1].t + HOUR : null,
      clearShare: darkRows.filter(r => r.clear != null).length ? clearRows.length / darkRows.filter(r => r.clear != null).length : null,
      kpMax: darkRows.some(r => r.kp != null) ? Math.max(...darkRows.filter(r => r.kp != null).map(r => r.kp)) : null,
      tMin: temps.length ? Math.min(...temps) : null
    };
  }
  /* Mond in Worten */
  function moonWord(m) {
    if (!m) return { cls: '', text: 'unbekannt' };
    if (m.alt <= -1) return { cls: 'ok', text: 'nicht am Himmel, ideal' };
    const p = Math.round(m.illum * 100);
    const phase = m.illum >= 0.95 ? 'Vollmond' : m.illum >= 0.6 ? 'fast voll' : m.illum >= 0.35 ? 'Halbmond' : 'schmale Sichel';
    const effect = m.light < 0.3 ? 'stört kaum' : m.light < 0.6 ? 'stört etwas' : 'überstrahlt schwaches Polarlicht';
    return { cls: m.light < 0.3 ? 'ok' : 'mid', text: phase + ' (' + p + ' %), ' + (m.alt < 10 ? 'tief, ' : '') + effect };
  }

  /* ---------- Unterwegs: Fahrplan, Wetter auf dem Weg, Straßenzustand ---------- */
  /* Für längere Wege: wann losfahren, um zur guten Zeit dort zu sein, und wann man zurück ist.
     Schneefall (cm/h) und Böen (km/h) am Ziel und an der Unterkunft in dieser Zeit. */
  function tripPlan(r, homeRes) {
    const sp = goodSpan(r);
    if (!sp || !r.loc.min) return null;
    const go = sp.from - r.loc.min * 60e3, back = sp.to + r.loc.min * 60e3;
    const within = res => (res ? res.rows : []).filter(x => x.t + HOUR > go && x.t < back);
    const rows = within(r).concat(homeRes && homeRes !== r ? within(homeRes) : []);
    const mx = k => rows.reduce((a, x) => (x[k] != null && x[k] > a ? x[k] : a), 0);
    return { from: sp.from, to: sp.to, go, back, snow: mx('snow'), gust: mx('gust') };
  }
  /* Straßenwetter-Prognose von Fintraffic (Digitraffic, forecast-sections): schlechtester Zustand im Zeitraum.
     0 = normal, 1 = schlecht (glatt, im Lapplandwinter üblich), 2 = sehr schlecht. null = keine Angabe */
  const ROAD_RANK = { NORMAL_CONDITION: 0, POOR_CONDITION: 1, EXTREMELY_POOR_CONDITION: 2 };
  function roadWorst(json, from, to) {
    let worst = null, slippery = false;
    ((json && json.forecastSections) || []).forEach(sec => (sec.forecasts || []).forEach(f => {
      const t = Date.parse(f.time);
      if (!isFinite(t) || t < from - 2 * HOUR || t > to) return;
      const k = ROAD_RANK[f.overallRoadCondition];
      if (k != null && (worst == null || k > worst)) worst = k;
      const fr = f.forecastConditionReason && f.forecastConditionReason.frictionCondition;
      if (fr === 'VERY_SLIPPERY') slippery = true;
    }));
    return worst == null ? null : { worst, verySlippery: slippery };
  }
  /* Rechteck um zwei Orte für die Straßenabfrage (etwas Rand dazu) */
  const corridor = (a, b) => ({ xMin: Math.min(a.lon, b.lon) - 0.15, yMin: Math.min(a.lat, b.lat) - 0.08, xMax: Math.max(a.lon, b.lon) + 0.15, yMax: Math.max(a.lat, b.lat) + 0.08 });

  /* ---------- Magnetometer-Status vom Push-Wecker (ntfy-Thema + "-status") ---------- */
  /* Der Wecker schickt alle 10 Minuten eine stille Meldung mit den FMI-R-Index-Werten. Neueste gültige zurückgeben. */
  function parseStatus(txt) {
    let best = null;
    String(txt || '').split(/\r?\n/).forEach(l => {
      try {
        const j = JSON.parse(l); if (!j || j.event !== 'message') return;
        const m = JSON.parse(j.message); if (!m || m.v !== 1 || !isFinite(m.t)) return;
        if (!best || m.t > best.t) best = { t: m.t, base: m.base, p: isFinite(m.p) ? m.p : null, fmi: (m.fmi || []).map(x => ({ name: x[0], label: x[1], r: x[2], km: x[3] })) };
      } catch (e) { /* keine Statusmeldung */ }
    });
    return best;
  }
  const fmiWord = label => ({ 'No activity': 'ruhig', 'Medium activity': 'aktiv', 'High activity': 'stark aktiv' }[label] || label);

  /* NOAA 27-Tage-Ausblick: Datum, Ap, größter Kp */
  const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
  function parse27(txt) {
    const out = [];
    String(txt || '').split('\n').forEach(l => { const m = l.match(/^(\d{4}) (\w{3}) (\d{2})\s+(\d+)\s+(\d+)\s+(\d+)/); if (m && MON[m[2]]) out.push({ date: m[1] + '-' + MON[m[2]] + '-' + m[3], ap: +m[5], kp: +m[6] }); });
    return out;
  }
  /* NOAA 3-Tage-Vorhersage: Begründung zur Geomagnetik und Sturm-Wahrscheinlichkeiten */
  function parse3day(txt) {
    const s = String(txt || '');
    const a = s.split(/B\. NOAA Solar Radiation/)[0];
    const r = a.match(/Rationale:\s*([\s\S]*?)(\n\s*\n|$)/);
    const issued = (s.match(/:Issued:\s*([^\n]+)/) || [])[1] || '';
    return { rationale: r ? r[1].replace(/\s+/g, ' ').trim() : '', issued: issued.trim() };
  }

  root.Radar = { TZ, HOUR, BASES, SPOTS, TRIP, local, localTime, baseForToday, windowFor, clampWindow, dayState, nightFactor, howText, mapsUrl, goodSpan, sunAlt, darkness, kpToP, parseKp, kpAt, reduceOvation, ovationNear, evaluate, recommend, haversineKm, effCloud, detClear, parseFmiObs, nearestObs, obsClear, parse27, parse3day, parseKpNow, RINDEX_THRESH, rIndexToP, level, skyWord, auroraWord, coldAdvice, moonState, moonFactor, moonWord, parseFmiSeries, hindsight, tripPlan, roadWorst, corridor, parseStatus, fmiWord };
})(typeof window !== 'undefined' ? window : globalThis);
