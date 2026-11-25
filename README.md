# Polarlicht-Radar

Eine Web-App für die Lappland-Reise: Sie sagt euch, wo ihr heute Nacht die beste Chance auf Polarlicht habt, ob sich das Fahren lohnt, und weckt euch, wenn es losgeht.

| Datei | Wozu |
|---|---|
| `index.html` | Die App: Ampel-Empfehlung mit Temperatur und Mond, nächste Nächte, Rückblick auf die letzten Nächte (gemessen), Wolken- und Temperaturkarte, Spots, Kamera-Tipps für Pixel 9 Pro und Pixel 8a, Wecker, Sonnensturm-Ausblick |
| `radar-core.js` | Der Rechenkern, den App und Push-Wecker gemeinsam nutzen (auch Mond und Rückblick) |
| `sw.js`, `manifest.webmanifest`, `icon-512.png` | Offline-Modus, Benachrichtigungen, Symbol auf dem Home-Bildschirm |
| `karte-offline.bin`, `karte-offline.json` | Kartenpaket (304 OpenStreetMap-Kacheln, Zoom 7–11 rund um die Unterkünfte). Die App legt es per Knopf „Karte für Funklöcher speichern“ in den Offline-Speicher. © OpenStreetMap-Mitwirkende, ODbL |
| `push/check.mjs` | Push-Wecker: prüft die Lage und schickt eine Nachricht über ntfy |
| `.github/workflows/polarlicht-wecker.yml` | Startet den Push-Wecker abends alle 10 Minuten auf GitHub |

Alle Datenquellen sind kostenlos und brauchen keinen Schlüssel: Open-Meteo (MET Norway, ECMWF, DWD), Finnischer Wetterdienst (FMI), NOAA SWPC, EUMETSAT, OpenStreetMap.

## 1. Online stellen (GitHub Pages, kostenlos)

1. Auf [github.com](https://github.com) ein Konto anlegen und ein neues Repository erstellen, z. B. `polarlicht-radar`, Sichtbarkeit **Public**.
2. Im Repository **Add file → Upload files** und den ganzen Inhalt dieses Ordners hineinziehen, auch die Ordner `push` und `.github`.
   Windows blendet `.github` manchmal aus. Falls er fehlt: **Add file → Create new file**, als Namen `.github/workflows/polarlicht-wecker.yml` eintippen und den Inhalt der Datei hineinkopieren.
3. **Settings → Pages**: Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, speichern.
   Nach 1–2 Minuten läuft die App unter `https://<euer-name>.github.io/polarlicht-radar/`.
4. Die Adresse auf beiden Handys öffnen und „Zum Home-Bildschirm hinzufügen“ wählen. Auf dem iPhone funktionieren Benachrichtigungen nur so.

## 2. Push-Wecker einrichten

Der Wecker in der App klingelt nur, wenn sie offen ist und das Handy am Ladekabel liegt. Der Push-Wecker läuft dagegen auf GitHub und schickt eine Nachricht aufs Handy, auch wenn die App zu ist. Er nutzt zusätzlich den Magnetometer-Index des finnischen Wetterdienstes, den die App im Browser nicht abrufen darf.

1. Die kostenlose App **ntfy** installieren (Android: Play Store, iPhone: App Store).
2. In ntfy auf **+** tippen und ein Thema abonnieren. Der Name ist euer Passwort: lang und zufällig, z. B. `polarlicht-` plus 12 zufällige Zeichen. Beide Handys abonnieren dasselbe Thema.
   - Android: Benachrichtigungen von ntfy erlauben und für „Nicht stören“ freigeben.
   - iPhone: Benachrichtigungen erlauben und als zeitkritisch zulassen.
3. Auf GitHub unter **Settings → Secrets and variables → Actions**:
   - **Secret** `NTFY_TOPIC`: der Themenname aus Schritt 2.
   - **Variable** `SITE_URL`: die Adresse der App aus Teil 1.
   - **Variable** `THRESHOLD` (optional): ab welcher Chance geweckt wird, Standard `0.55`.
   - **Variable** `BASE` (nur zum Testen vor der Reise): `see`, `farm`, `sinetta` oder `koengas`. Vom 03. bis 09.01. wählt der Wecker die Unterkunft selbst nach Datum.
4. Reiter **Actions** öffnen und Workflows erlauben, falls GitHub danach fragt. Dann **Polarlicht-Wecker → Run workflow** mit `test_push = 1`. Nach kurzer Zeit kommt eine Testnachricht.
5. Fertig. Abends von 16 bis 5 Uhr finnischer Zeit prüft der Wecker alle 10 Minuten. Er weckt höchstens alle 90 Minuten einmal.
6. Nach der Reise: **Actions → Polarlicht-Wecker → ··· → Disable workflow**.

**Wann weckt er?** Wenn es dunkel ist und entweder die berechnete Chance für die laufende und die nächste Stunde über der Schwelle liegt, oder wenn die finnischen Magnetometer in eurer Nähe Aktivität melden und der Himmel zu mindestens 50 % klar ist.

## Gut zu wissen

- GitHub startet geplante Läufe manchmal 5–15 Minuten später. Für Polarlicht reicht das meist.
- Geplante Läufe schaltet GitHub ab, wenn ein Repository 60 Tage lang unverändert bleibt. Eingerichtet Ende November reicht das bis nach der Reise.
- Vor der Reise läuft der Wecker zwar jeden Abend an, beendet sich aber sofort, solange keine Variable `BASE` gesetzt ist.
- In einem öffentlichen Repository kann jeder `radar-core.js` lesen, also auch die Lage der Spots und die Reisedaten. Die Unterkünfte sind dort nur neutral benannt. Das ntfy-Thema bleibt als Secret geheim. Wer den Themennamen kennt, kann die Nachrichten mitlesen, also nicht weitergeben.
- GitHub Actions sind für öffentliche Repositories kostenlos.

## Lokal testen

```
DRY_RUN=1 BASE=see node push/check.mjs
```

Die App selbst lässt sich per Doppelklick auf `index.html` im Browser öffnen. Offline-Modus und Benachrichtigungen gibt es nur über die Online-Adresse.
