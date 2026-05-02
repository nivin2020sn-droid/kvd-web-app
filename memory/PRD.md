# Reinigung Aufgabenverwaltung — Product Requirements

## Zweck
Einfache Android-App zur Verwaltung täglicher Reinigungsaufgaben zwischen zwei Geräten:
1. **Admin (Telefon)** — erstellt und verwaltet Aufgaben, Listen und Einstellungen.
2. **Tablet (Wandanzeige)** — zeigt die heutigen Aufgaben und erlaubt Statusänderungen per Tap.

Keine Mitarbeiter-Konten. Nur ein einfaches Admin-Passwort.

## Geräte-Auswahl (Startbildschirm)
- ADMIN → Login mit Passwort
- TABLET → öffentliche Wandanzeige (kein Login)

## Admin-Funktionen
- **Aufgabe erstellen**: Aufgabentyp, Haus, Station, Beschreibung, Personen (mehrere), Zeit von/bis. Jede Liste hat einen "Add"-Button für neue Einträge.
- **Listen verwalten**: Aufgabentypen, Häuser, Stationen, Personen hinzufügen/löschen.
- **Heute-Übersicht**: alle aktiven Aufgaben mit Statusbadges.
- **Manuelles Archivieren**: "HEUTE JETZT ARCHIVIEREN".
- **Archiv**: tagesweise Ansicht aller alten Aufgaben.
- **Einstellungen**: Logo (Galerie), Hintergrund (Voreinstellungen oder Galerie-Bild), Passwort ändern.

## Tablet-Funktionen
Pro Aufgabe fünf Aktions-Buttons mit Statusänderung & Farbe:
| Button | Status | Farbe | Verhalten |
|---|---|---|---|
| ANNEHMEN | accepted | Gelb | Zeitstempel `accepted_at` |
| NICHT ANNEHMBAR | cannot_accept | Orange | Grund-Eingabe |
| NICHT BEENDET | not_finished | Orange | Grund-Eingabe |
| BEENDEN | finished | Grün | Zeitstempel `finished_at` |
| NICHT ERLEDIGT | not_done | Rot | Grund-Eingabe |

## Echtzeit
WebSocket `/api/ws` — broadcast bei jeder Änderung (`tasks_updated`, `*_updated`, `settings_updated`). Kein Polling.

## Archivierung
- **Automatisch**: APScheduler Cronjob 00:00 UTC archiviert alle nicht-archivierten Aufgaben.
- **Manuell**: Admin-Button.
- Aufgaben werden nie gelöscht, nur archiviert (`archived: true` + `archive_date`).

## Sprache
100% Deutsch.

## Standardpasswort
`admin123` (in Einstellungen änderbar).

## Tech Stack
- Backend: FastAPI + Motor (MongoDB) + APScheduler
- Frontend: Expo Router (React Native) + AsyncStorage + expo-image-picker
- Echtzeit: native WebSocket
