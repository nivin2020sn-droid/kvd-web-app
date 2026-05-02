# Reinigung Aufgabenverwaltung — Product Requirements (v1.3)

## Zweck
Android-App zur Verwaltung täglicher Reinigungsaufgaben zwischen zwei Geräten:
1. **Admin (Telefon)** — passwortgeschützt (Standard `admin123`)
2. **Tablet (Wandanzeige)** — öffentliche Anzeige, Statusänderungen per Tap

## Offline-First Architektur (v1.3 — NEU)

### Kernprinzipien
- App **startet immer innerhalb 3 Sekunden** — hartes Timeout in `app/_layout.tsx`
- **Kein Aufhängen am Splash** — auch ohne Server
- **Zwei Ausführungspfade** in einer einzigen `api()`-Funktion:
  - **Online**: `serverConfig` ist gesetzt → echter `fetch` mit 5s Timeout, optional `X-API-Key`
  - **Offline**: keine Config → `localHandler` (in `localStore.ts`) liest/schreibt AsyncStorage
- **Persistenz**: alle Daten in AsyncStorage (überleben Update & Neustart)
  - Keys: `local_tasks_v1`, `local_task_types_v1`, `local_houses_v1`, `local_stations_v1`, `local_persons_v1`, `local_settings_v1`, `local_password_v1`, `server_config_v1`

### Server-Einstellungen (neue Seite `/admin/server`)
- **Server URL**: Basis-URL (muss mit `http://` oder `https://` beginnen)
- **API Base URL** (readonly, auto): `<url>/api`
- **WebSocket URL** (readonly, auto): `ws(s)://<url>/api/ws`
- **API Key** (optional): als `X-API-Key` Header gesendet
- Aktionen:
  - **Verbindung testen** → `GET /api/update-info` mit 5s Timeout → ✅ Verbunden / ❌ Keine Verbindung
  - **Speichern** → leere URL = Offline-Modus · gültige URL = Online
  - **Zurücksetzen** → Bestätigungsdialog → Config löschen → Offline

### Online-Indikator
- **Admin-Dashboard**: Pillen-Banner oben — grün „Online · Server verbunden" oder orange „Offline-Modus · Lokale Daten" + Button `Server`
- **Tablet-Header**: orange Pillen-Badge „Offline Modus" (nur wenn offline)
- **Realtime**: bei Config-Änderung werden beide Views per `subscribeServerConfig()` sofort aktualisiert — WebSocket reconnectet automatisch

## Status-Labels (Deutsch)
| Intern | Anzeige | Dot-Farbe |
|---|---|---|
| pending | Neu | blau `#3B82F6` |
| accepted | Angenommen | orange `#FF9500` |
| finished | Erledigt | grün `#00E676` |
| cannot_accept | Nicht annehmbar | dunkelrot `#991B1B` |
| not_finished | Nicht beendbar | dunkelrot `#991B1B` |
| not_done | Nicht erledigt | rot `#FF3B30` |

## Admin-Funktionen
- Login (Standard-Passwort `admin123`, änderbar unter Einstellungen)
- Aufgabe erstellen / Listen verwalten / Archiv anzeigen
- Tasks-Karte zeigt Timestamps (Angenommen / Erledigt) + Gründe
- Einstellungen: Logo, Hintergrund, Passwort, **App-Version + Update-Check**
- **Server-Einstellungen** (neu): Online/Offline-Verwaltung

## Tablet-Funktionen
- Zwei-Zeilen-Header: Logo · (PLAN HEUTE + Datum + Uhrzeit + Offline-Badge wenn anwendbar)
- Glass-Karten mit Status-Dot + German-Label
- 5 Glass-Pillen-Buttons: Annehmen / Beenden / Nicht annehmbar / Nicht beendbar / Nicht erledigt
- Grund-Modal bei „Nicht …"-Aktionen
- Dunkler Overlay `rgba(0,0,0,0.70)` über Hintergrundbildern für Lesbarkeit

## Tech Stack
- **Backend**: FastAPI + Motor (MongoDB) + APScheduler + WebSocket (optional)
- **Frontend**: Expo Router (RN 0.81 / Expo SDK 54), AsyncStorage, expo-image-picker
- **Sprache**: 100% Deutsch

## Build & Deployment
- `.github/workflows/build-android.yml` — automatischer APK-Build bei jedem Push auf `main`
- Debug APK + Release APK in GitHub Actions Artifacts (30 Tage)
- `APP_VERSION` in `src/lib/version.ts`, `update.json` im Backend für Update-Check
