# Eigenes Cloud-Projekt anlegen

**Das brauchst du nur in zwei Fällen:**

1. Ein Workspace-Administrator sperrt die vorbereitete App. Erkennbar an
   `access_denied` oder „Diese App wurde von deinem Administrator blockiert".
2. Die Nutzerobergrenze von 100 ist erreicht.

Sonst überspringe dieses Blatt — der Einrichtungs-Code reicht.

Einmalig, etwa 15 Minuten. Es sind nur Formulare, und du kannst nichts kaputt machen: es
wird ausschließlich etwas Neues angelegt, nichts Bestehendes geändert.

---

## Erst klären: welcher Fall bist du?

| Dein Konto | Audience | Damit es dauerhaft gilt |
|---|---|---|
| Firmenkonto einer Google-Workspace-Domain | **`Internal`** | reicht allein |
| privates `@gmail.com` | **`External`** (Zwang) | Publishing-Status **`In production`** |

**Das Projekt muss in dem Konto angelegt werden, um das es geht.** Also vorher oben rechts
auf das Profilbild klicken und prüfen, dass dort die richtige Adresse steht. Zwei Projekte
für zwei Konten im selben Login anzulegen ist der häufigste Fehler und macht `Internal`
unmöglich.

---

## 1. Cloud Console öffnen

[console.cloud.google.com](https://console.cloud.google.com)

Beim ersten Mal fragt Google nach **Land** und den **Nutzungsbedingungen** — bestätigen.

> Falls nach einem **Abrechnungskonto** oder einer Kreditkarte gefragt wird:
> **überspringen.** Was wir brauchen, ist kostenlos. Nichts hinterlegen.

## 2. Projekt anlegen

Oben links auf die Projektauswahl → **Neues Projekt** → Name, z. B. `gws-connect`.
**Erstellen**, dann warten, bis das Projekt oben ausgewählt ist.

Wichtig: alles Weitere gilt immer für das Projekt, das oben links steht.

## 3. Drei APIs aktivieren

Der Reihe nach öffnen und jeweils **Aktivieren**:

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

Steht dort schon **Verwalten**, ist es bereits an.

## 4. Zielgruppe festlegen

**Google Auth Platform → Zielgruppe**

- App-Name: z. B. `gws-connect`
- Support-E-Mail: deine Adresse
- Zielgruppe: **`Internal`** beim Firmenkonto, **`External`** beim privaten Konto

> **„Intern" ist ausgegraut?** Dann ist das Konto kein Workspace-Konto. Bei einem privaten
> Konto ist das richtig so — nimm `External` und mach bei Schritt 5 weiter.
> Bei einem Firmenkonto bedeutet es, dass du im falschen Login bist. Abmelden, mit dem
> richtigen Konto anmelden, ab Schritt 2 neu.

**Bei `Internal` bist du hier fertig** — keine Scope-Liste, keine Veröffentlichung, keine
Prüfung durch Google. Weiter mit Schritt 7.

## 5. Nur bei `External`: Scopes eintragen

**Datenzugriff → Bereiche hinzufügen oder entfernen.** Ins Filterfeld tippen, Häkchen
setzen:

```
gmail.readonly
drive.readonly
calendar.readonly
```

**Aktualisieren**, dann **Speichern**. Alle drei enthalten `readonly` — nur lesen. Taucht
ein Eintrag ohne `readonly` auf, ist es der falsche.

## 6. Nur bei `External`: App veröffentlichen

**Zielgruppe → App veröffentlichen** → bestätigen. Danach muss dort **„In Produktion"**
stehen, nicht „Testphase".

**Warum das der wichtigste Klick ist:** bleibt es auf „Testphase", funktioniert erst alles —
und Google kappt den Zugang nach genau 7 Tagen. Der Fehler fällt dann auf, wenn niemand
mehr daran denkt.

Google bietet danach eine **Verifizierung** an. Die brauchen wir nicht. Folge: beim
Anmelden erscheint „Google hat diese App nicht verifiziert" — eingeplant, wird über
*Erweitert → Weiter zu …* durchgeklickt.

## 7. Zugangsdaten erzeugen

**APIs und Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**

- Anwendungstyp: **Desktop-App**
- **Erstellen**

Es erscheint ein Fenster mit **Client-ID** und **Client-Schlüssel**. Offen lassen.

> Zumachen ist kein Problem: über **Anmeldedaten** → Klick auf den Client kommst du
> jederzeit wieder an beide Werte.

## 8. In gws-connect eintragen

Programm starten, Menüpunkt **6 (Eigenes Cloud-Projekt hinzufügen)** →
**Client-ID und Secret einzeln**.

- Name: etwas Wiedererkennbares, z. B. `firma`
- Client-ID einfügen
- Client-Secret einfügen — **du siehst dabei nichts**, das ist Absicht
- Audience: `Internal` oder `External`, wie oben gewählt

Danach Menüpunkt **1 (Konto hinzufügen)**. Jetzt fragt das Programm, welche Zugangsdaten
verwendet werden sollen — dein neues Projekt auswählen.

---

## Wenn etwas nicht passt

Nichts raten und nichts anderes umstellen — melden. Häufige Stolpersteine:

- **Oben links steht ein anderes Projekt** → umschalten, Schritt wiederholen
- **„Intern" ausgegraut** → siehe Schritt 4
- **Nach Kreditkarte gefragt** → nichts hinterlegen, siehe Schritt 1
- **Zugang nach 7 Tagen weg** → Publishing-Status stand auf „Testphase", siehe Schritt 6

Sonst: [PROBLEME.md](PROBLEME.md).
