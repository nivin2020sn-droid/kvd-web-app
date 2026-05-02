# Reinigung Aufgabenverwaltung — Product Requirements

## Zweck
Einfache Android-App zur Verwaltung täglicher Reinigungsaufgaben zwischen zwei Geräten:
1. **Admin (Telefon)** — erstellt und verwaltet Aufgaben, Listen und Einstellungen.
2. **Tablet (Wandanzeige)** — zeigt die heutigen Aufgaben und erlaubt Statusänderungen per Tap.

Keine Mitarbeiter-Konten. Nur ein einfaches Admin-Passwort.

## Design-Prinzipien (v1.1)
- **Tablet-Karten**: Glassmorphism-Stil (halbtransparentes Dunkel, abgerundete Ecken, dezenter Rahmen). Farbe des Kartens ändert sich **nicht** je Status.
- **Status-Anzeige**: kleiner Farb-Dot + deutscher Text in Pillen-Form in der oberen rechten Ecke jeder Karte.
- **Aktions-Buttons**: Glass-Pillen (klein, transparent, dünner Rahmen, farbiger Dot als Präfix). Keine großen farbigen Buttons.

## Status-Labels (Deutsch) — v1.2
| Intern | Anzeige | Dot-Farbe |
|---|---|---|
| pending | Neu | blau `#3B82F6` |
| accepted | Angenommen | orange `#FF9500` |
| finished | Erledigt | grün `#00E676` |
| cannot_accept | Nicht annehmbar | dunkelrot `#991B1B` |
| not_finished | Nicht beendbar | dunkelrot `#991B1B` |
| not_done | Nicht erledigt | rot `#FF3B30` |

## Tablet-Header (v1.2)
- Zeile 1: Logo (links) + Exit-Button (rechts)
- Zeile 2: **PLAN HEUTE** (bold, groß) · Datum (mittel) · Uhrzeit (kleiner, rechts)
- Dunkler Overlay `rgba(0,0,0,0.70)` über jedem Hintergrundbild → optimale Lesbarkeit
- Aufgaben-Karten: semi-solide `rgba(15,15,18,0.88)` mit dünnem Rand + Shadow

## Admin-Karte (v1.2)
Zeigt pro Aufgabe:
- Typ · Haus / Station · Beschreibung · Personen · Zeitraum
- Status-Badge
- **Angenommen um HH:MM** (grün) — falls akzeptiert
- **Erledigt um HH:MM** (grün) — falls beendet
- Grund-Zeile(n) — falls „Nicht …"-Status

## Admin-Funktionen
- Geräte-Auswahl → Admin-Login (Standard `admin123`)
- Aufgabe erstellen (Typ / Haus / Station / Beschreibung / Personen / Zeit)
- Listen verwalten (alle 4 Kategorien mit `+ Add`)
- Heute-Übersicht mit manueller "Heute jetzt archivieren"
- Archiv-Seite (tagesweise)
- Einstellungen: Logo, Hintergrund (8 Voreinstellungen + Galerie), Passwort ändern
- **App-Update Section** (neu v1.1):
  - Anzeige `Aktuelle Version` (statisch aus `/app/frontend/src/lib/version.ts`)
  - Button `Nach Updates suchen` → fetched `/api/update-info`
  - Bei neuerer Version: `Neueste Version` in gelb + Änderungen-Box + `UPDATE HERUNTERLADEN` Button
  - Bestätigungsdialog erinnert Nutzer: Daten (Aufgaben, Archiv, Listen, Einstellungen) bleiben erhalten
  - Hinweis: Alle Daten liegen auf dem Server (MongoDB) — Neuinstallation der APK wischt nur das lokale Admin-Token

## Tablet-Funktionen
Pro Aufgaben-Karte 5 Glass-Aktions-Pillen: **Annehmen**, **Beenden**, **Nicht annehmbar**, **Nicht beendbar**, **Nicht erledigt**. Bei den drei "Nicht …" öffnet ein Grund-Modal.

## Echtzeit
WebSocket `/api/ws` — Broadcast bei jeder Änderung.

## Archivierung
- Automatisch täglich 00:00 UTC (APScheduler)
- Manuell über Admin-Button
- Aufgaben werden nie gelöscht, nur archiviert

## Update-System
- Backend-Datei `/app/backend/data/update.json` (editierbar, hot-reload):
  ```json
  { "latest_version": "1.0.0", "download_url": "", "changelog": "", "mandatory": false }
  ```
- Endpoint `GET /api/update-info` liest die Datei bei jedem Request.
- Admin kann jederzeit die Datei anpassen (neue APK-URL, Changelog) und die App holt sich die Info.
- Client vergleicht Semver (`1.2.0` > `1.1.3`) und zeigt bei Bedarf den Download-Button.

## Tech Stack
- Backend: FastAPI + Motor (MongoDB) + APScheduler + WebSocket
- Frontend: Expo Router (React Native 0.81 / Expo SDK 54) + AsyncStorage + expo-image-picker
- Sprache: 100% Deutsch

## Standardpasswort
`admin123` (in Einstellungen änderbar).
