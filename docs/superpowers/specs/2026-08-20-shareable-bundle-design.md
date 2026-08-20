# Weitergabe-Paket (Bundle) — Design

**Datum:** 2026-08-20
**Status:** freigegeben, bereit für Implementierungsplan
**Baut auf:** `2026-08-19-gws-connect-design.md`

---

## 1. Zweck

Ein ZIP-Archiv, das eine nicht-technische Empfängerin auspackt, Claude Code darin
öffnet und mit einem Satz startet:

> „Richte das hier für mich ein."

Alles, was zum Laufen nötig ist, liegt im Archiv. Es wird nichts installiert, es
werden keine Administratorrechte gebraucht, und der erste Start funktioniert auch
hinter einer restriktiven IT-Richtlinie.

**Nicht-Ziele:** Linux-Pakete; ein Installer (`.msi`, `.pkg`); Signierung/Notarisierung;
automatische Aktualisierung eines bereits ausgelieferten Pakets.

---

## 2. Was wirklich gebraucht wird

Erhoben am 2026-08-20 durch Prüfung von `package.json`, `src/core/env.mjs` und
des npm-Pakets `@googleworkspace/cli`:

| Bestandteil | Nötig? | Anmerkung |
|---|---|---|
| Node.js ≥ 20 | **ja** | einzige Laufzeitanforderung des Werkzeugs |
| `gws` (Google Workspace CLI) | **ja** | externes Rust-Binary |
| npm-Abhängigkeiten | **nein** | `gws-connect` hat keine, nur Node-Standardbibliothek |
| npm selbst | **nein** | wird nur zum Installieren von `gws` gebraucht — entfällt, da mitgeliefert |
| git | **nein** | nur zum Klonen; im ZIP gegenstandslos |
| Browser | ja | für die Google-Anmeldung, auf jedem Zielgerät vorhanden |
| Einrichtungs-Code | ja | reist **getrennt**, siehe Abschnitt 6 |

`@googleworkspace/cli` ist ein 10-KB-Wrapper: `install.js` lädt das
plattformspezifische Binary aus den GitHub-Releases und prüft es gegen `.sha256`.
Damit lässt sich `gws` direkt ins Paket legen — ohne npm, ohne Netz zur Laufzeit.

---

## 3. Festgelegte Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| 1 | Laufzeit wird mitgeliefert (Node **und** `gws`) | Die Node-Installation ist der Schritt, der am ehesten an fehlenden Rechten scheitert. Ein mitgeliefertes Binary umgeht ihn vollständig. |
| 2 | Ein Paket je Plattform | Ein mitgeliefertes Binary ist zwangsläufig plattformspezifisch. Start: `win-x64`, `mac-arm64`. |
| 3 | Der Einrichtungs-Code liegt **nicht** im Paket | Der Code *ist* das Geheimnis. Ein Paket mit Code darin wäre selbst das Geheimnis, ohne Widerrufsmöglichkeit. |
| 4 | Node **22.23.2** (LTS „Jod") fest verdrahtet | Ein Neubau in sechs Monaten muss dasselbe Ergebnis liefern. `--node-version` überschreibt. |
| 5 | `gws` **0.22.5** fest verdrahtet | Gleiche Begründung. `--gws-version` überschreibt. |
| 6 | npm wird aus der Node-Distribution entfernt | Wird nie gebraucht. Spart ~2,5 MB — wenig, aber es entfernt auch einen Weg, versehentlich etwas zu installieren. |
| 7 | Beide Downloads werden gegen Prüfsummen geprüft | Derselbe Maßstab, den `install.js` von `gws` selbst anlegt. Abweichung bricht den Bau ab. |

---

## 4. Aufbau des Pakets

```
gws-connect-win-x64/
├─ START-HIER.cmd            Doppelklick, deutsch + englisch
├─ CLAUDE.md                 die Anleitung für Claude Code
├─ LIESMICH.txt              drei Zeilen: auspacken, Claude Code öffnen, Satz sagen
├─ runtime/
│  ├─ node/node.exe          mitgeliefert, ohne npm
│  └─ gws/gws.exe            mitgeliefert, beim Bau prüfsummengeprüft
├─ bin/  src/  locales/  skills/  package.json
└─ docs/de/  docs/en/
```

macOS entsprechend: `START-HIER.command`, `runtime/node/bin/node`, `runtime/gws/gws`,
beide mit Modus `0755`.

**Größe** (gemessen, nicht geschätzt): `node.exe` allein komprimiert 31,5 MB,
`gws` 5,6 MB, Rest ~250 KB → **~38 MB je Paket**. Zu groß für E-Mail-Anhänge,
unproblematisch über einen Freigabelink.

---

## 5. Bauwerkzeug — `tools/make-bundle.mjs`

Wird vom Betreiber ausgeführt, braucht Netz. Eigenständiges Skript in der Art von
`tools/make-setup-code.mjs`, importiert aus `src/`, damit nichts auseinanderläuft.

```
node tools/make-bundle.mjs --platform win-x64
node tools/make-bundle.mjs --platform mac-arm64
node tools/make-bundle.mjs --all
```

Ablauf je Plattform:

1. Ziel auflösen — `win-x64` → `x86_64-pc-windows-msvc` / `node-…-win-x64.zip`,
   `mac-arm64` → `aarch64-apple-darwin` / `node-…-darwin-arm64.tar.gz`.
2. Node laden von `nodejs.org/dist/v<ver>/`, prüfen gegen die `SHASUMS256.txt`
   desselben Verzeichnisses. Nur die Binärdatei übernehmen.
3. `gws` laden von `github.com/googleworkspace/cli/releases/download/v<ver>/`,
   prüfen gegen `<artefakt>.sha256`. Nur die Binärdatei übernehmen.
4. Nutzlast kopieren: `bin/`, `src/`, `locales/`, `skills/`, `docs/`, `package.json`, `README.md`.
5. Paketdateien schreiben: `CLAUDE.md`, Starter, `LIESMICH.txt`.
6. Nach `dist/gws-connect-<plattform>.zip` packen.

Fehlerverhalten: Jede Prüfsummenabweichung und jeder fehlgeschlagene Download
bricht mit einer Zeile ab, die sagt, welches Artefakt betroffen ist. Ein halb
gebautes Paket wird nicht zurückgelassen — gebaut wird in einem Temp-Verzeichnis,
das erst nach Erfolg nach `dist/` wandert.

Ein Zwischenspeicher (`.bundle-cache/`, per `.gitignore` ausgeschlossen) verhindert,
dass ein zweiter Bau dieselben 40 MB erneut lädt.

---

## 6. Auslieferung

Zwei Dinge, getrennt:

1. das Paket — beliebiger Kanal, es enthält kein Geheimnis
2. der Einrichtungs-Code — über einen Passwortmanager, wie `docs/*/ANLEITUNG.md`
   es bereits vorschreibt

Claude Code führt die Einrichtung bis zur Eingabeaufforderung und lässt die
Empfängerin dort einfügen.

---

## 7. Notwendige Änderung am Werkzeug

`src/core/gws.mjs:36` beachtet bereits `GWS_CONNECT_GWS_BIN`; der Starter kann die
Variable auf das mitgelieferte Binary setzen. Die **je Konto erzeugten Starter**
(`~/.gws-connect/bin/gws-<id>.cmd`) erben sie jedoch nicht: Sie rufen
`bin/gws-run.mjs`, das ohne gesetzte Variable auf ein blankes `gws` im `PATH`
zurückfällt — das es auf dem Zielgerät nicht gibt.

**Entscheidung:** `wrappers.write()` schreibt `GWS_CONNECT_GWS_BIN` fest in den
erzeugten Starter, wenn die Variable zum Zeitpunkt der Erzeugung gesetzt ist.

Verworfene Alternative: den Pfad in `config.json` ablegen und in `gwsBin()` lesen.
Robuster gegen ein Verschieben des Ordners, zieht aber eine asynchrone Umstellung
durch `launch()`, weil `gwsBin()` synchron ist. Der Vorteil trägt nicht: Die
erzeugten Starter verdrahten mit `process.execPath` und `runnerPath()` bereits
absolute Pfade ins Paket und überleben ein Verschieben ohnehin nicht.

---

## 8. `CLAUDE.md` im Paket

Kurz und in Befehlsform. Inhalt:

- **Nichts installieren.** Laufzeit liegt bei. Kein `npm install`, kein `winget`, kein `brew`.
- Genau diese zwei Pfade benutzen: `runtime/node/node.exe`, `runtime/gws/gws.exe`
  (macOS: `runtime/node/bin/node`, `runtime/gws/gws`).
- Reihenfolge: `doctor` → `setup` → `add`.
- Den Einrichtungs-Code von der Nutzerin erfragen. **Nie** in eine Datei schreiben,
  nie zurück ins Protokoll schreiben, nie in einer Kommandozeile übergeben.
- Sprache aus der Nutzerin ihrer Sprache ableiten, `--lang de|en`.
- Bei Problemen `docs/de/PROBLEME.md` bzw. `docs/en/TROUBLESHOOTING.md` lesen.

---

## 9. Prüfung

| Was | Wie | Wo |
|---|---|---|
| Paketaufbau | Einheitstests gegen die reinen Funktionen (Zielauflösung, Dateiliste, Starter-Inhalt) — ohne Netz | `tests/bundle.test.mjs` |
| Prüfsummenlogik | Test mit absichtlich falscher Summe → Bau bricht ab | `tests/bundle.test.mjs` |
| Starter setzt `GWS_CONNECT_GWS_BIN` | Test gegen `wrappers.write()` mit gesetzter Variable | `tests/wrappers.test.mjs` |
| **win-x64 gesamt** | echt bauen, in ein Temp-Verzeichnis auspacken, `doctor` über die mitgelieferte Laufzeit ausführen | von Hand, auf der Baumaschine |
| **mac-arm64** | baubar und strukturell prüfbar (richtige Binaries, richtige Prüfsummen, Modus 0755) — **auf einer Windows-Maschine nicht ausführbar** | ehrlich als ungetestet ausweisen |

Das macOS-Paket wird erst als getestet bezeichnet, wenn es jemand auf einem Mac
gestartet hat. Bis dahin steht das so im Auslieferungshinweis.

---

## 10. Offene Punkte

- Signierung/Notarisierung für macOS ist nicht vorgesehen. Gatekeeper wird beim
  ersten Start meckern; `Start-Mac.command` beschreibt den Rechtsklick-Weg bereits.
  Falls das Paket breiter verteilt wird, ist Notarisierung nachzuholen.
- Es gibt kein ARM-Windows-Binary von `gws`. Ein `win-arm64`-Paket ist damit
  vorerst nicht baubar; das Bauwerkzeug muss das klar sagen statt zu raten.
