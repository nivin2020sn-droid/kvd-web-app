# Android APK Build (GitHub Actions)

Diese Workflow-Konfiguration baut bei jedem Push auf `main` automatisch eine
**Debug APK** für Android.

## Wo finde ich die APK?

1. Öffnen Sie das GitHub-Repository
2. Klicken Sie auf den Tab **Actions**
3. Wählen Sie den letzten Workflow-Run **„Build Android APK"**
4. Scrollen Sie zu **Artifacts** und laden Sie herunter:
   - `cleaning-app-debug-<sha>` → enthält `app-debug.apk`

## Warum nur Debug APK?

Die Release-Variante wurde **vorübergehend deaktiviert**, um:

- Speicher-Engpässe auf GitHub-Runnern zu vermeiden (`No space left on device`)
- Build-Zeit zu halbieren (~15 Min statt ~30 Min)
- Schnelleres Feedback bei jedem Push

Die **Debug APK** ist für alle internen Einsatzzwecke geeignet:
- ✅ Auf eigenen Geräten installierbar
- ✅ Voll funktionsfähig (Offline-Modus, Online-Modus, Server-Einstellungen)
- ✅ Mit dem Debug-Keystore signiert (keine Konfiguration nötig)
- ⚠️ Nur Nachteil: Etwa 20 % größer als ein Release-Build (durch fehlendes Minify)

Wenn später eine Release-Version benötigt wird (z. B. für Play Store), kann
der entsprechende Block im Workflow wieder aktiviert werden.

## Speicher-Optimierungen im Workflow

Zur Vermeidung von `No space left on device` werden vor dem Build folgende
nicht benötigte Tools vom Runner entfernt (~10 GB frei):

- `/usr/share/dotnet` (~1.6 GB)
- `/opt/ghc` (Haskell ~5.6 GB)
- `/usr/local/share/boost`, `powershell`, `chromium`
- Alte Docker-Images
- Azure/Microsoft-Tools

Außerdem werden nach dem Build temporäre Gradle-Caches entfernt.

## Wann startet der Build?

| Trigger | Beschreibung |
|---------|--------------|
| `push` auf `main` | Automatisch bei jedem Commit |
| `pull_request` auf `main` | Automatisch bei jedem PR |
| `workflow_dispatch` | Manuell über den **Run workflow**-Button |

## Build-Dauer

- Erste Ausführung: ca. **12–18 Min** (Gradle-Download + erstmaliger Build)
- Folge-Builds: ca. **8–12 Min**

## Update-Workflow für die App

1. Erhöhen Sie `APP_VERSION` in `frontend/src/lib/version.ts` (z. B. `"1.0.1"`)
2. Aktualisieren Sie `backend/data/update.json` mit `latest_version` und
   `download_url` (Link zur neuen APK)
3. Push auf `main` → GitHub Actions baut die neue APK
4. Auf dem Tablet/Telefon zeigt **Einstellungen → Nach Updates suchen**
   automatisch die neue Version mit Download-Button an
5. **Daten bleiben erhalten** (lokaler AsyncStorage + ggf. Server)
