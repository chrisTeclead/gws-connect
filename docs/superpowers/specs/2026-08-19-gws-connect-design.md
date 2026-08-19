# gws-connect — Design

**Datum:** 2026-08-19
**Status:** freigegeben, bereit für Implementierungsplan
**Vorläufer:** `lh-gws-switch` (macOS-only, vier fest verdrahtete Konten, Ansatz 2 / OAuth pro Konto)

---

## 1. Zweck

Ein Werkzeug, mit dem beliebig viele Google-Konten lesend an die
[Google Workspace CLI](https://github.com/googleworkspace/cli) (`gws`) angebunden werden —
je Konto ein eigener, strikt getrennter Anmeldespeicher. Zielgruppe sind
nicht-technische Nutzer bei Terra One. Die Google-Cloud-Zugangsdaten sind vorbereitet;
der Nutzer legt kein Cloud-Projekt an und tippt keine Client-ID ein.

Der Vorläufer `lh-gws-switch` hat den Ansatz bestätigt: OAuth je Konto, ein
Cloud-Projekt je Domain, Gegenprobe gegen die tatsächlich antwortende Adresse.
Dieses Projekt verallgemeinert ihn — von vier festen Konten auf N, von macOS auf
macOS + Windows, von handgepflegter Konfiguration auf einen Assistenten.

**Nicht-Ziele:** Linux; App-Passwort/IMAP-Fallback; Ablage gefundener Belege;
grafische Oberfläche.

---

## 2. Festgelegte Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| 1 | **Ein gemeinsames Cloud-Projekt, Audience `External`, Publishing `In production`** | `Internal` existiert nur innerhalb der eigenen Workspace-Organisation und könnte deshalb ausschließlich Terra-One-Postfächer anbinden. `External` + `In production` bedient jeden Kontotyp mit unbefristetem Refresh-Token. |
| 2 | **Node.js-CLI, macOS + Windows** | `gws` ist selbst ein Node-Paket, Node ≥ 20 ist also ohnehin Voraussetzung. Eine Codebasis statt bash + PowerShell. |
| 3 | **Öffentliches Repository ohne Geheimnisse, Verteilung per Einrichtungs-Code** | Client-Secret gehört nicht in ein öffentliches Repo (GitHub-Secret-Scanning, mögliche Sperrung durch Google). Ein Code zum Einfügen ist für Laien einfacher als eine Datei, die verschickt und verlegt wird. |
| 4 | **Zweisprachig (de/en), umschaltbar** | Nutzer lesen unter Druck zuverlässiger Deutsch; das Repo ist öffentlich und soll auch außerhalb lesbar sein. |
| 5 | **Anbindungsschicht + ein generischer Claude-Skill** | Kern ist „N Konten sicher verbinden". Belege/Termine sind Beispiele, kein Bestandteil des Werkzeugs. |
| 6 | **Dateisystem als Wahrheit** | Kontoliste = Verzeichnisliste. Keine zentrale Konfiguration, die von der Realität abweichen kann. |

### 2.1 Konsequenzen von Entscheidung 1

Ein gemeinsames `External`-Projekt verschiebt die bekannten Risiken, es beseitigt sie nicht:

- **Der Zustimmungsbildschirm zeigt bei _jedem_ Konto „Google hat diese App nicht
  verifiziert".** Im Vorläufer betraf das nur das private Konto. Jetzt ist es der
  Normalfall und muss entsprechend erklärt werden — nicht als Fehler.
- **Nutzerobergrenze 100.** Gezählt werden verschiedene Google-Konten, die zugestimmt
  haben. Zehn Kollegen mit je drei Konten sind 30 von 100.
- **Fremde Workspace-Administratoren können unverifizierte Drittanbieter-Apps
  sperren.** Dafür existiert der Weg „eigenes Cloud-Projekt" (Abschnitt 8).
- **Die 7-Tage-Falle wandert vom Nutzer zum Betreiber.** Sie hängt nicht mehr an der
  Konfiguration des Einzelnen, sondern am Publishing-Status _des gemeinsamen
  Projekts_. Fällt er auf `Testing` zurück, sterben alle Zugänge gleichzeitig und
  still. Deshalb Abschnitt 7.4.
- Eine unverifizierte App mit Gmail-Lesezugriff bleibt ein von Google geduldeter,
  nicht garantierter Graubereich. Das steht so in der Dokumentation.

---

## 3. Repository-Aufbau

```
gws-connect/
  README.md                     kurz, zweisprachig, verweist weiter
  Start-Mac.command             Doppelklick-Starter
  Start-Windows.cmd             Doppelklick-Starter
  package.json                  bin, engines: node >= 20, keine dependencies
  bin/gws-connect.mjs           Einstiegspunkt: Argumente, Menue
  src/
    menu.mjs                    interaktives Hauptmenue
    commands/
      setup.mjs                 Umgebung pruefen, Einrichtungs-Code einlesen
      add.mjs                   ein Konto hinzufuegen und verbinden
      list.mjs                  Uebersicht
      verify.mjs                echte Abfrage je Konto
      remove.mjs                Konto trennen und entfernen
      doctor.mjs                Umgebungspruefung ohne Anmeldung
      credentials.mjs           eigenes Cloud-Projekt hinzufuegen
    core/
      accounts.mjs              Kontospeicher (Dateisystem als Wahrheit)
      credsets.mjs              Zugangsdaten-Saetze
      secrets/index.mjs         Backend-Auswahl
      secrets/macos.mjs         security(1) / Schluesselbund
      secrets/windows.mjs       DPAPI-verschluesselte Datei
      gws.mjs                   gws fuer genau ein Konto ausfuehren, Identitaet pruefen
      setupcode.mjs             Einrichtungs-Code kodieren/dekodieren
      accounttype.mjs           E-Mail -> privat | workspace | unklar
      wrappers.mjs              Wrapper je Konto erzeugen
  bin/gws-run.mjs               fuehrt gws als genau ein Konto aus (Ziel der Wrapper)
      env.mjs                   Node/gws erkennen und installieren
      i18n.mjs                  t(), Sprachwahl
      ui.mjs                    Eingaben, Farben, ok/warn/fehler
  locales/de.json  locales/en.json
  skills/gws-konten/SKILL.md    generischer Skill fuer Claude
  skills/examples/belege-finden/SKILL.md
  skills/examples/termine-finden/SKILL.md
  docs/de/  docs/en/            ANLEITUNG, ADMIN-CLOUD-PROJEKT, EIGENES-PROJEKT, PROBLEME
  tools/make-setup-code.mjs     nur fuer den Betreiber
  tests/                        node:test, Sandbox mit falschem gws
```

Keine Laufzeit-Abhängigkeiten. Nur Node-Bordmittel. Das hält `npx` schnell und die
Lieferkette leer.

---

## 4. Zustand auf der Platte

Nichts davon liegt im Projektordner.

```
~/.gws-connect/
  config.json                   { lang }
  credentials/
    default.json                { id, label, audience, source, createdAt }   keine Geheimnisse
    <eigene-id>.json            eigenes Cloud-Projekt
  accounts/
    <id>/
      meta.json                 { email, credSet, services[], accountType,
                                  connectedAt, verifiedAt }
      gws/                      GOOGLE_WORKSPACE_CLI_CONFIG_DIR dieses Kontos
  bin/
    gws-<id>       (macOS)      erzeugter Wrapper
    gws-<id>.cmd   (Windows)
```

- `<id>` wird aus der E-Mail-Adresse abgeleitet: Kleinbuchstaben, alles außer
  `[a-z0-9]` zu `-`, Mehrfach-`-` zusammengefasst, an den Rändern getrimmt.
  `tony@terra-one.de` → `tony-terra-one-de`.
- **Die Kontoliste ist die Verzeichnisliste.** `meta.json` ist ein Cache, der
  jederzeit verworfen werden darf; die Wahrheit über die verbundene Adresse liefert
  Google (Abschnitt 7.1).
- Verzeichnisse mit Modus `0700` auf macOS. Unter Windows gelten die ACLs des
  Benutzerprofils; die Dokumentation sagt das so, statt mehr zu versprechen.

### 4.1 Ablage der Geheimnisse

Getrennt nach Schadensreichweite:

- **Client-Secret** → macOS-Schlüsselbund bzw. unter Windows eine mit DPAPI
  (`CurrentUser`-Scope) verschlüsselte Datei. Grund: dieses Geheimnis ist bei allen
  Nutzern dasselbe, ein Abfluss betrifft alle.
- **OAuth-Tokens** → bleiben Dateien, die `gws` verwaltet. Sie sind pro Nutzer
  einzeln und `gws` besitzt das Format. Die Dokumentation stellt klar, dass die
  Tokens _nicht_ in einem Tresor liegen — kein Versprechen, das der Code nicht hält.

Backend-Schnittstelle: `has(set, feld)`, `get(set, feld)`, `set(set, feld, wert)`,
`remove(set)`.

### 4.2 Wrapper je Konto

Der Wrapper liest das Geheimnis **nicht selbst**. Er ist eine Zeile, die
`bin/gws-run.mjs <konto-id> -- <argumente>` aufruft; dieses Skript holt die
Zugangsdaten über dieselbe Backend-Abstraktion wie der Assistent und startet `gws`
mit gesetztem `GOOGLE_WORKSPACE_CLI_CONFIG_DIR`.

Der Vorläufer hat das Auslesen aus dem Schlüsselbund in den erzeugten Wrapper
kopiert. Das war unter macOS vertretbar, unter Windows müsste eine `.cmd`-Datei
dafür DPAPI entschlüsseln — Batch-Skript ist der falsche Ort für Kryptografie.
Ein gemeinsames Node-Skript hält die Logik an einer Stelle und macht die Wrapper
auf beiden Plattformen trivial.

---

## 5. Einrichtungs-Code

Format:

```
GWSC1.<pruefsumme>.<base64url(json)>
```

`json` = `{ v: 1, id, label, audience, client_id, client_secret }`
`pruefsumme` = die ersten 8 Zeichen von `sha256(base64url-Teil)`, hex.

- **Der Code ist das Geheimnis.** Er ist nicht verschlüsselt, sondern nur
  transportfreundlich kodiert. Die Dokumentation sagt: wie ein Passwort behandeln,
  über 1Password teilen, nicht per Mail.
- Die Prüfsumme fängt den abgeschnittenen Slack-Einfügevorgang ab. Ohne sie schlägt
  ein unvollständiger Code erst später als undurchsichtiger OAuth-Fehler auf — für
  Laien der teuerste Fehlerfall.
- Zusätzliche Plausibilitätsprüfung: `client_id` endet auf
  `.apps.googleusercontent.com` (übernommen aus dem Vorläufer).
- Nach erfolgreichem Import wird der Code nicht gespeichert.
- `tools/make-setup-code.mjs` erzeugt Codes für den Betreiber.

---

## 6. Ablauf für den Nutzer

1. ZIP von GitHub herunterladen, entpacken.
2. `Start-Mac.command` bzw. `Start-Windows.cmd` doppelklicken.
3. Sprachwahl (Vorschlag aus der System-Locale), dann Umgebungsprüfung.
   Fehlt Node oder `gws`, wird die Installation angeboten — macOS über `brew`,
   Windows über `winget` — jeweils erst nach Rückfrage. Ist kein Paketmanager da,
   folgt eine klare Anweisung mit Link, kein Abbruch ohne Erklärung.
4. Einrichtungs-Code einfügen. Wird geprüft, in Schlüsselbund/DPAPI gelegt, verworfen.
5. Menüpunkt **Konto hinzufügen**, so oft wie nötig.
6. Menüpunkt **Übersicht** zeigt den Stand; **Zugang prüfen** fragt echt ab.

Der Hinweis „vorher im Browser bei Google abmelden" bleibt erhalten. Er ist die
häufigste Ursache für ein falsch verbundenes Konto — Wissen, das der Vorläufer
teuer erworben hat.

### 6.1 Menü

```
1  Konto hinzufuegen
2  Uebersicht
3  Zugang pruefen
4  Konto entfernen
5  Umgebung pruefen
6  Eigenes Cloud-Projekt hinzufuegen
7  Anleitung
8  Sprache / language
q  Beenden
```

Menüpunkt 6 ist immer sichtbar, aber als Sonderfall gekennzeichnet — sonst gäbe es
keinen Weg, den zweiten Zugangsdaten-Satz überhaupt anzulegen. Was normale Nutzer
nie sehen, ist die *Abfrage* des Satzes beim Hinzufügen eines Kontos: die entfällt,
solange nur ein Satz existiert (Abschnitt 8).

### 6.2 Ein Konto hinzufügen

1. E-Mail-Adresse erfragen, Format prüfen.
2. **Doppelung ablehnen**, wenn diese Adresse schon verbunden ist.
3. Kontotyp bestimmen (Abschnitt 7.3).
4. Zugangsdaten-Satz wählen — übersprungen, wenn es nur einen gibt.
5. Dienste wählen. Vorgabe Gmail + Drive + Kalender, jeweils nur lesend;
   Einschränkung möglich, weil nicht jedes Konto alles braucht.
6. **Vorher ansagen, was kommt:** welche Adresse zu wählen ist, dass „Google hat
   diese App nicht verifiziert" erscheint und über _Erweitert → Weiter zu …_
   durchzuklicken ist, und dass der Zugriff ausschließlich lesend ist.
7. `gws auth login --readonly --services <liste>` im Konto-Konfigurationsverzeichnis.
8. Gegenprobe (Abschnitt 7.1). Bei falscher Adresse: trennen, benennen, anbieten
   erneut zu versuchen.
9. Je Dienst eine Abfrage (Abschnitt 7.2).
10. `meta.json` schreiben, Wrapper erzeugen.

### 6.3 Ein Konto entfernen

In dieser Reihenfolge, und die Reihenfolge ist der Punkt:

1. `gws auth logout` für dieses Konto — **die Zustimmung bei Google zurückziehen.**
2. Erst danach Kontoverzeichnis und Wrapper löschen.

Nur die Dateien zu löschen würde ein gültiges Refresh-Token bei Google
zurücklassen, das niemand mehr sehen, prüfen oder widerrufen kann. Schlägt Schritt 1
fehl, wird Schritt 2 trotzdem ausgeführt, aber mit ausdrücklichem Hinweis auf
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) und der
Aufforderung, die Zustimmung dort von Hand zu entziehen.

### 6.4 Aufrufe ohne Menü

Das Menü ist der Weg für Laien. Darunter liegt eine reguläre CLI, die dieselben
Bausteine benutzt — brauchbar für den Betreiber, für Skripte und für die Tests:

```
gws-connect                       Menue
gws-connect setup --code <code>   Zugangsdaten importieren
gws-connect add <email>           Konto hinzufuegen
gws-connect list                  Uebersicht
gws-connect verify [<email>]      pruefen, alle oder eines
gws-connect remove <email>        Konto entfernen
gws-connect doctor                Umgebung pruefen
gws-connect --lang de|en          Sprache setzen
```

---

## 7. Schutzmechanismen

### 7.1 Falsches Konto

Nach jeder Anmeldung `gmail.users.getProfile` mit `userId: me`. Antwortet eine andere
Adresse als erwartet, gilt die Anmeldung als fehlgeschlagen: `gws auth logout`, klare
Meldung, Angebot zur Wiederholung. Direkte Übernahme von `verbundene_email()` aus dem
Vorläufer.

Ist Gmail **nicht** unter den gewählten Diensten, tritt `calendar.calendarList.list`
an die Stelle der Gegenprobe: verglichen wird die `id` des Kalenders mit
`primary: true`. Ist auch Kalender nicht gewählt, bleibt nur Drive — dann wird
`drive.about.get` mit `fields: user/emailAddress` verwendet. Es gibt also für jede
mögliche Dienstauswahl eine Gegenprobe; ohne sie wird kein Konto als verbunden
verbucht.

### 7.2 Dienste einzeln prüfen

Gmail, Drive und Kalender werden getrennt abgefragt, damit die Fehlermeldung die
konkrete API benennt, die im Cloud-Projekt fehlt — statt eines pauschalen
„geht nicht".

### 7.3 Kontotyp

`gmail.com` / `googlemail.com` → privat. Sonst MX-Abfrage: zeigt sie auf
`google.com` / `googlemail.com`, ist es eine Workspace-Domain, andernfalls „unklar"
mit Warnung. Die MX-Abfrage darf fehlschlagen — dann „unklar", kein Abbruch, weil
Netzwerke ohne DNS-Werkzeuge existieren. Umsetzung über `dns.resolveMx` aus Node,
nicht über `dig`; das ist plattformunabhängig und braucht kein externes Programm.

Der Typ steuert nur die Erklärtexte. Angebunden werden beide Typen gleich, weil das
gemeinsame Projekt `External` ist.

### 7.4 Die 7-Tage-Falle, automatisiert

Ein Konto gilt als **bestätigt haltbar**, wenn es eine erfolgreiche Prüfung gibt, die
mindestens 8 Tage nach dem Verbinden lag — also `verifiedAt − connectedAt ≥ 8 Tage`.
Bei jedem Start des Menüs erscheint für jedes Konto, das diese Bedingung nicht
erfüllt und vor mehr als 7 Tagen verbunden wurde, ein deutlicher Hinweis mit
direkter Möglichkeit, jetzt zu prüfen. Ist die Bedingung erfüllt, wird nicht mehr
gemahnt.

Eine Prüfung am Tag des Verbindens beweist nichts: die 7-Tage-Befristung schlägt
erst danach zu. Nur eine Prüfung *nach* Ablauf der Frist ist ein Beweis.

Der Vorläufer verließ sich auf einen handschriftlichen Kalendereintrag. Bei
nicht-technischen Nutzern überlebt das den Kontakt mit der Wirklichkeit nicht, und
der Fehler fällt genau dann nicht auf, wenn niemand mehr daran denkt.

### 7.5 Betreiberseite

`docs/*/ADMIN-CLOUD-PROJEKT.md` enthält eine Prüfliste für den Betreiber: drei APIs
aktiv, Audience `External`, Scopes eingetragen, Publishing-Status `In production`,
Nutzerzahl gegen die 100er-Grenze. Diese Liste ist Voraussetzung dafür, dass
überhaupt etwas funktioniert.

---

## 8. Eigenes Cloud-Projekt

Für den Fall, dass ein fremder Workspace-Administrator die unverifizierte App
sperrt, oder dass die 100er-Grenze erreicht ist.

- Menüpunkt 6 legt einen zweiten Zugangsdaten-Satz an — entweder aus einem
  Einrichtungs-Code oder durch direkte Eingabe von Client-ID und Secret.
- `docs/*/EIGENES-PROJEKT.md` verallgemeinert die Anleitung des Vorläufers:
  `Internal` für eine Workspace-Domain, `External` + `In production` für ein privates
  Konto.
- Existiert nur ein Satz, wird beim Hinzufügen eines Kontos nicht nach dem Satz
  gefragt. Normale Nutzer sehen diesen Weg nie.

---

## 9. Claude-Skill

`skills/gws-konten/SKILL.md` erklärt Claude:

- wie die Kontoliste gelesen wird (`~/.gws-connect/accounts/*/meta.json`),
- dass Abfragen über `~/.gws-connect/bin/gws-<id>` laufen,
- dass Konten niemals gemischt werden — je Frage ein Konto, Ergebnisse getrennt
  ausgewiesen,
- dass der Zugriff lesend ist und Schreibversuche fehlschlagen,
- wie ein Konto anhand seiner E-Mail-Adresse gefunden wird.

Belege und Termine liegen als Beispiele unter `skills/examples/` zum Kopieren und
Anpassen.

---

## 10. Zweisprachigkeit

`locales/de.json` und `locales/en.json`. Sprache aus der System-Locale vorgeschlagen,
per `--lang de|en` überschreibbar, Wahl in `config.json` gemerkt. **Alle
nutzersichtbaren Zeichenketten laufen von Anfang an über `t()`** — i18n
nachzurüsten ist der Punkt, an dem so etwas verrottet. Fehlt ein Schlüssel in der
gewählten Sprache, greift Englisch, und der Test schlägt fehl.

---

## 11. Tests

Das Sandbox-Muster des Vorläufers, übertragen auf `node:test`: ein falsches `gws`
im PATH, das vorgegebenes JSON liefert, ein Speicher-Backend im Arbeitsspeicher,
ein temporäres HOME. Kein echtes Konto, keine Anmeldung, kein Netz.

Abgedeckt:

1. Einrichtungs-Code: gültig, falsche Prüfsumme, abgeschnitten, unplausible Client-ID
2. Konto hinzufügen, Gutfall, inklusive `meta.json` und Wrapper
3. Falsches Konto wird erkannt und getrennt
4. Doppelte Adresse wird vor der Anmeldung abgelehnt
5. Dienste einzeln geprüft, Fehler benennt die richtige API
6. Hinweis nach 7 Tagen erscheint, verschwindet nach Prüfung
7. Wrapper-Erzeugung für macOS und Windows
8. Auswahl des Zugangsdaten-Satzes, übersprungen bei nur einem Satz
9. Kontotyp-Erkennung, inklusive fehlgeschlagener MX-Abfrage
10. Vollständigkeit der Sprachdateien
11. Entfernen ruft `auth logout` **vor** dem Löschen, und löscht auch dann, wenn
    `logout` fehlschlägt
12. Gegenprobe für jede Dienstauswahl: nur Gmail, nur Kalender, nur Drive

---

## 12. Offene Voraussetzung beim Betreiber

Das vorhandene Cloud-Projekt muss auf Audience `External`, mit eingetragenen
Readonly-Scopes und Publishing-Status `In production` stehen, und die drei APIs
müssen aktiv sein. Steht es heute auf `Internal`, ist die Umstellung die Bedingung
dafür, dass Konten außerhalb der Terra-One-Domain überhaupt angebunden werden
können. Beschrieben in `docs/*/ADMIN-CLOUD-PROJEKT.md`.
