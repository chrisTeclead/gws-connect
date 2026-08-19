# Anleitung — Google-Konten verbinden

Für dich, wenn du den Ordner und einen **Einrichtungs-Code** bekommen hast.
Dauer: etwa 5 Minuten für das Programm, dann 2 Minuten pro Konto.

Du legst **kein** Google-Cloud-Projekt an und tippst **keine** Zugangsdaten ein. Das ist
schon vorbereitet.

---

## Was das Ganze macht

Es verbindet deine Google-Konten mit der offiziellen
[Google Workspace CLI](https://github.com/googleworkspace/cli) von Google, damit Claude
darin **lesen** kann — Gmail, Google Drive und Kalender.

Der Zugriff ist **ausschließlich lesend**. Es kann nichts gelöscht, geändert oder
verschickt werden. Jedes Konto liegt in seinem eigenen, getrennten Speicher; kein Konto
kann versehentlich für ein anderes antworten.

---

## Schritt 1 — Node.js

Wenn du nicht weißt, ob du Node.js hast: einfach weitermachen, das Programm sagt es dir.

Fehlt es, hol es hier: **[nodejs.org](https://nodejs.org)** → die **LTS**-Version.
Installieren, Fenster schließen, weiter mit Schritt 2.

---

## Schritt 2 — Programm starten

- **Mac:** `Start-Mac.command` doppelklicken
- **Windows:** `Start-Windows.cmd` doppelklicken

> **Mac, beim ersten Mal:** macOS meldet vielleicht „nicht verifizierter Entwickler".
> Dann Rechtsklick auf die Datei → **Öffnen** → **Öffnen**. Nur einmal nötig.

Das Programm prüft die Umgebung und richtet fehlende Teile ein, wenn du zustimmst.

---

## Schritt 3 — Einrichtungs-Code einfügen

Du bekommst eine lange Zeile, die mit `GWSC1.` beginnt. Sie kommt über einen
Passwortmanager, nicht per Mail.

Beim ersten Start fragt das Programm von selbst danach: **Einrichtungs-Code:** →
einfügen → Enter. Später jederzeit über Menüpunkt **6 (Einrichtungs-Code eingeben)**.

Im Terminal geht es auch direkt:

```bash
node bin/gws-connect.mjs setup
```

- **Der Code ist wie ein Passwort.** Nicht weiterschicken, nicht in einen Chat kopieren.
- Nach dem Einfügen wird er nicht gespeichert; er ist verbraucht.
- Wenn eine Meldung über eine falsche **Prüfsumme** kommt: der Code ist beim Kopieren
  abgeschnitten worden. Nochmal komplett kopieren — von `GWSC1.` bis zum letzten Zeichen.

---

## Schritt 4 — Konten hinzufügen

Menüpunkt **1 (Konto hinzufügen)**, so oft du willst — einmal pro Konto.

Pro Konto:

1. **E-Mail-Adresse** eingeben.
2. Das Programm sagt dir, was jetzt kommt. Lies das, es sind zwei Sätze.
3. **Vorher im Browser bei Google abmelden.** Sonst nimmt Google stillschweigend das
   Konto, mit dem du gerade angemeldet bist. Das Programm merkt es und lehnt ab, aber
   abgemeldet zu starten spart dir die Runde.
4. Der Browser öffnet sich. **Genau die Adresse auswählen**, die du eingegeben hast —
   notfalls über „Anderes Konto verwenden".
5. Es erscheint: **„Google hat diese App nicht verifiziert."**
   **Das ist hier normal und eingeplant.** Über **Erweitert → Weiter zu …** fortfahren.
   Nicht abbrechen.
6. Zustimmen. Die Liste zeigt drei Berechtigungen, alle mit „ansehen" / „read".
7. Das Programm prüft danach selbst, **welches Konto tatsächlich geantwortet hat**.
   Passt es nicht, wird die Verbindung sofort wieder gelöst und dir gesagt, was los war.

Fertig. Wiederhole das für jedes weitere Konto.

---

## Schritt 5 — nach 8 Tagen einmal prüfen

Das Programm erinnert dich von selbst daran. Wenn der Hinweis kommt: **ja** sagen.

**Warum:** Ist im Google-Cloud-Projekt etwas falsch eingestellt, funktioniert erst alles —
und Google kappt den Zugang nach genau 7 Tagen, lautlos. Eine Prüfung am ersten Tag
beweist deshalb nichts. Erst eine erfolgreiche Prüfung **nach** dem achten Tag zeigt, dass
es hält. Danach fragt das Programm nicht mehr.

---

## Was du danach hast

Pro Konto einen Befehl unter `~/.gws-connect/bin/`. Claude nutzt den, um in genau diesem
Konto zu lesen.

Menüpunkt **2 (Übersicht)** zeigt jederzeit, was verbunden ist.
Menüpunkt **3 (Zugang prüfen)** fragt wirklich bei Google nach.
Menüpunkt **4 (Konto entfernen)** zieht die Zustimmung bei Google zurück und löscht alles.

---

## Wenn etwas nicht geht

Erst Menüpunkt **5 (Umgebung prüfen)** — der sagt konkret, was fehlt.
Dann [PROBLEME.md](PROBLEME.md).

Und: **nichts raten und nichts anderes umstellen.** Ein falsch gesetzter Schalter fällt
erst nach einer Woche auf, und dann ist die Ursache schwer zu finden. Lieber melden.
