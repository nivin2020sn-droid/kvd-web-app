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
