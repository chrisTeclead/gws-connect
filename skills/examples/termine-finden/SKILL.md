---
name: termine-finden
description: Findet Termine, Fristen und Meetings in Google Kalender und in Mails ueber alle mit gws-connect verbundenen Google-Konten. Nutze diesen Skill immer wenn nach Terminen, Meetings, Kalender, Fristen, Deadlines, Verlaengerungen, Kuendigungsfristen oder Zahlungszielen gefragt wird, oder wenn Termine ueber mehrere Konten hinweg zusammengetragen oder auf Ueberschneidungen geprueft werden sollen.
---

# Termine finden

> **Beispiel-Skill.** Kopiere ihn nach `.claude/skills/` in dein Projekt und passe
> Stichwoerter, Zeitzone und Ausgabeformat an.

## Die wichtigste Regel

**Rufe niemals `gws` direkt auf.** Es koennen mehrere Konten verbunden sein, und `gws`
allein weiss nicht, welches gemeint ist — der Befehl ist absichtlich nicht angemeldet.

Ermittle die Konten zuerst:

```bash
ls ~/.gws-connect/accounts/
cat ~/.gws-connect/accounts/*/meta.json
```

Dann pro Konto dessen Wrapper benutzen:

```bash
~/.gws-connect/bin/gws-<id>        # macOS
~/.gws-connect/bin/gws-<id>.cmd    # Windows
```

Enthaelt `services` eines Kontos kein `calendar`, kann es keine Kalendertermine liefern —
das gehoert in die Zusammenfassung, nicht ins Schweigen.

## Kalender

Alle Kalender eines Kontos auflisten (nicht nur der Hauptkalender — oft haengen dort
abonnierte oder geteilte Kalender mit den interessanten Terminen):

```bash
~/.gws-connect/bin/gws-<id> calendar calendarList list --params '{"maxResults":250}'
```

Termine in einem Zeitraum:

```bash
~/.gws-connect/bin/gws-<id> calendar events list --params '{
  "calendarId": "primary",
  "timeMin": "2026-08-01T00:00:00Z",
  "timeMax": "2026-08-31T23:59:59Z",
  "singleEvents": true,
  "orderBy": "startTime",
  "maxResults": 250
}'
```

- `singleEvents: true` ist wichtig: sonst kommen Serientermine als eine Regel zurueck
  statt als einzelne Termine
- `orderBy: startTime` funktioniert nur zusammen mit `singleEvents: true`
- Fuer andere Kalender die `id` aus `calendarList` als `calendarId` einsetzen

## Termine, die nur in Mails stehen

Ein grosser Teil der wirklich wichtigen Fristen steht in keinem Kalender: Kuendigungs-
fristen, Vertragsverlaengerungen, Zahlungsziele, Fristen von Behoerden.

```bash
~/.gws-connect/bin/gws-<id> gmail users messages list --params '{
  "userId": "me",
  "q": "(Termin OR Frist OR Deadline OR Kündigung OR Verlängerung OR \"Zahlungsziel\" OR \"fällig am\" OR Einladung OR Zusage) after:2026/07/01",
  "maxResults": 100
}'
```

Beim Auslesen auf Datumsangaben im Text achten — auch relative („in zwei Wochen",
„zum Monatsende"). Rechne sie in ein konkretes Datum um und **schreib dazu, woraus du es
abgeleitet hast**. Eine Frist, die du falsch berechnet hast, ist schlimmer als eine, die
du als unklar meldest.

## Ueber die Konten hinweg

Derselbe Termin liegt oft in mehreren Kalendern (Einladung an zwei Adressen). Erkenne
Dubletten an Titel + Startzeit, nicht an der Event-ID — die ist pro Konto verschieden.

Bei Ueberschneidungen: nenne beide Termine und die betroffenen Konten. Entscheide nicht
selbst, welcher wichtiger ist.

## Ausgabe

**Kein festes Format.** Der Nutzer entscheidet, was gebraucht wird.

Standardmaessig eine Tabelle, chronologisch sortiert:

| Datum/Zeit | Termin | Konto | Quelle | Sicher? |
|---|---|---|---|---|

„Quelle" heisst: Kalendername oder Mail-Betreff. „Sicher?" bedeutet: aus einem
Kalendereintrag (sicher) oder aus einem Mailtext abgeleitet (unsicher).

Frag danach, ob es anders gebraucht wird — etwa als `.ics`, als Liste nach Konto, oder
nur die Fristen.

## Ehrlich bleiben

- Zeitzonen: Google liefert `dateTime` mit Offset. Rechne nach Europe/Berlin um und sag,
  wenn ein Termin ohne Zeitzone kam.
- Ganztagestermine kommen als `date` statt `dateTime` — nicht als 00:00 Uhr ausgeben.
- Ein Konto antwortet nicht? Die anderen fertig machen, dann klar benennen, welches
  fehlt und warum. Bei `verifiedAt: null` und `connectedAt` aelter als sieben Tage ist
  wahrscheinlich der Zugang abgelaufen — auf `gws-connect verify` verweisen.
- Sag ausdruecklich, welchen Zeitraum du geprueft hast — und welchen nicht.

## Wenn ein Befehl unklar ist

```bash
~/.gws-connect/bin/gws-<id> schema calendar.events.list
```
