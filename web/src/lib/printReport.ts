import type { Task, SimpleItem } from "./types";
import type { TaskWorkflow, WorkflowEvent } from "./workflow";
import {
  EVENT_LABEL,
  EVENT_COLOR,
  STATUS_LABEL_DE,
  totalWorkMs,
  formatDuration,
  formatDateTime,
  formatTime,
} from "./workflow";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Total pause time in ms (mirror of totalPauseMs in workflow.ts). */
function totalPauseMs(wf: TaskWorkflow): number {
  const segs = wf.segments || [];
  if (segs.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < segs.length - 1; i++) {
    const cur = segs[i], nxt = segs[i + 1];
    if (cur.end && nxt.start) total += new Date(nxt.start).getTime() - new Date(cur.end).getTime();
  }
  return total;
}

export function printTaskReport(task: Task, wf: TaskWorkflow | null, persons: SimpleItem[]) {
  const pn = (id: string) => persons.find((p) => p.id === id)?.name || "—";
  const personNames = task.person_ids.map(pn).join(", ") || "—";
  const workMs = wf ? totalWorkMs(wf) : 0;
  const pauseMs = wf ? totalPauseMs(wf) : 0;
  const events = wf?.events || [];
  const timelines = events.filter((e) => e.type === "timeline");
  const adminEvents = events.filter((e) => e.type === "admin_zeitkorrektur" || e.type === "admin_beenden_rueckgaengig");
  const workflowEvents = events.filter((e) => ["vorbereiten", "starten", "pause", "fortsetzen", "beenden"].includes(e.type));
  const now = new Date();
  const title = `Aufgabe ${esc(task.task_type)} · Haus ${esc(task.haus)} · Station ${esc(task.station)}`;

  const row = (label: string, value: string) =>
    `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;

  const eventRow = (ev: WorkflowEvent) => {
    const c = EVENT_COLOR[ev.type] || "#444";
    const label = EVENT_LABEL[ev.type] || ev.type;
    const undoneTag = ev.undone ? ` <span class="tag">(zurückgenommen)</span>` : "";
    const corr = ev.corrections && ev.corrections.length
      ? `<div class="corrections">${ev.corrections.map((co) => `↳ ${esc(EVENT_LABEL[co.target_type])}: ${esc(new Date(co.old_ts).toLocaleTimeString("de-DE", {hour:"2-digit",minute:"2-digit"}))} → ${esc(new Date(co.new_ts).toLocaleTimeString("de-DE", {hour:"2-digit",minute:"2-digit"}))}</div>`).join("")}</div>`
      : "";
    return `<tr style="${ev.undone ? "opacity:.55;text-decoration:line-through;" : ""}">
      <td class="dot" style="background:${c};"></td>
      <td><strong>${esc(label)}</strong>${undoneTag}</td>
      <td class="mono">${esc(formatDateTime(ev.ts))}</td>
      <td>${ev.note ? `„${esc(ev.note)}"` : `<em class="muted">—</em>`}${corr}</td>
      <td class="mono muted">${esc(ev.created_by || "")}</td>
    </tr>`;
  };

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 4px 0; font-weight: 800; letter-spacing: -0.01em; }
  h2 { font-size: 14px; margin: 20px 0 8px 0; padding-bottom: 4px; border-bottom: 2px solid #111; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .sub { color: #666; margin-bottom: 20px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: avoid; }
  table th, table td { padding: 6px 8px; border-bottom: 1px solid #e3e3e3; text-align: left; vertical-align: top; }
  table th { background: #f6f7f9; font-weight: 700; width: 32%; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  .kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px; }
  .kpi .cell { border: 1px solid #cfcfcf; border-radius: 6px; padding: 8px 10px; }
  .kpi .cell .lbl { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi .cell .val { font-family: ui-monospace, Menlo, monospace; font-size: 15px; font-weight: 700; }
  .events th { font-weight: 700; background: #111; color: #fff; letter-spacing: 0.5px; text-transform: uppercase; font-size: 10px; }
  .events td.dot { width: 14px; padding: 0; }
  .events td.dot div { width: 10px; height: 10px; border-radius: 50%; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .muted { color: #888; }
  .tag { font-size: 10px; color: #B18200; font-weight: 700; margin-left: 4px; }
  .corrections { font-size: 10px; color: #555; margin-top: 2px; }
  .footer { margin-top: 24px; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }
  @media print { .no-print { display: none; } body { font-size: 11px; } }
  .no-print { position: fixed; top: 12px; right: 12px; }
  .no-print button { padding: 8px 16px; background: #111; color: #fff; border: 0; border-radius: 6px; font-weight: 700; cursor: pointer; margin-left: 6px; }
</style>
</head>
<body>
<div class="no-print"><button onclick="window.print()">Drucken</button><button onclick="window.close()">Schließen</button></div>

<h1>${esc(task.task_type)}</h1>
<div class="sub">Haus ${esc(task.haus)} · Station ${esc(task.station)} · ${esc(task.task_date || new Date().toISOString().slice(0,10))}</div>

<h2>1. Aufgaben-Daten</h2>
<table>
  ${row("Datum", esc(task.task_date || ""))}
  ${row("Aufgabentyp", esc(task.task_type))}
  ${row("Haus", esc(task.haus))}
  ${row("Station", esc(task.station))}
  ${row("Mitarbeiter", esc(personNames))}
  ${row("Beschreibung", esc(task.description || "—"))}
  ${row("Zeit von", esc(task.time_from))}
  ${row("Zeit bis", esc(task.time_to))}
  ${row("Status", `<span class="status" style="background:${EVENT_COLOR["starten"]}22;color:${wf ? "#111" : "#666"};border:1px solid #aaa;">${esc(wf ? STATUS_LABEL_DE[wf.status] : "Bereit")}</span>`)}
</table>

<h2>2. Zeit-Informationen</h2>
<table>
  ${row("Vorbereitet", esc(formatTime(wf?.prepared_at)))}
  ${row("Gestartet", esc(formatTime(wf?.started_at)))}
  ${row("Pausiert seit (aktuell)", esc(wf?.status === "paused" ? formatTime(wf?.paused_at) : "—"))}
  ${row("Beendet", esc(formatTime(wf?.finished_at)))}
</table>
<div class="kpi">
  <div class="cell"><div class="lbl">Gesamt-Arbeitszeit</div><div class="val">${esc(formatDuration(workMs))}</div></div>
  <div class="cell"><div class="lbl">Pause-Zeit</div><div class="val">${esc(formatDuration(pauseMs))}</div></div>
  <div class="cell"><div class="lbl">Pause-Anzahl</div><div class="val">${workflowEvents.filter(e => e.type === 'pause').length}</div></div>
  <div class="cell"><div class="lbl">Ereignisse gesamt</div><div class="val">${events.length}</div></div>
</div>

<h2>3. Verlauf · Notizen</h2>
${workflowEvents.length === 0 ? '<p class="muted">Keine Arbeits-Ereignisse vorhanden.</p>' : `
<table class="events">
  <thead><tr><th></th><th>Ereignis</th><th>Zeit</th><th>Notiz</th><th>Von</th></tr></thead>
  <tbody>${[...workflowEvents].sort((a,b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map(eventRow).join("")}</tbody>
</table>`}

<h2>4. Timeline (Mitarbeiter-Markierungen)</h2>
${timelines.length === 0 ? '<p class="muted">Keine Timeline-Einträge.</p>' : `
<table class="events">
  <thead><tr><th></th><th>Typ</th><th>Zeit</th><th>Notiz</th><th>Von</th></tr></thead>
  <tbody>${[...timelines].sort((a,b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map(eventRow).join("")}</tbody>
</table>`}

<h2>5. Admin-Änderungen</h2>
${adminEvents.length === 0 ? '<p class="muted">Keine Admin-Änderungen.</p>' : `
<table class="events">
  <thead><tr><th></th><th>Aktion</th><th>Zeit</th><th>Notiz</th><th>Von</th></tr></thead>
  <tbody>${[...adminEvents].sort((a,b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map(eventRow).join("")}</tbody>
</table>`}

<div class="footer">
  Gedruckt am ${esc(now.toLocaleDateString("de-DE"))} um ${esc(now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }))} · Reinigung Aufgabenverwaltung
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) { alert("Popup blockiert. Bitte Popups für diese Seite erlauben."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
