from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Set
import uuid
from datetime import datetime, timezone, date
from apscheduler.schedulers.asyncio import AsyncIOScheduler

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Models ----------
class SimpleItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class SimpleItemCreate(BaseModel):
    name: str

class TaskCreate(BaseModel):
    task_type: str
    haus: str
    station: str
    description: str = ""
    person_ids: List[str] = []
    time_from: str  # "HH:MM"
    time_to: str

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    task_type: str
    haus: str
    station: str
    description: str = ""
    person_ids: List[str] = []
    time_from: str
    time_to: str
    status: str = "pending"  # pending | accepted | finished | cannot_accept | not_finished | not_done
    accept_reason: Optional[str] = None
    not_finished_reason: Optional[str] = None
    not_done_reason: Optional[str] = None
    accepted_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    archived: bool = False
    archive_date: Optional[str] = None  # YYYY-MM-DD
    task_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"))

class StatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = None

class LoginRequest(BaseModel):
    password: str

class Settings(BaseModel):
    password: str = "admin123"
    logo_base64: Optional[str] = None
    background_type: str = "preset"  # preset | color | image
    background_value: str = "dark"   # dark | light | #hex | base64

class SettingsUpdate(BaseModel):
    password: Optional[str] = None
    logo_base64: Optional[str] = None
    background_type: Optional[str] = None
    background_value: Optional[str] = None

# ---------- Auth ----------
ADMIN_TOKEN = "admin-session-token"  # Simple token, since user wanted simple password only

async def require_admin(authorization: Optional[str] = Header(None)):
    if authorization != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

# ---------- Settings helpers ----------
async def get_settings_doc() -> dict:
    doc = await db.settings.find_one({"_id": "singleton"})
    if not doc:
        defaults = Settings().dict()
        defaults["_id"] = "singleton"
        await db.settings.insert_one(defaults)
        doc = defaults
    return doc

# ---------- WebSocket Manager ----------
class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, message: dict):
        dead = []
        for ws in list(self.active):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.discard(ws)

manager = ConnectionManager()

# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Cleaning Tasks API"}

# Login
@api_router.post("/admin/login")
async def admin_login(req: LoginRequest):
    settings = await get_settings_doc()
    if req.password == settings.get("password", "admin123"):
        return {"token": ADMIN_TOKEN}
    raise HTTPException(status_code=401, detail="Falsches Passwort")

# Settings
@api_router.get("/settings")
async def get_public_settings():
    """Public endpoint: returns logo & background only (for tablet)."""
    s = await get_settings_doc()
    return {
        "logo_base64": s.get("logo_base64"),
        "background_type": s.get("background_type", "preset"),
        "background_value": s.get("background_value", "dark"),
    }

@api_router.put("/settings")
async def update_settings(payload: SettingsUpdate, _: bool = Depends(require_admin)):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    if update:
        await db.settings.update_one({"_id": "singleton"}, {"$set": update}, upsert=True)
    s = await get_settings_doc()
    await manager.broadcast({"type": "settings_updated"})
    return {
        "logo_base64": s.get("logo_base64"),
        "background_type": s.get("background_type", "preset"),
        "background_value": s.get("background_value", "dark"),
    }

# CRUD for simple items - using explicit routes to avoid clashes with /tasks/*
KIND_COLL = {
    "task-types": "task_types",
    "houses": "houses",
    "stations": "stations",
    "persons": "persons",
}

async def _list_kind(kind: str):
    coll = db[KIND_COLL[kind]]
    return await coll.find({}, {"_id": 0}).to_list(1000)

async def _create_kind(kind: str, name: str):
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    item = SimpleItem(name=name)
    await db[KIND_COLL[kind]].insert_one(item.dict())
    await manager.broadcast({"type": f"{kind}_updated"})
    return item.dict()

async def _delete_kind(kind: str, item_id: str):
    await db[KIND_COLL[kind]].delete_one({"id": item_id})
    await manager.broadcast({"type": f"{kind}_updated"})
    return {"ok": True}

@api_router.get("/task-types")
async def list_task_types(): return await _list_kind("task-types")
@api_router.post("/task-types")
async def add_task_type(p: SimpleItemCreate, _: bool = Depends(require_admin)): return await _create_kind("task-types", p.name)
@api_router.delete("/task-types/{item_id}")
async def del_task_type(item_id: str, _: bool = Depends(require_admin)): return await _delete_kind("task-types", item_id)

@api_router.get("/houses")
async def list_houses(): return await _list_kind("houses")
@api_router.post("/houses")
async def add_house(p: SimpleItemCreate, _: bool = Depends(require_admin)): return await _create_kind("houses", p.name)
@api_router.delete("/houses/{item_id}")
async def del_house(item_id: str, _: bool = Depends(require_admin)): return await _delete_kind("houses", item_id)

@api_router.get("/stations")
async def list_stations(): return await _list_kind("stations")
@api_router.post("/stations")
async def add_station(p: SimpleItemCreate, _: bool = Depends(require_admin)): return await _create_kind("stations", p.name)
@api_router.delete("/stations/{item_id}")
async def del_station(item_id: str, _: bool = Depends(require_admin)): return await _delete_kind("stations", item_id)

@api_router.get("/persons")
async def list_persons(): return await _list_kind("persons")
@api_router.post("/persons")
async def add_person(p: SimpleItemCreate, _: bool = Depends(require_admin)): return await _create_kind("persons", p.name)
@api_router.delete("/persons/{item_id}")
async def del_person(item_id: str, _: bool = Depends(require_admin)): return await _delete_kind("persons", item_id)

# Tasks
@api_router.get("/tasks/today")
async def tasks_today():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tasks = await db.tasks.find(
        {"archived": False, "task_date": today},
        {"_id": 0}
    ).to_list(1000)
    return tasks

@api_router.post("/tasks")
async def create_task(payload: TaskCreate, _: bool = Depends(require_admin)):
    task = Task(**payload.dict())
    await db.tasks.insert_one(task.dict())
    await manager.broadcast({"type": "tasks_updated"})
    return task.dict()

@api_router.patch("/tasks/{task_id}/status")
async def update_task_status(task_id: str, payload: StatusUpdate):
    valid = {"pending", "accepted", "finished", "cannot_accept", "not_finished", "not_done"}
    if payload.status not in valid:
        raise HTTPException(status_code=400, detail="Invalid status")
    update = {"status": payload.status}
    now_iso = datetime.now(timezone.utc).isoformat()
    if payload.status == "accepted":
        update["accepted_at"] = now_iso
    elif payload.status == "finished":
        update["finished_at"] = now_iso
    elif payload.status == "cannot_accept":
        update["accept_reason"] = payload.reason or ""
    elif payload.status == "not_finished":
        update["not_finished_reason"] = payload.reason or ""
    elif payload.status == "not_done":
        update["not_done_reason"] = payload.reason or ""
    res = await db.tasks.update_one({"id": task_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    await manager.broadcast({"type": "tasks_updated"})
    return {"ok": True}

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, _: bool = Depends(require_admin)):
    """Admin can remove a task from today's list before it's archived (still archives it)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.tasks.update_one({"id": task_id}, {"$set": {"archived": True, "archive_date": today}})
    await manager.broadcast({"type": "tasks_updated"})
    return {"ok": True}

@api_router.post("/tasks/archive-now")
async def archive_now(_: bool = Depends(require_admin)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    res = await db.tasks.update_many(
        {"archived": False},
        {"$set": {"archived": True, "archive_date": today}}
    )
    await manager.broadcast({"type": "tasks_updated"})
    return {"archived": res.modified_count}

@api_router.get("/tasks/archive")
async def get_archive(date: Optional[str] = None):
    """List archived tasks. If date provided (YYYY-MM-DD), filter by that day.
    Returns also distinct dates list when no date is given."""
    if date:
        tasks = await db.tasks.find(
            {"archived": True, "archive_date": date},
            {"_id": 0}
        ).to_list(2000)
        return {"date": date, "tasks": tasks}
    # Distinct dates
    dates = await db.tasks.distinct("archive_date", {"archived": True})
    dates = sorted([d for d in dates if d], reverse=True)
    return {"dates": dates, "tasks": []}

# Seed defaults endpoint (idempotent)
@api_router.post("/seed-defaults")
async def seed_defaults(_: bool = Depends(require_admin)):
    return {"ok": True}

import json

# Update info endpoint (reads from data/update.json, editable at runtime)
UPDATE_FILE = ROOT_DIR / "data" / "update.json"

@api_router.get("/update-info")
async def get_update_info():
    try:
        if UPDATE_FILE.exists():
            with open(UPDATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"update-info read error: {e}")
    return {
        "latest_version": "1.0.0",
        "download_url": "",
        "changelog": "",
        "mandatory": False,
    }

# WebSocket
@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            # We don't expect messages from client, but keep connection alive
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)

# Scheduler: archive at midnight
scheduler = AsyncIOScheduler(timezone="UTC")

async def auto_archive_job():
    yesterday = (datetime.now(timezone.utc).date()).strftime("%Y-%m-%d")
    # Archive everything not archived yet
    await db.tasks.update_many(
        {"archived": False},
        {"$set": {"archived": True, "archive_date": yesterday}}
    )
    await manager.broadcast({"type": "tasks_updated"})
    logger.info("Auto-archived tasks at midnight")

@app.on_event("startup")
async def startup():
    # Seed defaults on first start
    if await db.task_types.count_documents({}) == 0:
        for n in ["Grundreiniger", "Glasreiniger", "Baureiniger", "Endbaureiniger"]:
            await db.task_types.insert_one(SimpleItem(name=n).dict())
    if await db.houses.count_documents({}) == 0:
        for n in ["A", "B", "C"]:
            await db.houses.insert_one(SimpleItem(name=n).dict())
    if await db.stations.count_documents({}) == 0:
        for n in ["10", "11", "12"]:
            await db.stations.insert_one(SimpleItem(name=n).dict())
    await get_settings_doc()
    # Schedule midnight archive (00:00 UTC)
    scheduler.add_job(auto_archive_job, "cron", hour=0, minute=0, id="midnight_archive", replace_existing=True)
    scheduler.start()

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
