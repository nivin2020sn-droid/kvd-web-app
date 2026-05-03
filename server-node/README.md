# Reinigung Aufgabenverwaltung – Backend

Node.js + Express + MongoDB Backend, 100 % kompatibel mit der Reinigungs-PWA.

## Endpoints
- `POST /api/admin/login` – `{ password }` → `{ token }`
- `GET /api/settings` – öffentliche Tablet-Einstellungen
- `PUT /api/settings` – Admin
- `GET/POST /api/task-types`, `/api/houses`, `/api/stations`, `/api/persons`
- `DELETE /api/{kind}/:id` – Admin
- `GET /api/tasks/today`
- `POST /api/tasks` – Admin
- `PATCH /api/tasks/:id/status` – `{ status, reason? }`
- `DELETE /api/tasks/:id` – Admin (archiviert)
- `POST /api/tasks/archive-now` – Admin
- `GET /api/tasks/archive` / `?date=YYYY-MM-DD`
- `GET /api/update-info`
- `WebSocket  /api/ws`
- `GET /api/health`

## Lokal starten
```bash
cp .env.example .env   # MongoDB-URL eintragen
npm install
npm start
```

## Auf Render deployen (3 Schritte)
1. **MongoDB Atlas** kostenloses Cluster anlegen → Connection String kopieren.
2. Repo auf GitHub pushen (oder Direct-Upload). Auf Render → **New → Web Service** → Repo wählen.
3. Bei *Environment Variables* `MONGO_URL` einfügen (Atlas-URL). Fertig.

Render vergibt automatisch `PORT`. Gratis-Plan reicht für den Start.
