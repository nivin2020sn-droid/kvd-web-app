# Android APK Build (GitHub Actions)

Diese Workflow-Konfiguration baut bei jedem Push auf `main` automatisch:

- **Debug APK** (zum schnellen Installieren auf Test-Geräten)
- **Release APK** (signiert mit auto-generiertem Keystore)

## Wo finde ich die APKs?

1. Öffnen Sie das GitHub-Repository
2. Klicken Sie auf den Tab **Actions**
3. Wählen Sie den letzten Workflow-Run **„Build Android APK"**
4. Scrollen Sie nach unten zu **Artifacts**
5. Laden Sie herunter:
   - `cleaning-app-debug-<sha>` → enthält `app-debug.apk`
   - `cleaning-app-release-<sha>` → enthält `app-release.apk`

## Wann startet der Build?

| Trigger | Beschreibung |
|---------|--------------|
| `push` auf `main` | Automatisch bei jedem Commit/Merge |
| `pull_request` auf `main` | Automatisch bei jedem PR |
| `workflow_dispatch` | Manuell über den **Run workflow**-Button im Actions-Tab |

## Build-Dauer

Erste Ausführung: ca. **15–25 Min** (Gradle-Download + erstmaliger Build).
Folge-Builds (mit Cache): ca. **8–12 Min**.

## Hinweise

- Der **Release-Keystore wird bei jedem Build neu generiert**. Für Play-Store-Releases müssen Sie einen festen Keystore via GitHub Secrets einrichten — für interne Verteilung (Wand-Tablet, eigene Geräte) reicht der Auto-Keystore.
- Aufbewahrung der Artifacts: **30 Tage** (kann in der Workflow-Datei angepasst werden).
- Der Workflow benötigt **keine Expo-Account-Anmeldung** und nutzt **kein EAS Build** — alles läuft lokal in GitHub Actions.

## Update-Workflow für die App

Wenn Sie eine neue Version pushen:

1. Erhöhen Sie `APP_VERSION` in `frontend/src/lib/version.ts` (z. B. `"1.0.1"`)
2. Aktualisieren Sie `backend/data/update.json` mit der neuen Version + dem Download-Link der neuen APK
3. Push auf `main` → GitHub Actions baut die neue APK
4. Laden Sie die neue APK aus den Artifacts oder verlinken Sie sie in `update.json` (z. B. via Release-Tag)
5. Auf dem Tablet/Telefon zeigt der Button **„Nach Updates suchen"** in den Einstellungen die neue Version an
