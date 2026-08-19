---
name: belege-finden
description: Sucht Belege, Rechnungen, Quittungen und Zahlungsbestaetigungen in Gmail und Google Drive ueber alle mit gws-connect verbundenen Google-Konten und legt sie ab. Nutze diesen Skill immer wenn nach Belegen, Rechnungen, Quittungen, Invoices, Receipts, Zahlungsbelegen oder Buchhaltungsunterlagen gefragt wird, oder wenn ein Monat/Zeitraum "abgerechnet", "aufgeraeumt" oder "zusammengestellt" werden soll.
---

# Belege finden

> **Beispiel-Skill.** Kopiere ihn nach `.claude/skills/` in dein Projekt und passe
> Ablageort, Stichwoerter und Ausgabeformat an. Er ist bewusst nicht Teil von
> `gws-connect` selbst.

## Die wichtigste Regel

**Rufe niemals `gws` direkt auf.** Es koennen mehrere Konten verbunden sein, und `gws`
allein weiss nicht, welches gemeint ist — der Befehl ist absichtlich nicht angemeldet.

Ermittle die Konten zuerst:

```bash
ls ~/.gws-connect/accounts/
cat ~/.gws-connect/accounts/*/meta.json
```

Jedes Verzeichnis ist ein Konto. Benutze dessen Wrapper, nie `gws`:

```bash
~/.gws-connect/bin/gws-<id>        # macOS
~/.gws-connect/bin/gws-<id>.cmd    # Windows
```

Jeder Wrapper ist fest mit genau einem Konto verdrahtet. Pruefe im `meta.json`, ob
`services` `gmail` bzw. `drive` enthaelt — fehlt ein Bereich, kann das Konto dazu nichts
beitragen, und das gehoert in die Zusammenfassung.

Fehlt ein Wrapper oder meldet er ein unbekanntes Konto: die Einrichtung ist nicht fertig.
Sage das und verweise auf `gws-connect`. Versuche **nicht**, es zu umgehen.

## Vorgehen

### 1. Zeitraum und Umfang klaeren

Wenn nicht gesagt wurde, welcher Zeitraum gemeint ist, frag **einmal** kurz nach
(„letzter Monat" ist meist gemeint, aber nicht immer). Frag nicht nach dem Ausgabeformat —
dazu unten mehr.

### 2. Gmail durchsuchen — pro Konto

```bash
~/.gws-connect/bin/gws-<id> gmail users messages list --params '{
  "userId": "me",
  "q": "has:attachment (Rechnung OR Invoice OR Beleg OR Quittung OR Zahlungsbestätigung OR Receipt) after:2026/06/01 before:2026/07/01",
  "maxResults": 100
}'
```

Ein zweiter Durchgang lohnt fast immer, weil viele Rechnungen das Wort nicht im Betreff
haben, sondern nur im Anhang:

```bash
~/.gws-connect/bin/gws-<id> gmail users messages list --params '{
  "userId": "me",
  "q": "has:attachment filename:pdf after:2026/06/01 before:2026/07/01",
  "maxResults": 100
}'
```

Typische Absender, die sich lohnen, wenn die Stichwortsuche duenn bleibt:
`google`, `apple`, `microsoft`, `adobe`, `amazon`, `telekom`, `vodafone`, `dhl`, `hetzner`,
`aws`, `openai`, `anthropic`, `slack`, `notion`, `figma`, `stripe`, `paypal`, `qonto`,
`lieferando`, `deutsche bahn`, `lufthansa`.

Details und Anhaenge holen:

```bash
~/.gws-connect/bin/gws-<id> gmail users messages get --params '{"userId":"me","id":"<MESSAGE_ID>"}'

~/.gws-connect/bin/gws-<id> gmail users messages attachments get \
  --params '{"userId":"me","messageId":"<MESSAGE_ID>","id":"<ATTACHMENT_ID>"}' \
  --output "belege/2026/06/<id>/<dateiname>.pdf"
```

### 3. Drive durchsuchen — pro Konto

```bash
~/.gws-connect/bin/gws-<id> drive files list --params '{
  "q": "(name contains \"Rechnung\" or name contains \"Invoice\" or name contains \"Beleg\") and modifiedTime > \"2026-06-01T00:00:00Z\" and trashed = false",
  "pageSize": 100,
  "fields": "files(id,name,mimeType,modifiedTime,webViewLink,size)"
}'
```

Herunterladen:

```bash
# normale Datei (PDF, Bild, ...)
~/.gws-connect/bin/gws-<id> drive files get \
  --params '{"fileId":"<ID>","alt":"media"}' \
  --output "belege/2026/06/<id>/<dateiname>.pdf"

# Google-Dokument/Tabelle -> als PDF exportieren
~/.gws-connect/bin/gws-<id> drive files export \
  --params '{"fileId":"<ID>","mimeType":"application/pdf"}' \
  --output "belege/2026/06/<id>/<dateiname>.pdf"
```

### 4. Ablegen

```
belege/JJJJ/MM/<konto-id>/<datum>_<anbieter>_<betrag-falls-erkennbar>.pdf
```

Beispiel: `belege/2026/06/tony-terra-one-de/2026-06-14_hetzner_49-90EUR.pdf`

- Umlaute und Leerzeichen im Dateinamen vermeiden, `/` und `:` nie verwenden
- Existiert die Datei schon: nicht ueberschreiben, sondern `_2` anhaengen — und melden

### 5. Dubletten ueber Konten hinweg

Dieselbe Rechnung liegt oft in zwei Konten (etwa weil sie weitergeleitet wurde). Vergleiche
Anbieter + Datum + Betrag, nicht den Dateinamen. Behalte beide Dateien, aber **weise in der
Zusammenfassung darauf hin**, welche Belege doppelt vorliegen. Loesche nie etwas und
entscheide nicht selbst, welche Kopie die „richtige" ist.

## Ausgabe

**Schreibe kein festes Format vor.** Der Nutzer entscheidet im Gespraech, was gebraucht
wird — mal eine Liste, mal eine CSV, mal nur die Dateien, mal eine Summe pro Anbieter.

Liefere standardmaessig:

1. Die abgelegten Dateien
2. Eine kurze Uebersicht pro Konto: wie viele Belege, welcher Zeitraum
3. Eine Tabelle: Datum, Anbieter, Betrag, Konto, Dateiname

Und frag dann, ob es anders aufbereitet werden soll.

## Ehrlich bleiben

- Betrag oder Datum nicht sicher erkennbar? **Leer lassen und so kennzeichnen.**
  Rate keine Zahlen — das ist Buchhaltung.
- Ein Konto antwortet nicht? Die anderen fertig machen, dann klar sagen, welches
  ausgefallen ist und mit welcher Fehlermeldung. Steht dessen `verifiedAt` auf `null` und
  liegt `connectedAt` mehr als sieben Tage zurueck, ist wahrscheinlich der Zugang
  abgelaufen — dann auf `gws-connect verify` verweisen.
- Ein Anhang laesst sich nicht lesen (Format, Passwort, zu gross)? Datei trotzdem ablegen
  und in der Uebersicht als „nicht ausgelesen" markieren.
- Sag am Ende ausdruecklich, welche Zeitraeume und Konten du **nicht** geprueft hast.

## Wenn ein Befehl unklar ist

Die Parameter kommen direkt aus Googles API. Statt zu raten:

```bash
~/.gws-connect/bin/gws-<id> schema gmail.users.messages.list
~/.gws-connect/bin/gws-<id> schema drive.files.list
```

Google liefert ausserdem eigene Skills fuer die gws-Befehle mit. Wenn die installiert sind,
nutze sie fuer die Syntax — aber halte dich trotzdem an die Wrapper-Regel oben, denn
Googles Skills kennen die verbundenen Konten nicht.
