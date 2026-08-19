# Für den Betreiber — das gemeinsame Cloud-Projekt

Einmalig, etwa 15 Minuten. Danach erzeugst du pro Person nur noch einen
Einrichtungs-Code — oder gibst allen denselben.

**Ohne diese Einstellungen funktioniert nichts.** Sie sind die Voraussetzung, nicht eine
Empfehlung.

---

## Die Regel, an der alles hängt

`Internal` als Audience gibt es nur, wenn das Projekt in derselben Workspace-Organisation
liegt wie das Konto, das sich anmeldet. Ein privates `@gmail.com`-Konto hat keine
Organisation; ein Kollege mit einer anderen Firmendomain auch nicht *deiner*.

Ein Projekt, das **beliebige** Kontotypen bedienen soll, muss deshalb auf **`External`**
stehen — und dann ist der Publishing-Status entscheidend:

| Publishing-Status | Folge |
|---|---|
| `Testing` | funktioniert, und Google kappt den Zugang nach **7 Tagen**, lautlos |
| **`In production`** | Refresh-Token gilt unbefristet, auch ohne Verifizierung |

Das ist der ganze Unterschied zwischen dauerhaft und einer Woche.

---

## Einrichtung

### 1. Projekt anlegen

[console.cloud.google.com](https://console.cloud.google.com) → Projektauswahl oben links →
**Neues Projekt**. Warten, bis es oben ausgewählt ist. Alles Weitere gilt immer für das
Projekt, das oben links steht.

Kein Abrechnungskonto nötig — Gmail, Drive und Calendar API sind kostenlos.

### 2. Drei APIs aktivieren

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

Steht dort **Verwalten** statt Aktivieren, ist es schon an.

### 3. Audience auf `External`

**Google Auth Platform → Zielgruppe** (in älteren Ansichten:
*APIs und Dienste → OAuth-Zustimmungsbildschirm*)

- App-Name: etwas, das die Nutzer im Zustimmungsfenster wiedererkennen
- Support-E-Mail und Kontaktadresse: deine
- Zielgruppe: **`External`**

### 4. Scopes eintragen

**Datenzugriff → Bereiche hinzufügen oder entfernen.** Genau diese drei, alle lesend:

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/calendar.readonly
```

Taucht ein Eintrag ohne `readonly` auf, ist es der falsche.

### 5. Publishing-Status auf `In production`

**Zielgruppe → App veröffentlichen** → bestätigen. Danach muss dort **`In production`**
stehen, nicht `Testing`.

Google bietet danach eine **Verifizierung** an oder mahnt sie an. Die ist nicht
erforderlich. Ohne sie erscheint bei jedem Anmelden dauerhaft „Google hat diese App nicht
verifiziert" — das wird über *Erweitert → Weiter zu …* durchgeklickt.

### 6. OAuth-Client anlegen

**APIs und Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**

- Anwendungstyp: **Desktop-App**
- Client-ID und Client-Secret erscheinen; später jederzeit wieder abrufbar

### 7. Einrichtungs-Code erzeugen

```bash
node tools/make-setup-code.mjs \
  --id default \
  --label "Mein Team" \
  --audience external \
  --client-id "<CLIENT_ID>" \
  --client-secret "<CLIENT_SECRET>"
```

Ergebnis ist eine Zeile, die mit `GWSC1.` beginnt. **Über einen Passwortmanager teilen,
nie per Mail oder Chat.** Wer den Code hat, kann als dieser OAuth-Client auftreten.

---

## Prüfliste vor der Übergabe

- [ ] Gmail, Drive und Calendar API sind aktiv
- [ ] Audience steht auf **`External`**
- [ ] Die drei `readonly`-Scopes sind eingetragen
- [ ] Publishing-Status steht auf **`In production`** — nicht `Testing`
- [ ] Ein OAuth-Client vom Typ **Desktop-App** existiert
- [ ] Der Einrichtungs-Code liegt im Passwortmanager, nicht in einer Mail

---

## Was du im Blick behalten musst

**Nutzerobergrenze 100.** Eine unverifizierte `External`-App darf maximal **100**
verschiedene Google-Konten bedienen. Gezählt wird pro Konto, das zugestimmt hat — zehn
Kollegen mit je drei Konten sind 30 von 100. Kommt ihr in die Nähe, brauchst du ein zweites
Projekt oder die Google-Verifizierung.

**Der Publishing-Status ist jetzt ein gemeinsames Risiko.** Fällt er zurück auf `Testing`,
sterben **alle** Zugänge gleichzeitig und ohne Meldung. Prüfe ihn, wenn mehrere Leute
gleichzeitig Probleme melden.

**Fremde Workspace-Administratoren können die App sperren.** Ein Kollege, dessen Firma
unverifizierte Drittanbieter-Apps blockiert, kommt mit deinem Code nicht durch. Für den
Fall gibt es [EIGENES-PROJEKT.md](EIGENES-PROJEKT.md).

**Ehrlich gesagt:** eine unverifizierte App mit Gmail-Lesezugriff ist ein Graubereich, den
Google toleriert, aber nicht garantiert. Das gilt jetzt für alle, denen du den Code gibst —
nicht mehr nur für einen Einzelfall. Wenn das für euren Anwendungsfall nicht tragbar ist,
ist die Google-Verifizierung der saubere Weg.

---

## Was du nicht selbst prüfen kannst

Die Anmeldungen liegen auf den Rechnern der Nutzer, nicht bei dir. Ob eine Einrichtung
funktioniert, zeigt nur `gws-connect verify` dort. Was du prüfen kannst, ist alles in
Abschnitt „Prüfliste" — und das reicht, um die häufigen Fehler auszuschließen.
