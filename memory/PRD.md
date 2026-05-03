# Reinigung Aufgabenverwaltung — PWA

## Vision
Web App / PWA (installable on home screen) for managing daily cleaning tasks
between an Admin (mobile) and a wall-mounted Tablet display. 100% German UI,
Glassmorphism design, offline-first via localStorage.

## Tech Stack
- Frontend: Vite + React 18 + TypeScript + Tailwind + react-router-dom + vite-plugin-pwa
- Storage: localStorage (offline-first)
- Optional Backend: any HTTP server matching the schema in `/app/backend/server.py`
- Runtime: Vite dev server on port 3000 (supervised, program name `expo`)

## Core Features (all working in offline mode)
1. Landing screen — choose Admin or Tablet
2. Admin login (default password `admin123`, changeable in settings)
3. Admin Home — list today's tasks + status dots, archive button
4. Admin Create — new task with type/house/station/persons/time slots
5. Admin Manage — CRUD for task types, houses, stations, persons
6. Admin Archive — view archived tasks by date
7. Admin Settings — logo, tablet background (presets / image), password, version info
8. Admin Server — configure remote backend URL + optional API key, test connection
9. Tablet — large display of today's tasks; staff can mark Annehmen / Beenden /
   Nicht annehmbar / Nicht beendbar / Nicht erledigt with reason
10. Real-time updates via WebSocket (when online and server provides /api/ws)
11. PWA installable (manifest + service worker)

## German UI strings (no Arabic in app)
All labels: REINIGUNG, ADMIN, TABLET, NEUE AUFGABE, AUFGABENTYP, HAUS, STATION,
BESCHREIBUNG, PERSONEN, VON, BIS, ARCHIV, EINSTELLUNGEN, SERVER-EINSTELLUNGEN,
PLAN HEUTE, Annehmen, Beenden, Nicht annehmbar, Nicht beendbar, Nicht erledigt,
Offline-Modus, Online — Verbunden, …

## Status colors
- pending (Neu) — blue
- accepted (Angenommen) — orange
- finished (Erledigt) — green
- cannot_accept (Nicht annehmbar) — dark red
- not_finished (Nicht beendbar) — dark red
- not_done (Nicht erledigt) — red

## Known limitation
The Render backend `https://kvd-backend.onrender.com` provided by the user has
an INCOMPATIBLE schema (only /api/health and /api/tasks with `title` field
exist). All other endpoints return 404. App therefore defaults to offline mode;
user can either deploy the included `/app/backend/server.py` to Render or
continue offline-only.
