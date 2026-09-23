# Anleitung — Google-Konten verbinden

Für dich, wenn du einen **Satz für Claude** und einen **Einrichtungs-Code** bekommen hast.
Dauer: etwa 5 Minuten für die Einrichtung, dann 2 Minuten pro Konto.

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

## Schritt 1 — Claude fragen

Öffne Claude (Claude Code oder den Code-Bereich in Claude Desktop) und füge diesen Satz
ein:

> Bitte installiere gws-connect für mich:
> https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md

Claude installiert alles selbst. Du musst weder Node.js noch sonst etwas installieren,
und es erscheint keine Sicherheitswarnung.

---

## Schritt 2 — Einrichtungs-Code einfügen

Ein kleines Fenster erscheint: **„Bitte den Einrichtungs-Code … einfügen"**. Füge den
Code aus dem Passwortmanager ein (eine lange Zeile, die mit `GWSC1.` beginnt) und klicke
auf **OK**.

- **Der Code ist wie ein Passwort.** Füge ihn nur in dieses Fenster ein — niemals in den
  Chat mit Claude.
- Nach dem Einfügen wird er nicht gespeichert; er ist verbraucht.
- Sagt das Fenster, der Code sei unvollständig: nochmal komplett kopieren — vom Anfang
  bis zum letzten Zeichen.

---

## Schritt 3 — Konten hinzufügen

Claude fragt dich nach deiner E-Mail-Adresse und öffnet den Browser. Einmal pro Konto,
so oft du willst.

Pro Konto:

1. **E-Mail-Adresse** nennen.
2. **Vorher im Browser bei Google abmelden.** Sonst nimmt Google stillschweigend das
   Konto, mit dem du gerade angemeldet bist. Das Programm merkt es und lehnt ab, aber
   abgemeldet zu starten spart dir die Runde.
3. Der Browser öffnet sich. **Genau die Adresse auswählen**, die du genannt hast —
   notfalls über „Anderes Konto verwenden".
4. Es erscheint: **„Google hat diese App nicht verifiziert."**
   **Das ist hier normal und eingeplant.** Über **Erweitert → Weiter zu …** fortfahren.
   Nicht abbrechen.
5. Zustimmen. Die Liste zeigt drei Berechtigungen, alle mit „ansehen" / „read".
6. Das Programm prüft danach selbst, **welches Konto tatsächlich geantwortet hat**.
   Passt es nicht, wird die Verbindung sofort wieder gelöst und dir gesagt, was los war.

Fertig. Für jedes weitere Konto sag Claude einfach: „Verbinde noch mein Konto …".

---

## Schritt 4 — nach 8 Tagen einmal prüfen

Das Programm erinnert dich von selbst daran. Wenn der Hinweis kommt: **ja** sagen.

**Warum:** Ist im Google-Cloud-Projekt etwas falsch eingestellt, funktioniert erst alles —
und Google kappt den Zugang nach genau 7 Tagen, lautlos. Eine Prüfung am ersten Tag
beweist deshalb nichts. Erst eine erfolgreiche Prüfung **nach** dem achten Tag zeigt, dass
es hält. Danach fragt das Programm nicht mehr.

---

## Was du danach hast

Alles liegt unter `~/.gws-connect/` in deinem Benutzerordner. Pro Konto gibt es dort
einen Befehl unter `bin/`; Claude nutzt ihn, um in genau diesem Konto zu lesen.

Frag Claude einfach nach deinen Mails, Dateien und Terminen.

Das Menü mit Übersicht, Zugangsprüfung und „Konto entfernen" startest du mit
`~/.gws-connect/gws-connect` (Mac) bzw. `%USERPROFILE%\.gws-connect\gws-connect.cmd`
(Windows) — oder du bittest Claude darum.

---

## Aktualisieren

Denselben Satz aus Schritt 1 noch einmal in Claude einfügen. Deine Konten bleiben
erhalten.

---

## Ohne Claude

Öffne **Terminal** (Mac) bzw. **PowerShell** (Windows), füge die eine Zeile für dein
System aus
[INSTALL.md](https://github.com/chrisTeclead/gws-connect/releases/latest/download/INSTALL.md)
ein und drücke Enter. Starte danach `~/.gws-connect/gws-connect` (Mac) bzw.
`%USERPROFILE%\.gws-connect\gws-connect.cmd` (Windows) — das Menü fragt zuerst nach dem
Einrichtungs-Code.

---

## Wenn etwas nicht geht

Erst im Menü **Umgebung prüfen** — der Punkt sagt konkret, was fehlt.
Dann [PROBLEME.md](PROBLEME.md).

Und: **nichts raten und nichts anderes umstellen.** Ein falsch gesetzter Schalter fällt
erst nach einer Woche auf, und dann ist die Ursache schwer zu finden. Lieber melden.
