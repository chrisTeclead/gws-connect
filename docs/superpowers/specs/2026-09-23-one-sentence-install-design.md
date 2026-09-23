# Installation mit einem Satz — Design

**Datum:** 2026-09-23
**Status:** Entwurf, wartet auf Freigabe
**Baut auf:** `2026-08-20-shareable-bundle-design.md`

---

## 1. Zweck

Eine Empfängerin ohne technische Vorkenntnisse, die Claude Code oder Claude Desktop
bereits benutzt, bekommt vom Betreiber zwei Dinge:

1. einen Satz, den sie in Claude einfügt:
   > „Bitte installiere gws-connect für mich:
   > https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md"
2. den Einrichtungs-Code, getrennt, über den Passwortmanager.

Danach passiert alles Weitere durch Claude. Sie tut genau drei Dinge selbst: den Satz
einfügen, den Code in ein **Popup-Fenster** einfügen, sich im Browser bei Google
anmelden.

**Erfolgskriterien**

- kein ZIP, kein Ordner, keine Datei zum Doppelklicken
- keine Sicherheitswarnung (Gatekeeper, SmartScreen) — ohne Signierung
- kein Terminal, in das sie tippen muss
- funktioniert auch noch, nachdem sie ihren Downloads-Ordner aufgeräumt hat
- derselbe Satz für Mac und Windows

**Nicht-Ziele:** Signierung/Notarisierung; `.exe`/`.pkg`/`.dmg`-Installer; eine
grafische Oberfläche über das Popup hinaus; automatische Aktualisierung;
Deinstallation; Claude-Code-Plugin (später möglich, siehe Abschnitt 10).

---

## 2. Warum dieser Weg

Die bisherige Weitergabe (ZIP je Plattform) scheitert bei Anfängern an Stellen,
die mit dem Code nichts zu tun haben:

| Problem | Ursache |
|---|---|
| Doppelklick im noch nicht entpackten ZIP | Windows führt den Starter aus einem Temp-Ordner aus |
| Ordner voller `bin/ src/ locales/ runtime/` | welche Datei ist die richtige? |
| Konten gehen kaputt, wenn der Ordner verschoben/gelöscht wird | `wrappers.write()` verdrahtet `process.execPath` und `runnerPath()` absolut in den Paketordner |
| Gatekeeper auf macOS 15+ | „Rechtsklick → Öffnen" umgeht die Sperre nicht mehr; nur noch Systemeinstellungen → „Trotzdem öffnen" |
| SmartScreen auf Windows | „Weitere Informationen → Trotzdem ausführen" |
| Terminalfenster | wirkt auf Anfänger bedrohlich |
| Intel-Macs | kein `mac-x64`-Paket |

Signierung ist derzeit nicht vorgesehen (kein Budget). Klassische Installer bleiben
auf dem Mac damit an Gatekeeper hängen. Gatekeeper und SmartScreen greifen aber nur
bei Dateien mit Quarantäne-Markierung bzw. „Mark of the Web" — und die setzt der
**Browser**, nicht `curl` oder `Invoke-WebRequest`. Lädt Claude das Paket selbst,
entsteht keine Warnung. Die Empfängerinnen haben Claude ohnehin; es ist das
Werkzeug, für das gws-connect überhaupt existiert.

Verworfen:

- **Klassische Installer** (`.exe` per Inno Setup, `.pkg`): ohne Signierung auf dem
  Mac nicht warnungsfrei. Verfehlt das Ziel.
- **Claude-Code-Plugin** als Hauptweg: Slash-Befehle sind technischer als ein Satz,
  und die Unterstützung in Claude Desktop ist unklar. Kann auf diesem Design
  aufsetzen.

---

## 3. Ablauf aus Sicht der Empfängerin

1. Sie fügt den Satz in Claude ein.
2. Claude ruft `INSTALL.md` ab und führt den dort genannten Befehl für ihr
   Betriebssystem aus. Nichts davon muss sie verstehen.
3. Claude führt `doctor` aus.
4. Claude startet `setup --dialog`. Ein **Popup** erscheint: „Einrichtungs-Code:".
   Sie fügt den Code aus dem Passwortmanager ein, klickt OK.
5. Claude fragt nach ihrer E-Mail-Adresse und führt `add <adresse>` aus. Der Browser
   öffnet sich, sie meldet sich an und bestätigt.
6. Für jedes weitere Konto: Schritt 5.

Aktualisieren heißt: denselben Satz noch einmal einfügen.

---

## 4. Bestandteile

### 4.1 Release-Pipeline — `.github/workflows/release.yml`

Ausgelöst durch einen Tag `v*`.

1. Tests auf `ubuntu-latest` (`npm test`).
2. Bau: `node tools/make-bundle.mjs --all` → `win-x64`, `mac-arm64`, **`mac-x64`** (neu).
3. `SHA256SUMS` über alle ZIPs erzeugen.
4. Echte Installation je Plattform (Abschnitt 7): `macos-14` (arm64), `macos-13` (x64),
   `windows-latest`.
5. Hochladen in das GitHub-Release: die drei ZIPs, `SHA256SUMS`, `install.sh`,
   `install.ps1`, `INSTALL.md`.

`releases/latest/download/<datei>` ist damit eine stabile Adresse. Das Repository
wird öffentlich; es enthält kein Geheimnis (siehe bestehende Designs).

Das Release ist erst sichtbar, wenn alle Installationsläufe grün sind
(Entwurf-Release anlegen, am Ende veröffentlichen).

### 4.2 Neue Plattform `mac-x64`

In `tools/bundle/targets.mjs`: `nodeArch: 'darwin-x64'`, gws-Artefakt
`google-workspace-cli-x86_64-apple-darwin.tar.gz` (am 2026-09-23 für v0.22.5
vorhanden geprüft). Sonst identisch zu `mac-arm64`.

### 4.3 Installationsskripte — `install/install.sh`, `install/install.ps1`

Beide tun dasselbe, in dieser Reihenfolge:

1. Plattform erkennen (`uname -m` bzw. `$env:PROCESSOR_ARCHITECTURE`). `win-arm64`
   → klarer Abbruch mit Satz, wie in `targets.mjs`.
2. `SHA256SUMS` und das passende ZIP aus `releases/latest/download/` laden.
   Basis-URL per `GWS_CONNECT_RELEASE_URL` überschreibbar (für die Tests).
3. Prüfsumme prüfen (`shasum -a 256` bzw. `Get-FileHash`). Abweichung → Abbruch,
   nichts wird verändert.
4. In ein Temp-Verzeichnis neben dem Ziel entpacken, dann **atomar** gegen
   `~/.gws-connect/app/` tauschen (alten Stand erst nach Erfolg löschen).
   `~/.gws-connect/accounts/`, `credentials/`, `config.json`, `secrets.dat` werden
   nicht berührt.
5. macOS: `xattr -dr com.apple.quarantine ~/.gws-connect/app` — Vorsorge, falls der
   Ordner doch einmal über einen Browser kam.
6. Den festen Starter schreiben: `~/.gws-connect/gws-connect` bzw.
   `~/.gws-connect/gws-connect.cmd`. Er setzt `GWS_CONNECT_GWS_BIN` auf das
   mitgelieferte `gws` und ruft das mitgelieferte `node` mit
   `app/bin/gws-connect.mjs`.
7. `relink` ausführen (Abschnitt 4.4).
8. Skill kopieren: `app/skills/gws-konten/` → `~/.claude/skills/gws-konten/`
   (überschreibt eine ältere Fassung).
9. Eine letzte Zeile ausgeben, die Claude sagt, was als Nächstes kommt:
   `installed <version> — next: <starter> doctor`.

Die Skripte laufen ohne Administratorrechte und installieren nichts außerhalb von
`~/.gws-connect/` und `~/.claude/skills/`.

### 4.4 Neuer Befehl `relink`

Schreibt für jedes Konto unter `accounts/` den Starter `bin/gws-<id>` neu, mit der
aktuellen Laufzeit. Nötig, weil die Starter absolute Pfade tragen: Nach einem Update
zeigen sie sonst auf gelöschte Dateien. Macht nichts mit Tokens oder Google.

Nebeneffekt: Das bisherige ZIP-Paket kann `relink` ebenfalls aufrufen, falls jemand
den Ordner verschoben hat.

### 4.5 `setup --dialog`

Neue Option. Statt `ui.ask()` öffnet gws-connect ein natives Eingabefenster:

- **macOS:** `osascript` mit `display dialog "…" default answer "" with hidden answer`
  (Skript per `-e`).
- **Windows:** `powershell -NoProfile -STA -EncodedCommand …` mit einem
  WinForms-Formular, Feld mit `UseSystemPasswordChar`. Das Skript kommt als
  `-EncodedCommand`; es enthält nur die Fenstertexte, nie den Code.

Der Code kommt über die **Standardausgabe des Kindprozesses** zurück zu
gws-connect — nie über eine Kommandozeile, nie in eine Datei, nie in die Ausgabe von
gws-connect. Claude sieht nur „Importiert: <label>" oder die Fehlermeldung.

Abbrechen im Popup → `err.aborted`, Rückgabewert falsch. Fehlerhafter Code
(Prüfsumme usw.) → bisherige Fehlermeldung, und das Popup öffnet sich **ein
weiteres Mal** mit dem Hinweis, den Code vollständig zu kopieren (höchstens drei
Versuche).

Texte zweisprachig über `locales/`, Sprache wie bisher über `--lang`.

Der Baustein, der den Befehl für das Popup zusammensetzt, ist eine reine Funktion
(Plattform + Texte → Programm + stdin), damit er ohne Fenster testbar ist.

### 4.6 `INSTALL.md` — die Anleitung für Claude

Ersetzt inhaltlich die bisher ins Paket geschriebene `CLAUDE.md`. Kurz, Befehlsform:

- Wer du bist: Claude, du richtest das für eine Nicht-Technikerin ein. Erkläre wenig,
  handle.
- Befehl je Betriebssystem:
  - macOS: `curl -fsSL https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.sh | bash`
  - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://github.com/chrisTeclead/gws-connect/releases/latest/download/install.ps1 | iex"`
- Danach nur noch den festen Starter benutzen: `~/.gws-connect/gws-connect`.
- Reihenfolge: `doctor` → `setup --dialog` → nach Adresse fragen → `add <adresse>`.
  Vor `add`: der Nutzerin sagen, sie solle im Browser nichts abbrechen und bei
  „Google hat diese App nicht überprüft" auf „Erweitert → Weiter zu …" gehen.
- Nichts anderes installieren. Kein `npm`, `brew`, `winget`.
- Den Einrichtungs-Code nie erfragen, nie in den Chat holen. Fügt sie ihn trotzdem
  in den Chat ein: sagen, dass er erneuert werden sollte.
- Bei Problemen: `docs/de/PROBLEME.md` / `docs/en/TROUBLESHOOTING.md` unter
  `~/.gws-connect/app/` lesen.

Die Datei liegt im Repository unter `install/INSTALL.md` und wird unverändert ins
Release gelegt. Ein Test stellt sicher, dass die darin genannten URLs und Befehle
mit den Skripten übereinstimmen.

### 4.7 Dokumentation

- `docs/de/ANLEITUNG.md`, `docs/en/GUIDE.md`: auf den neuen Weg umgeschrieben —
  „Satz in Claude einfügen, Code ins Popup, bei Google anmelden". Node-Installation
  und Doppelklick entfallen als Hauptweg.
- Neuer Abschnitt „Ohne Claude": denselben Befehl aus `INSTALL.md` in Terminal bzw.
  PowerShell einfügen, dann `~/.gws-connect/gws-connect` starten.
- `README.md`: „Für den Betreiber" um eine **fertige Nachricht** zum Weiterleiten
  ergänzen (DE/EN), und um den Release-Ablauf (`git tag vX.Y.Z && git push --tags`).

---

## 5. Was bleibt, was geht

| Bestandteil | Status |
|---|---|
| ZIP-Pakete | bleiben, als Rohmaterial für die Installer und als Offline-Weg |
| `START-HIER.cmd/.command` im Paket | bleibt für den Offline-Weg |
| Paket-`CLAUDE.md` | bleibt für den Offline-Weg, nutzt jetzt `setup --dialog` und nennt `relink` |
| `Start-Mac.command`, `Start-Windows.cmd` im Repo-Wurzelverzeichnis | bleiben für Entwickler mit eigenem Node |
| `env.installGws()` (Installation über brew/npm) | bleibt; im installierten Stand greift es nie, weil `GWS_CONNECT_GWS_BIN` gesetzt ist |

---

## 6. Fehlerverhalten

| Fall | Verhalten |
|---|---|
| kein Netz / Download scheitert | Abbruch mit einer Zeile, bestehende Installation unverändert |
| Prüfsumme weicht ab | Abbruch, nichts verändert, Zeile nennt die Datei |
| `win-arm64` | Abbruch: „für ARM-Windows gibt es kein gws" |
| Popup lässt sich nicht öffnen (z. B. Remote-Sitzung ohne Oberfläche) | `setup --dialog` meldet das mit eigenem Fehlertext; `INSTALL.md` weist Claude an, dann den Starter `~/.gws-connect/gws-connect setup` in einem eigenen Terminalfenster zu öffnen, wie im bisherigen Paket |
| Update, während ein Konto-Starter läuft | Tausch in 4.3 Schritt 4 ist atomar; der laufende Prozess hält seine Dateien (macOS) bzw. der Tausch scheitert und meldet „bitte Claude/Terminal schließen und erneut versuchen" (Windows, gesperrte Datei) |
| `~/.claude/skills/` existiert nicht | wird angelegt |

---

## 7. Prüfung

| Was | Wie | Wo |
|---|---|---|
| `mac-x64`-Ziel | Einheitstest gegen `resolveTarget` | `tests/bundle.test.mjs` |
| `relink` | Sandbox mit zwei Konten, Starter veraltet → nach `relink` zeigen beide auf aktuelle Pfade | `tests/relink.test.mjs` |
| Popup-Befehl | reine Funktion: richtige Programme, Code nie in `argv`, Skript über stdin | `tests/dialog.test.mjs` |
| `setup --dialog` | Popup durch Fake-Programm ersetzt: Erfolg, Abbruch, falscher Code → erneuter Versuch, drei Versuche Maximum | `tests/setup-dialog.test.mjs` |
| `INSTALL.md` ↔ Skripte | URLs und Starterpfade stimmen überein | `tests/install-doc.test.mjs` |
| **Installation echt** | CI: Pakete bauen, lokal per `python -m http.server` ausliefern, `GWS_CONNECT_RELEASE_URL` darauf setzen, Skript ausführen, danach `~/.gws-connect/gws-connect doctor` — zweimal hintereinander (Update-Fall), Konten-Verzeichnis dazwischen mit Attrappe befüllt und auf Unverändertheit geprüft | `release.yml`, je Plattform |
| Prüfsummen-Abbruch | CI: manipuliertes ZIP → Skript bricht ab, `app/` unverändert | `release.yml` |
| Popup echt | von Hand, einmal je Betriebssystem, vor dem ersten öffentlichen Release | Mac + Windows |
| **Gesamtablauf mit Claude** | von Hand: frische Claude-Code-Sitzung, nur der Satz, bis zum verbundenen Konto | Mac + Windows |

Mit den macOS-Läufern in CI ist das Mac-Paket zum ersten Mal auf einem echten Mac
geprüft. Das Popup und die Google-Anmeldung bleiben Handprüfung, weil beides eine
Oberfläche braucht.

---

## 8. Sicherheit

- Das Release enthält kein Geheimnis. Der Einrichtungs-Code reist weiter getrennt.
- `curl | bash` vertraut dem GitHub-Release. Die Prüfsumme schützt vor
  abgeschnittenen Downloads, nicht vor einem kompromittierten Release — dasselbe
  Vertrauensniveau wie heute beim ZIP-Link. Signierung würde das ändern und ist
  vertagt (Abschnitt 10).
- Der Code berührt nie eine Kommandozeile, eine Datei oder Claudes Protokoll: Popup
  → stdout des Kindprozesses → `credsets.importCode()`.
- Die Skripte schreiben nur unter `~/.gws-connect/` und `~/.claude/skills/`.

---

## 9. Umfang

Ein Implementierungsplan. Reihenfolge nach Abhängigkeit:

1. `mac-x64`-Ziel
2. `relink`
3. `setup --dialog`
4. Installationsskripte
5. `INSTALL.md` + Test
6. Release-Workflow mit CI-Installationsläufen
7. Dokumentation

---

## 10. Offene Punkte

- **Signierung** (Apple Developer ID, Azure Trusted Signing): würde klassische
  Installer ohne Claude möglich machen. Wenn Budget da ist, eigenes Design.
- **Claude-Code-Plugin**: könnte `INSTALL.md` und den Skill als Plugin anbieten, mit
  Updates über den Plugin-Mechanismus.
- **Repository öffentlich machen**: Voraussetzung für die stabile URL. Vor dem ersten
  Release die Git-Historie auf versehentlich eingecheckte Codes prüfen
  (`git log -p | grep GWSC1.`).
