# Wenn etwas nicht geht

Erst **Menüpunkt 5 (Umgebung prüfen)**. Der sagt konkret, was fehlt, und braucht keine
Anmeldung.

---

## „Google hat diese App nicht verifiziert"

**Das ist normal und eingeplant.** Über **Erweitert → Weiter zu …** fortfahren.

Die vorbereitete App ist absichtlich nicht bei Google verifiziert. Die Verifizierung wäre
für den Zweck unnötig aufwendig, und ohne sie funktioniert alles — dauerhaft, solange das
Cloud-Projekt auf `In production` steht. Der Warnhinweis bleibt trotzdem für immer stehen.

Nicht abbrechen. Wenn du hier abbrichst, wird kein Konto verbunden.

---

## Falsches Konto verbunden

Meldung: **„FALSCHES Konto verbunden: … erwartet war …"**

Das Programm hat das selbst erkannt und die Verbindung wieder gelöst — es ist nichts
kaputt.

Ursache ist fast immer: du warst im Browser noch mit einem anderen Google-Konto angemeldet,
und das Zustimmungsfenster hat stillschweigend dieses genommen.

**So gehts:**

1. Im Browser bei Google **abmelden** (alle Konten).
2. Menüpunkt **1** erneut, dieselbe Adresse.
3. Im Zustimmungsfenster **genau diese Adresse** auswählen — notfalls über „Anderes Konto
   verwenden".

---

## Zugang war da und ist nach etwa einer Woche weg

Das ist die 7-Tage-Falle, und sie hat genau eine Ursache: im Cloud-Projekt steht der
Publishing-Status auf `Testing` statt `In production`.

Das kannst du nicht selbst reparieren — **melde es dem Betreiber**, der den
Einrichtungs-Code herausgegeben hat. Es betrifft dann alle, die denselben Code benutzen.

Bei einem eigenen Projekt: [EIGENES-PROJEKT.md](EIGENES-PROJEKT.md), Schritt 6.

---

## `access_denied` oder „von deinem Administrator blockiert"

Die Workspace-Domain dieses Kontos erlaubt keine unverifizierten Drittanbieter-Apps.

Zwei Wege:

- Den Workspace-Administrator dieser Domain bitten, die App freizugeben (er braucht dazu
  die Client-ID).
- Oder ein eigenes Cloud-Projekt in dieser Domain anlegen:
  [EIGENES-PROJEKT.md](EIGENES-PROJEKT.md). Bei einem Firmenkonto ist das der saubere Weg,
  weil `Internal` dort ohne Warnhinweis und ohne Nutzergrenze funktioniert.

---

## „Gmail antwortet nicht" / „Drive antwortet nicht" / „Kalender antwortet nicht"

Im Cloud-Projekt ist die genannte API nicht aktiviert. Die Meldung nennt immer die
konkrete API — genau die fehlt.

Beim gemeinsamen Projekt: an den Betreiber melden
([ADMIN-CLOUD-PROJEKT.md](ADMIN-CLOUD-PROJEKT.md), Schritt 2).
Beim eigenen Projekt: [EIGENES-PROJEKT.md](EIGENES-PROJEKT.md), Schritt 3.

Wichtig: das Konto ist trotzdem verbunden und für die anderen Bereiche nutzbar.

---

## „Der Code ist unvollständig oder verändert"

Der Einrichtungs-Code ist beim Kopieren abgeschnitten worden — typisch, wenn er über einen
Chat oder eine Mail mit Zeilenumbruch kam.

Nochmal **komplett** kopieren: von `GWSC1.` bis zum letzten Zeichen, ohne Leerzeichen und
ohne Zeilenumbruch in der Mitte.

Der Code wird absichtlich vorher geprüft. Ohne diese Prüfung würde ein abgeschnittener Code
erst später als unverständlicher OAuth-Fehler auffallen.

---

## „Noch keine Zugangsdaten hinterlegt"

Du hast den Einrichtungs-Code noch nicht eingegeben. Ohne den kann kein Konto verbunden
werden.

```
gws-connect setup
```

Oder im Menü Punkt **6 (Einrichtungs-Code eingeben)** wählen. Beim allerersten Start
fragt das Programm ohnehin von selbst danach.

---

## Node.js fehlt oder ist zu alt

Version 20 oder neuer wird gebraucht. Hol die **LTS**-Version von
[nodejs.org](https://nodejs.org), installiere sie, schließe das Fenster und starte das
Programm neu.

---

## `gws` lässt sich nicht installieren

Menüpunkt 5 bietet die Installation an. Klappt sie nicht, von Hand:

```bash
npm install -g @googleworkspace/cli
```

Auf dem Mac alternativ `brew install googleworkspace-cli`.

Scheitert es an Rechten, ist es fast immer ein `npm`-Verzeichnisproblem und keine Sache
dieses Programms — dann jemanden fragen, der `npm` auf dem Rechner kennt.

---

## macOS: „nicht verifizierter Entwickler" beim Doppelklick

Rechtsklick auf `Start-Mac.command` → **Öffnen** → **Öffnen**. Nur beim ersten Mal.

---

## Ein Konto soll wieder weg

Menüpunkt **4 (Konto entfernen)**. Das zieht zuerst die Zustimmung bei Google zurück und
löscht danach die lokalen Daten.

Meldet das Programm, dass der Rückzug nicht geklappt hat: die Zustimmung von Hand entziehen
unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Sonst
bleibt bei Google eine gültige Berechtigung liegen, die niemand mehr sieht.

---

## Nichts hilft

Sag, **was du gemacht hast, was auf dem Bildschirm stand und um welches Konto es geht** —
wörtlich, nicht zusammengefasst. Die Fehlermeldungen sind absichtlich konkret; die genaue
Formulierung führt meist direkt zur Ursache.

**Nicht raten und nichts anderes umstellen.** Ein falsch gesetzter Schalter im
Cloud-Projekt fällt erst nach einer Woche auf, und dann ist die Ursache schwer zu finden.
