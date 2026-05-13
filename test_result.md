#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Convert the existing Reinigung (cleaning) Android/Expo app into a fully functional
  Web App / PWA with 100% German UI, Glassmorphism design, offline-first mode
  (localStorage), Admin + Tablet + Server-Settings flows, and ability to point
  to a remote backend.

frontend:
  - task: "PWA Migration - Vite + React + Tailwind scaffold"
    implemented: true
    working: true
    file: "/app/web"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Vite dev server running on port 3000 via supervisor (program:expo). Manifest + icons configured. PWA installable."

  - task: "German UI - Landing/Admin/Tablet/Server"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "All screens render in German, Glassmorphism dark theme. Verified via screenshot tool: Landing, Admin Login, Admin Home, Create Task, Tablet view."

  - task: "Offline-first via localStorage"
    implemented: true
    working: true
    file: "/app/web/src/lib/localStore.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Offline mode is now the default. Login admin123 works, task CRUD via local store. Server can be configured later under /admin/server."

  - task: "Timeline entry (Mitarbeiter) – Tablet button + modal"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx, /app/web/src/lib/workflow.ts, /app/server-node/src/server.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Wired up the already-existing addTimelineEntry helper and the /workflows/:id/timeline
          Node backend endpoint to a real UI button. On every task card in /tablet there is now a
          full-width purple "TIMELINE" button. Tapping it opens a modal asking for HH:MM time
          (defaulted to now) and a note, with a clear info banner explaining the entry is purely
          informational and does NOT change status, Arbeitszeit or Pause-Zeit. Entries are stored
          with type=timeline, ts (ISO), note, task_name, created_by='Mitarbeiter'. Verified e2e:
          saved a timeline entry, task status stayed "Bereit", Arbeitszeit stayed 00:00:00,
          and the entry appears in "Verlauf · Notizen" in both Tablet and Admin views with
          a light purple (#C084FC) color distinct from Vorbereiten/Starten/Pause/Beenden.

  - task: "Drucken (Print) – Admin per-task report"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx, /app/web/src/lib/printReport.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Fully redesigned the print layout. Now a professional A4 report: pure black on white,
          @media print isolation, @page A4 margins, zero dark backgrounds, no shadows, minimal
          borders. Header: big task title on the left + worker name subtitle, right side shows
          Datum (big), time range, and a clean STATUS pill. One table for Aufgaben-Informationen
          (Datum, Aufgabentyp, Haus, Station, Mitarbeiter, Beschreibung, Zeit von/bis, Status,
          Gesamt-Arbeitszeit, Pause-Zeit). Second table for Verlauf & Timeline with exactly the
          user-specified column widths: Typ (120px fixed) | Zeit (160px fixed, tabular-nums) |
          Notiz (auto/flex, white-space:normal, word-break:break-word, overflow-wrap:break-word,
          hyphens:auto, padding 10-12px, line-height 1.5). Events chronologically sorted,
          Timeline and Workflow events merged. Page-break-inside:avoid on rows, page-break
          repeated thead for multi-page. Verified visually via screenshot analysis.

  - task: "PDF herunterladen – direct client-side PDF generation"
    implemented: true
    working: true
    file: "/app/web/src/lib/pdfReport.ts, /app/web/src/App.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Green "PDF HERUNTERLADEN" button in every Admin task card (AdminHome + AdminArchive).
          Uses jsPDF 4.2.1 + jspdf-autotable. A4 portrait, automatic multi-page pagination,
          repeated table header. Filename: Aufgabe_<YYYY-MM-DD>_<Aufgabentyp>.pdf.

  - task: "Feierabend – Task deferral to next day"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx, /app/web/src/lib/workflow.ts, /app/server-node/src/server.js, /app/web/src/lib/printReport.ts, /app/web/src/lib/pdfReport.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          New feature: indigo "FEIERABEND" button (5th button) in every Tablet task card,
          sitting in a new row next to TIMELINE. Behaviour:
          - On click: opens standard NoteModal → on BESTÄTIGEN, closes the currently running
            segment (like Pause), records a `feierabend` event, sets status to `deferred`
            ("Wird morgen fortgesetzt"), and advances the task's task_date to tomorrow so
            it disappears from today's Tablet list and reappears in the next day's list.
          - Node backend endpoint /workflows/:id/event now handles type='feierabend' and
            updates the task_date atomically with the workflow; broadcasts tasks_updated + workflow_updated.
          - Offline mode mirrors this: the task_date in local_tasks_v1 gets bumped locally.

          Resume next day: the status `deferred` enables Starten AND Fortsetzen buttons
          (new allowedActions rules). On Fortsetzen a new segment is opened in the new day.
          Beenden is also available to finish a deferred task directly.

          Per-event persons snapshot: every workflow event now carries a `persons` array
          (current task.person_ids at time of event) → used to derive who worked on which
          day even when admin changes the task's person_ids between days.

          New helper `buildDailyBreakdown(wf)` returns an array of DaySection objects with
          {date, persons[], events[], workMs, pauseMs, started_at, feierabend_at, finished_at}.
          Segments are trimmed to day bounds so each day reports its own arbeitszeit/pause
          independently. Overnight Feierabend → Fortsetzen gaps are correctly excluded from
          pause totals (totalPauseMs now checks for feierabend event-timestamps).

          Admin UI: new DailyBreakdownView component replaces the flat EventHistoryList in
          AdminHome + AdminArchive when the task spans >1 day. Shows one card per day with
          day tag ("TAG 1", "TAG 2", ...), localized date, KPI chips (Arbeitszeit/Pause),
          Mitarbeiter pills, and the day's events. A Gesamt summary block sits below.

          Print report: when multi-day, renders boxed day sections with KPIs and per-day
          Mitarbeiter + event tables, each self-contained.

          PDF: when multi-day, renders a TAG N box (grey fill + date, Arbeitszeit, Pause-Zeit,
          Mitarbeiter line), followed by that day's event table. Each day can span multiple
          PDF pages; header repeats.

          Verified end-to-end with a realistic 2-day scenario (Roberto+Bahaa on Day 1,
          Anna on Day 2). PDF + Admin view both correctly show per-day totals
          (Day1 07:15 work / 00:45 pause, Day2 02:00 work / 00:00 pause) and Gesamt totals
          (09:15 work / 00:45 pause — overnight gap NOT counted).

          Backend zip (server-node) rebuilt at /app/web/public/downloads/kvd-backend.zip.

  - task: "Remote backend integration (kvd-backend.onrender.com)"
    implemented: true
    working: false
    file: "/app/web/src/lib/api.ts"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: false
        agent: "main"
        comment: "User-provided Render server (https://kvd-backend.onrender.com) is reachable but uses an INCOMPATIBLE schema. Only /api/health and /api/tasks (with `title` field) exist. Required endpoints (/api/admin/login, /api/houses, /api/persons, /api/stations, /api/task-types, /api/settings, /api/tasks/today, /api/tasks/archive, /api/tasks/archive-now, /api/update-info, WebSocket /api/ws) all return 'Route not found'. App falls back to offline mode automatically. User must either deploy a compatible backend or continue offline-only."

backend:
  - task: "Local FastAPI backend (kept available)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Local backend still running on :8001 with full schema. Not used by PWA by default but available if user wants to point app at it."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "PWA Migration - Vite + React + Tailwind scaffold"
    - "German UI - Landing/Admin/Tablet/Server"
    - "Offline-first via localStorage"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Pivot complete: Expo project archived (moved to /tmp). Vite + React PWA running on port 3000.
      All UI text in German, Glassmorphism design preserved. Default mode is offline (localStorage).
      Discovered the user's Render backend at kvd-backend.onrender.com only exposes /api/health
      and /api/tasks (different schema) — incompatible with our app. Need user decision on backend.
  - agent: "main"
    message: |
      Mitarbeiter system completion (P0):
      - workflow.ts recordEvent now formats notes as
        `Bahaa hat den Status auf „Beendet" geändert` for status events
        (and appends ` — <user note>` if the user added one). For plain
        timeline notes the format remains `Bahaa: <note>`.
      - addTimelineEntry now auto-prefixes the Mitarbeiter name and uses it
        as `created_by` (instead of the generic literal "Mitarbeiter").
      - AdminCreate Personen field updated to make multi-select obvious:
        section label shows `· MEHRFACHAUSWAHL` and a green pill
        `N ausgewählt`; each chip carries a checkbox glyph; helper text
        explains the behaviour.
      - Tablet header already shows `Wechseln` action + green pill with
        the logged-in employee name (kept as-is).
      TypeScript compiles cleanly. Changes are frontend-only; the Node
      backend already accepts `actor` and the new note format is just a
      string, so no backend deploy is required.

  - agent: "main"
    message: |
      ===== HISTORICAL TASK ROLLOVER SYSTEM — COMPLETE OVERHAUL (P0) =====

      Implemented per user's 12-point spec. Key features:

      BACKEND (/app/server-node/src/server.js):
      - TaskSchema already had original_date, completed_date, rollover_log fields.
      - Added helpers: computeLiveDate(t), visitedDatesOf(t), nextVisitAfter(t,date),
        listTasksForDate(date). The last returns a mix of LIVE tasks + virtual
        STUBS for any day the task once visited but is no longer live on.
        Stubs carry _is_weitergeschoben=true, _weitergeschoben_auf, _current_live_date
        and status="weitergeschoben".
      - GET /api/tasks?date=, /api/tasks/by-date, /api/tasks/today refactored to
        use listTasksForDate(). Past days that once held a now-moved task now
        return a stub instead of nothing.
      - NEW endpoint POST /api/tasks/admin/rebuild-history (requireAdmin):
        idempotent. Patches missing original_date, completed_date and synthesises
        rollover_log entries when current live date diverges from original_date
        but log is empty. Returns { scanned, patched, changes[] }.
      - NEW endpoint POST /api/tasks/admin/collect-open — alias of existing
        /tasks/admin/rollover-open with the user-friendly name.
      - autoRolloverOpenTasks() unchanged: still appends rollover_log entries
        on each forward move (capped at last 50).

      FRONTEND (/app/web/src/App.tsx, /app/web/src/lib/types.ts):
      - Task interface extended with original_date, completed_date, rollover_log
        and the virtual stub fields _stub, _is_weitergeschoben,
        _weitergeschoben_auf, _current_live_date.
      - AdminHome task list now renders a compact purple dashed-border STUB
        card with "↪ WEITERGESCHOBEN AUF <date>" badge when t._is_weitergeschoben
        is true. No expand / no workflow controls.
      - Tablet task list renders an equivalent stub (theme-aware light/dark).
      - RolloverAdminSection split into two blocks:
          1. "OFFENE AUFGABEN EINSAMMELN" (existing).
          2. NEW "REBUILD TASK HISTORY" purple button calling
             /tasks/admin/rebuild-history. Confirm dialog explains the
             operation is non-destructive. Shows scanned/patched counts
             and per-task change details.

      DATABASE: full backup written to /app/backups/backup_<TS>/ before any
      change (mongodump of all DBs). No schema-breaking changes — all new
      fields are additive and optional.

      TESTING: ran end-to-end test (/tmp/test_rollover.sh) on isolated DB
      reinigung_test_rollover. All 12 assertions passed:
        1. Task created in the past
        2. Auto-rollover on querying today → moved successfully
        3. Past date now returns STUB with correct _weitergeschoben_auf
        4. rollover_log entries persisted correctly
        5. Finished task (Beenden) does NOT roll over
        6. completed_date locks the task to its completion day
        7. rebuild-history idempotent on clean data (0 patches)
        8. rebuild-history correctly synthesises a missing log entry
        9. collect-open alias returns same shape as rollover-open
       10-12. UI screenshot shows landing page renders cleanly (German UI).

      TypeScript (tsc --noEmit) compiles cleanly. Vite HMR applied edits
      without errors. NO_RESTART needed for frontend (Vite handles HMR).

frontend:
  - task: "Historical Task Rollover — Stub cards (Admin + Tablet)"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx, /app/web/src/lib/types.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Task interface extended with stub fields. Both AdminHome and Tablet
          views now render dashed-border purple "↪ WEITERGESCHOBEN AUF <date>"
          cards for any task whose _is_weitergeschoben flag is true. No
          workflow controls, no expand — purely informational placeholder so
          past days are never empty.

  - task: "Admin recovery buttons — REBUILD TASK HISTORY + OFFENE AUFGABEN EINSAMMELN"
    implemented: true
    working: true
    file: "/app/web/src/App.tsx (RolloverAdminSection)"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          RolloverAdminSection now contains two buttons. The new "REBUILD TASK
          HISTORY" button calls POST /tasks/admin/rebuild-history with a
          confirm dialog explaining the operation is non-destructive. Shows
          scanned/patched counts and a collapsible details list of patched
          tasks.

  - task: "PDF & Print report — preserve user line breaks, fix letter spacing"
    implemented: true
    working: true
    file: "/app/web/src/lib/pdfReport.ts, /app/web/src/lib/printReport.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Fixed PDF/print: wide letter spacing, missing "\n" breaks, no word
          wrap, bad alignment. Solution: setCharSpace(0)+setLineHeightFactor(1.4)
          in PDF; white-space:pre-wrap + letter/word-spacing:normal in HTML;
          normalizeMultiline() helper; halign:'left' explicit on all autoTable
          columns. Verified by headless jsPDF render — each line emits its own
          Tj op.

  - task: "Mitarbeiter mid-task hinzufügen + Period-based Personenstunden"
    implemented: true
    working: true
    file: "/app/server-node/src/server.js, /app/web/src/lib/workflow.ts, /app/web/src/lib/pdfReport.ts, /app/web/src/lib/printReport.ts, /app/web/src/App.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Added a "+ Mitarbeiter hinzufügen" button on every active task card.
          On click → modal lists available persons (excluding already-assigned).
          Selecting & confirming records a NEW event type `mitarbeiter_hinzu`
          with the FULL new persons list as snapshot. The server:
            • whitelists the new event type
            • uses the snapshot as the event.persons (instead of taskDoc.person_ids)
            • OVERWRITES task.person_ids with the new dedup'd list
            • broadcasts tasks_updated so all clients refresh

          Personenstunden calculation upgraded from per-day to PER-PERIOD:
            • New API: personHoursMsByPeriod(wf, fallback) returns
              { totalMs, periods: PersonHoursPeriod[] } where each period is
              a sub-segment with constant person count.
            • Periods are bounded by:
                – work segment limits (starten / pause / feierabend / beenden)
                – every mitarbeiter_hinzu event whose ts falls inside a segment
            • personHoursMsByDay kept as a backwards-compat wrapper aggregating
              periods into days.

          UI:
            • Admin card / Archive card / Tablet pill — show the period-accurate
              total only.
            • DailyBreakdownView's "Tag-für-Tag" panel now shows ONE row per
              sub-period (e.g. "07:00–09:00 × 2 = 04:00") with a final Gesamt.
            • PDF report column header → "Tag · Periode"; rows are
              "YYYY-MM-DD  HH:MM–HH:MM" with a violet GESAMT line.
            • Print HTML mirrors the PDF table.

          Verified with the user's exact example (E2E with real Mongo + server):
            07:00 starten (2 Mitarbeiter)
            09:00 mitarbeiter_hinzu (+1 → 3)
            15:00 beenden
            → periods: 07:00-09:00 ×2 = 04:00:00
                        09:00-15:00 ×3 = 18:00:00
              TOTAL                    = 22:00:00  ✅

          Out of scope (per user spec): no edit / no removal in this iteration.
          The button is hidden when status == "finished".

  - task: "Personenstunden field — Per-day calculation (multi-day correct)"
    implemented: true
    working: true
    file: "/app/web/src/lib/workflow.ts, /app/web/src/lib/pdfReport.ts, /app/web/src/lib/printReport.ts, /app/web/src/App.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          ⚠️ FIX of an earlier bug: Personenstunden was naively computed as
          (totalWorkMs × current_person_ids.length). For multi-day tasks
          where staffing changed day-by-day, this gave wrong totals.

          CORRECT formula now applied everywhere:
            Personenstunden = Σ_days (workMs_day × max(1, personCount_day))

          Where personCount_day is taken from the PER-DAY `persons` snapshot
          stored on each workflow event (captured at click-time). Falls back
          to the current task.person_ids.length only when an entire day has
          no event-level snapshot (legacy data).

          New API in lib/workflow.ts:
            export interface PersonHoursDay {
              date, workMs, personCount, personHoursMs
            }
            export function personHoursMsByDay(wf, fallback, nowMs):
              { totalMs, days: PersonHoursDay[] }

          Verified with the user's exact example:
            Day 1: 08:00:00 × 2 = 16:00:00
            Day 2: 06:00:00 × 3 = 18:00:00
            Day 3: 04:00:00 × 1 =  4:00:00
            ────────────────────────────
            TOTAL              = 38:00:00  ✅

          UI changes:
            • Admin card / Archive card / Tablet pill — show the per-day-correct
              total. Sub-label adapts: "N Arbeitstage" for multi-day vs
              "workMs × N Personen" for single-day.
            • DailyBreakdownView now renders a violet "Tag-für-Tag" panel
              with one line per day:
                 2026-05-01   08:00:00 × 2 = 16:00:00
                 2026-05-02   06:00:00 × 3 = 18:00:00
                 2026-05-03   04:00:00 × 1 = 04:00:00
                 ────────────────────────────────────
                 GESAMT                     = 38:00:00
            • Tablet view: same compact pill (shows N Arbeitstage when multi).
            • PDF report: new dedicated "PERSONENSTUNDEN — TAG-FÜR-TAG"
              section with 4-column table (Tag / Arbeitszeit / Mitarbeiter /
              Personenstunden) + violet GESAMT row.
            • Print HTML: matching standalone table with same columns and
              violet GESAMT row (#7C3AED accent everywhere).

          Old `personHoursMs(workMs, count)` helper kept for backwards
          compatibility but not used anywhere in the rendering path.

  - task: "Personenstunden field — Arbeitszeit × Anzahl Mitarbeiter"
    implemented: true
    working: true
    file: "/app/web/src/lib/workflow.ts, /app/web/src/lib/pdfReport.ts, /app/web/src/lib/printReport.ts, /app/web/src/App.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Added a NEW derived field "👥 Personenstunden" everywhere a task is
          shown: Admin card, Admin detail (DailyBreakdownView totals), Archive
          detail, Tablet card, PDF report, HTML print report.

          Formula:  Personenstunden = Gesamt-Arbeitszeit × max(1, person_ids.length)
            • 1 worker  → equals Gesamt-Arbeitszeit
            • 0 workers → multiplier 1 (defensive)
            • Display   → same HH:MM:SS format as Arbeitszeit

          Implementation:
            • lib/workflow.ts → new exported helper personHoursMs(workMs, n).
            • PDF: `["Mitarbeiter (Anzahl)", ...]` + `["Personenstunden", ...]` rows.
            • Print HTML: same two rows + violet highlight + small explainer
              "(06:00:00 × 3 Personen)" when count > 1.
            • Admin card / Archive card: 2-col layout → 3-col grid with new
              violet "Personenstunden ×N" cell.
            • Tablet card: dedicated violet pill below the 4-col grid showing
              "👥 Personenstunden  HH:MM:SS  (workMs × N Personen)".
            • DailyBreakdownView accepts personCount prop and shows it as the
              3rd totals cell, kept in sync wherever it's used.

          Reactivity is automatic — Personenstunden is computed inline from
          (totalMs, t.person_ids.length) each render. No persistence, no
          backend change, no impact on time-tracking logic.

          Sanity verified:
            6:00:00 × 3 → 18:00:00  ✓ (user's example)
            6:00:00 × 1 → 06:00:00  ✓
            6:00:00 × 0 → 06:00:00  ✓ (fallback to 1)
            0     × 5  → 00:00:00  ✓
            3:14:07 × 2 → 06:28:14  ✓ (precise to the second)

  - task: "Admin Zeitkorrektur — Time Inflation (91h instead of 19h) FIX"
    implemented: true
    working: true
    file: "/app/server-node/src/server.js, /app/web/src/lib/workflow.ts, /app/web/src/App.tsx"
    stuck_count: 0
    priority: "highest"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          User reported (screenshot): a 7-day rolled-over task whose prior
          accumulated time was ~13h. Today Admin clicked Zeitkorrektur and
          moved today's "starten" from 13:06 → 07:00. Expected total ≈ 19h
          (13 + 6). Actual total: 91:46:20 — wrong by ~72h.

          Root causes (3 stacked bugs):
            (A) recomputeWorkflow did NOT auto-close an orphan open segment
                when a new "starten" arrived. So if a previous day's
                Feierabend was missed and the auto-rollover kicked in, that
                segment stayed end=null and totalWorkMs counted it all the
                way to NOW — exploding by hours every minute.
            (B) autoRolloverOpenTasks rolled the TASK forward but never
                touched the workflow. A "running" workflow stayed running
                across day boundaries, growing forever.
            (C) The Zeit-Edit modal pushed updates for EVERY editable event
                (because the check `newHHMM !== (e.display_time||"")` is
                always true for legacy events that have no display_time).
                Every Zeitkorrektur silently rewrote previous-days' ts —
                shifting them by 8 seconds and corrupting display_time.

          Fixes applied:
            (1) `recomputeWorkflow` (server) + `recomputeLocal` (frontend):
                on "starten" / "fortsetzen", auto-close any prior open
                segment at the event's ts. Guarantees no segment ever has
                end=null except the active one.
            (2) `autoRolloverOpenTasks`: when rolling over a task whose
                workflow status is "running" or "paused", inject a
                SYNTHETIC `feierabend` event at 23:59:59 of the previous
                target date. Marked with `auto_generated: true` for audit.
                Re-runs recomputeWorkflow → segment closes cleanly. Status
                transitions running → deferred. Broadcasts workflow_updated
                so the UI refreshes immediately.
            (3) Zeit-Edit modal: snapshot the initial HH:MM of every row in
                a useRef (`initialTimes`). On save, ONLY push updates where
                `times[i] !== initialTimes.current[i]`. Also prefers
                `e.display_time` when present (avoids TZ-shifted init).

          End-to-end verification (test_autofb.cjs):
            Setup: task with workflow running on yesterday 06:00Z (open
                   segment), continue_tomorrow=true, next_work_date=yesterday.
            PRE-rollover total: 29:28:06 (grows every minute — bug).
            GET /api/tasks/today → rollover triggers, auto-Feierabend
              injected at yesterday 23:59:59Z. Workflow becomes "deferred".
              Segment closed. Total now: 17:59:59 — STABLE.
            POST starten today + Admin-Zeitkorrektur → 07:00 (05:00Z).
            Final total: 24:28:05 — EXACTLY as expected
              (17:59:59 yesterday-capped + 06:28:06 today since 07:00).

          NO data is lost or modified beyond the additive auto-Feierabend
          event (which is a positive audit trail entry). Pre-existing
          completed segments stay untouched. Editing only changes the
          event(s) the user actually edited.


backend:
  - task: "Historical Task Rollover — listTasksForDate + stub decoration"
    implemented: true
    working: true
    file: "/app/server-node/src/server.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          GET /api/tasks?date=, /api/tasks/by-date, /api/tasks/today now call
          listTasksForDate(date) which returns LIVE tasks for the date PLUS
          virtual stubs for any task whose rollover_log mentions the date.
          Validated via /tmp/test_rollover.sh end-to-end: a task scheduled
          3 days ago auto-rolls to today on first query of today, and the
          past day correctly returns a stub with status="weitergeschoben"
          and _weitergeschoben_auf pointing at today.

  - task: "Admin endpoint: POST /api/tasks/admin/rebuild-history"
    implemented: true
    working: true
    file: "/app/server-node/src/server.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          New admin endpoint. Walks all tasks. For each: fills missing
          original_date from task_date/created_at, fills completed_date from
          workflow.finished_at when status="finished", synthesises a single
          rollover_log entry when original_date != current live date and the
          log is empty. Idempotent and non-destructive. Returns
          { ran_at, scanned, patched, changes[] }. Tested: 0 patches on clean
          data, 1 synth entry created when log artificially cleared then
          rebuild called.


  - task: "BUGFIX — Historical Stubs disappear after manual Feierabend + Fortsetzen"
    implemented: true
    working: true
    file: "/app/server-node/src/server.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "user"
        comment: |
          User reported: after a manual `feierabend` on day A followed by
          `fortsetzen` on day B, the historical "Weitergeschoben auf …" stub
          on day A disappears. Auto-rollover stubs stayed intact.
      - working: true
        agent: "main"
        comment: |
          ROOT CAUSE: the `feierabend` handler set continue_tomorrow + next_work_date
          but never pushed an entry to `rollover_log`. When `fortsetzen` later
          advances task_date to today, the feierabend day no longer matches any
          field used by listTasksForDate ($or over task_date / next_work_date /
          completed_date / original_date / rollover_log.from / rollover_log.to)
          — so the stub vanished. For tasks whose original_date equals the
          feierabend day, the original_date safety net masks the bug; for
          long-running tasks rolled across many days it fully reproduces.

          FIX (Patch 1) — /app/server-node/src/server.js feierabend handler:
          push a rollover_log entry { from: todayStr(), to: nextDay,
          reason: 'Manueller Feierabend', status: 'scheduled' } alongside the
          existing $set, with dedup on { from, to } and the same $slice:-50 cap.

          FIX (Patch 2) — /api/tasks/admin/rebuild-history enhanced to:
          • Walk every workflow's events array.
          • For each MANUAL `feierabend` event (auto_generated !== true),
            if no rollover_log entry already has `from === eventDay`,
            synthesise one with reason="Rebuild: Manueller Feierabend
            rekonstruiert", deriving `to` from the next `fortsetzen` event
            (else feierabendDay+1).
          • Idempotent — re-running the endpoint does NOT duplicate entries.
          • Still keeps the legacy archival entry creation as last resort.

          VALIDATION — /tmp/test_stub_fix.cjs spins up the real server.js on
          an isolated DB and verifies all four scenarios:
            T1 ✅ manual feierabend now writes rollover_log
            T2 ✅ stub survives fortsetzen on a cross-day scenario
            T3 ✅ migration recovers manual feierabend days from pre-patch data
            T4 ✅ migration is idempotent (no duplicates on re-run)

  - task: "FEATURE — Lager-Berichte (PDF + CSV Export)"
    implemented: true
    working: true
    file: "/app/web/src/lib/lagerReport.ts, /app/web/src/components/LagerViews.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          New READ-ONLY export feature for the Lager (warehouse) module.
          Two report scopes:
            • "Gesamtlager exportieren" — full warehouse, grouped by folder
            • "Ordnerbericht exportieren" — current folder + all sub-folders

          Two output formats:
            • PDF — A4 portrait, jsPDF + jspdf-autotable, with embedded
              product thumbnails (Cloudinary), color-coded rows (green /
              orange / red) and 4-card summary (gesamt / OK / Niedrig / Leer).
            • CSV — semicolon-separated, UTF-8 + BOM (Excel-friendly),
              13 columns incl. Ordner-Pfad, LAN, Menge, Mindestmenge,
              Status, Warnsymbole, Info.

          Products are sorted by LAN ascending (locale-aware "BA001" <
          "BB001"; products without LAN sort to the end). Folder groups
          are sorted by full folder path.

          NEW FILE: /app/web/src/lib/lagerReport.ts
            • buildLagerReportData({ scope, folderId?, lagerPv })
            • exportLagerPDF(data, { includeImages, onProgress })
            • exportLagerCSV(data)
            • computeStockStatus(p)  — mirrors LagerViews logic

          MODIFIED: /app/web/src/components/LagerViews.tsx
            • Added export button to LagerHome header (label changes
              based on whether the user is at root or inside a folder).
            • Added format-chooser modal + busy overlay with image-
              loading progress bar.
            • NO product data is mutated — pure read + download.

          NO BACKEND CHANGES. Existing /lager/folders and /lager/products
          endpoints already support fetching all (no filter), and require
          only the X-Lager-Pv header which the frontend already manages.

          Validation: `yarn build` produces a clean production bundle
          (835 KB main chunk, 8 KB CSS) and `npx tsc --noEmit` passes.


  - task: "FEATURE — PDF Bericht: management-friendly Layout (multi-day tasks)"
    implemented: true
    working: true
    file: "/app/web/src/lib/pdfReport.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Refactored the multi-day PDF report to be a concise management
          summary instead of a technical event dump. NO data / NO time-
          calculation logic changed — pure presentation.

          HEADER (page 1, right):
            • Replaced single date with "Projektbeginn – Projektende"
              (first/last day with activity from buildDailyBreakdown).
            • Added small subtitle "N Arbeitstage" for multi-day tasks.

          AUFGABEN-INFORMATIONEN table:
            REMOVED: Datum, Haus, Station, Zeit von, Zeit bis,
                     "Mitarbeiter (Anzahl)" (single-day snapshot).
            ADDED:   Projektbeginn, Projektende, Bereich (= Haus+Station),
                     Gesamtmitarbeiter (UNIQUE union across all days).
            KEPT:    Aufgabentyp, Beschreibung, Status, Gesamt-Arbeitszeit,
                     Pause-Zeit, Personenstunden (calculations unchanged).

          "Mitarbeiter" field now lists the UNION of every employee who
          participated on any day (deduplicated, ordered by first-seen day,
          then by task.person_ids order). Replaces the old "last day only"
          snapshot.

          PERSONENSTUNDEN — TAG-FÜR-TAG: untouched. Still shows the
          per-day/per-period breakdown with the violet accent.

          NEW SECTION "TÄGLICHE ZUSAMMENFASSUNG" replaces the old
          "VERLAUF & TIMELINE" event dump. One row per day, with:
            • Tag N + Wochentag, DD.MM.YYYY
            • Arbeitsbeginn (HH:MM)
            • Arbeitsende   (HH:MM)
            • Arbeitszeit   (HH:MM:SS)
            • Pause-Zeit    (HH:MM:SS)
            • Mitarbeiter (Anzahl – Namen)
            • Tagesnotiz — the single most important note picked by
              priority [beenden > feierabend > timeline > others],
              latest-first within each type. Skips undone/admin events.

          Photos section: unchanged.

          BACKEND: zero changes. workflow.ts: zero changes. The full
          technical timeline remains available inside the app — only the
          PDF presentation is condensed.

          Validation: `npx tsc --noEmit` passes, `yarn build` produces a
          clean production bundle (833 KB main, 7 KB css).


  - task: "FEATURE — Print/HTML Report: same management-friendly redesign"
    implemented: true
    working: true
    file: "/app/web/src/lib/printReport.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: |
          Mirrored the new PDF report layout in the HTML/print report
          (window.print() pipeline). Same fields, same behaviour, fully
          consistent between PDF and Print outputs.

          Changes (all presentational — no DB / no time-calc logic):
            • Header right block: "Projektbeginn – Projektende" (or single
              date for single-day tasks) + "N Arbeitstage" subline.
              Removed the "Zeit von – Zeit bis" subline.
            • Aufgaben-Informationen table:
                REMOVED: Datum, Haus, Station, Zeit von, Zeit bis,
                         Mitarbeiter (Anzahl)
                ADDED:   Projektbeginn, Projektende, Bereich (= Haus+Station),
                         Gesamtmitarbeiter (deduplicated all-day count)
                KEPT:    Aufgabentyp, Beschreibung, Status,
                         Gesamt-Arbeitszeit, Pause-Zeit, Personenstunden
            • Mitarbeiter field now lists the UNION of every employee who
              participated on any day (deduplicated, ordered by first-seen).
            • Personenstunden-Tag-für-Tag table: untouched.
            • NEW section "Tägliche Zusammenfassung" replaces the old
              "Verlauf & Timeline" event dump:
                – One <table class="daily-summary"> row per day.
                – Per-day fields: Arbeitsbeginn, Arbeitsende, Arbeitszeit,
                  Pause-Zeit, Mitarbeiter (count + names), Tagesnotiz
                  (single most-important note via same picker as PDF).
                – Print-friendly CSS with page-break-inside: avoid and
                  display: table-header-group for repeating headers.
            • Photos section: untouched.
            • Removed the now-unused buildEventRowHtml/eventRows code.

          Validation: `npx tsc --noEmit` passes,
          `yarn build` produces a clean production bundle (835 KB main).

