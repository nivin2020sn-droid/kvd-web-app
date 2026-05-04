// Professional print-only report. Completely isolated from the app styles.
// - Pure black on white, subtle borders, no shadows/bgs.
// - A4 with @page margins. @media print hides the top bar & uses optimal font size.
// - Notiz column uses word-break + break-word; table-layout: auto.
// - Events are chronologically sorted and include Timeline entries.

import type { Task, SimpleItem } from "./types";
import type { TaskWorkflow, WorkflowEvent } from "./workflow";
import { EVENT_LABEL, STATUS_LABEL_DE, totalWorkMs, totalPauseMs, formatDuration, buildDailyBreakdown } from "./workflow";

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return "—"; }
}
function fmtTime24(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
  catch { return "—"; }
}

/** Build a chronological list combining workflow events and timeline events. */
function buildEventRows(wf: TaskWorkflow | null): WorkflowEvent[] {
  if (!wf || !wf.events) return [];
  return [...wf.events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

export function printTaskReport(task: Task, wf: TaskWorkflow | null, persons: SimpleItem[]) {
  const pn = (id: string) => persons.find((p) => p.id === id)?.name || "—";
  const personNames = task.person_ids.map(pn).join(", ") || "—";
  const workMs = wf ? totalWorkMs(wf) : 0;
  const pauseMs = wf ? totalPauseMs(wf) : 0;
  const events = buildEventRows(wf);
  const days = wf ? buildDailyBreakdown(wf) : [];
  const multiDay = days.length > 1;
  const title = `${task.task_type}`;
  const datumStr = fmtDate(task.task_date || new Date().toISOString());
  const statusLabel = wf ? STATUS_LABEL_DE[wf.status] : "—";

  const infoRow = (label: string, value: string) =>
    `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;

  const buildEventRowHtml = (ev: WorkflowEvent) => {
    const typeLabel = EVENT_LABEL[ev.type] || ev.type;
    const undone = ev.undone ? " (zurückgenommen)" : "";
    const corr = ev.corrections && ev.corrections.length
      ? `<div class="corrections">${ev.corrections.map((co) => `&bull; ${esc(EVENT_LABEL[co.target_type])}: ${esc(fmtTime24(co.old_ts))} &rarr; ${esc(fmtTime24(co.new_ts))}`).join("<br>")}</div>`
      : "";
    const noteText = ev.note ? esc(ev.note) : `<span class="muted">—</span>`;
    const createdBy = ev.created_by ? ` <span class="muted">(${esc(ev.created_by)})</span>` : "";
    const cls = ev.undone ? "undone" : "";
    return `
      <tr class="${cls}">
        <td class="col-typ"><strong>${esc(typeLabel)}</strong>${esc(undone)}${createdBy}</td>
        <td class="col-zeit">${esc(fmtTime24(ev.ts))}<div class="muted small">${esc(fmtDate(ev.ts))}</div></td>
        <td class="col-notiz">${noteText}${corr}</td>
      </tr>`;
  };

  const eventRows = events.map(buildEventRowHtml).join("");

  // Build per-day sections HTML (only when multi-day)
  const daysSectionsHtml = !multiDay ? "" : days.map((d, idx) => {
    const dayPersons = d.persons.length > 0 ? d.persons.map(pn).join(", ") : "—";
    const dayDate = fmtDate(d.date + "T12:00:00");
    const rows = d.events.map(buildEventRowHtml).join("");
    return `
    <div class="day-section">
      <div class="day-header">
        <div>
          <div class="day-tag">Tag ${idx + 1}</div>
          <div class="day-date">${esc(dayDate)}</div>
        </div>
        <div class="day-kpis">
          <div><span class="muted small">Arbeitszeit</span><div class="kpi-val">${esc(formatDuration(d.workMs))}</div></div>
          <div><span class="muted small">Pause-Zeit</span><div class="kpi-val">${esc(formatDuration(d.pauseMs))}</div></div>
        </div>
      </div>
      <table class="info compact">
        <tbody>
          <tr><th>Mitarbeiter</th><td>${esc(dayPersons)}</td></tr>
        </tbody>
      </table>
      ${d.events.length === 0 ? '<p class="muted">Keine Ereignisse an diesem Tag.</p>' : `
      <table class="events">
        <thead>
          <tr>
            <th class="col-typ">Typ</th>
            <th class="col-zeit">Zeit</th>
            <th class="col-notiz">Notiz</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`}
    </div>`;
  }).join("");

  const now = new Date();
  const printDateTime = `${now.toLocaleDateString("de-DE")} · ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Aufgabe ${esc(title)} · ${esc(datumStr)}</title>
<style>
  /* ---- reset ---- */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ---- Page setup ---- */
  @page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
  }

  .sheet {
    max-width: 178mm;
    margin: 0 auto;
    padding: 14mm 12mm;
  }

  /* ---- Header ---- */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 2px solid #000;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  .header .title-block { flex: 1; min-width: 0; }
  .header h1 {
    font-size: 22pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0 0 4px 0;
    word-break: break-word;
  }
  .header .worker {
    font-size: 11pt;
    color: #333;
    margin: 4px 0 0 0;
  }
  .header .meta {
    text-align: right;
    font-size: 10pt;
    white-space: nowrap;
    color: #000;
  }
  .header .meta .date-big {
    font-size: 13pt;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .header .meta .status {
    display: inline-block;
    margin-top: 6px;
    padding: 3px 10px;
    border: 1px solid #000;
    border-radius: 3px;
    font-weight: 700;
    font-size: 9.5pt;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  /* ---- Section titles ---- */
  h2 {
    font-size: 10.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin: 22px 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
    page-break-after: avoid;
  }

  /* ---- Info table ---- */
  table.info {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    page-break-inside: avoid;
  }
  table.info th, table.info td {
    padding: 7px 10px;
    border-bottom: 1px solid #ccc;
    text-align: left;
    vertical-align: top;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  table.info th {
    width: 38%;
    background: #f5f5f5;
    font-weight: 700;
    color: #000;
    font-size: 10pt;
  }
  table.info td { font-size: 11pt; }

  /* ---- Events table (the important one: prevent Notiz compression) ---- */
  table.events {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;          /* flexible widths */
    margin-top: 4px;
  }
  table.events thead th {
    background: #000;
    color: #fff;
    font-weight: 700;
    font-size: 9.5pt;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 8px 10px;
    text-align: left;
    border: 0;
  }
  table.events tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
    line-height: 1.5;
    font-size: 11pt;
  }
  /* column widths + text wrap behaviour */
  table.events .col-typ   { width: 120px;  min-width: 120px;  white-space: normal; word-break: break-word; overflow-wrap: break-word; }
  table.events .col-zeit  { width: 160px;  min-width: 140px;  white-space: normal; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
  table.events .col-notiz { width: auto;   max-width: none;   white-space: normal; word-break: break-word; overflow-wrap: break-word; hyphens: auto; }
  table.events tr.undone td { color: #666; text-decoration: line-through; }
  table.events tr { page-break-inside: avoid; }    /* keep a single row intact */
  table.events .corrections {
    font-size: 9.5pt;
    color: #555;
    margin-top: 4px;
    line-height: 1.4;
  }

  /* ---- Summary row (work/pause totals) ---- */
  .totals {
    display: flex;
    gap: 12px;
    margin: 8px 0 0 0;
    page-break-inside: avoid;
  }
  .totals .cell {
    flex: 1;
    border: 1px solid #000;
    padding: 8px 12px;
  }
  .totals .cell .lbl {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #333;
  }
  .totals .cell .val {
    font-size: 14pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
    margin-top: 2px;
  }

  /* ---- helpers ---- */
  .muted { color: #666; }
  .small { font-size: 9pt; }

  /* ---- Day section (multi-day Feierabend layout) ---- */
  .day-section {
    border: 1.5px solid #000;
    border-radius: 4px;
    margin: 10px 0 14px 0;
    padding: 10px 12px;
    page-break-inside: avoid;
  }
  .day-section .day-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #333;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .day-section .day-tag {
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #555;
  }
  .day-section .day-date {
    font-size: 13pt;
    font-weight: 700;
    margin-top: 2px;
  }
  .day-section .day-kpis {
    display: flex;
    gap: 20px;
    text-align: right;
  }
  .day-section .day-kpis .kpi-val {
    font-size: 12pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
  .day-section table.info.compact th,
  .day-section table.info.compact td {
    padding: 4px 8px;
    font-size: 10pt;
  }
  .day-section table.info.compact {
    margin-bottom: 6px;
  }

  /* ---- Footer ---- */
  .footer {
    margin-top: 28px;
    padding-top: 8px;
    border-top: 1px solid #ccc;
    font-size: 9pt;
    color: #555;
    display: flex;
    justify-content: space-between;
    gap: 20px;
  }

  /* ---- Print-only: hide the toolbar ---- */
  .toolbar {
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 99;
    background: #fff;
    border: 1px solid #000;
    border-radius: 4px;
    padding: 6px;
    display: flex;
    gap: 6px;
  }
  .toolbar button {
    font: inherit;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    border: 0;
    border-radius: 3px;
    font-weight: 700;
    cursor: pointer;
  }
  .toolbar button.secondary {
    background: #fff;
    color: #000;
    border: 1px solid #000;
  }

  @media print {
    .toolbar, .no-print { display: none !important; }
    body { font-size: 10.5pt; }
    .sheet { padding: 0; max-width: none; }
    a, a:visited { color: #000; text-decoration: none; }
    table.events thead { display: table-header-group; } /* repeat header on page break */
    table.info  thead { display: table-header-group; }
    tr, img { page-break-inside: avoid; }
    h1, h2, h3 { page-break-after: avoid; }
  }
</style>
</head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()">Drucken</button>
  <button class="secondary" onclick="window.close()">Schließen</button>
</div>

<div class="sheet">

  <div class="header">
    <div class="title-block">
      <h1>${esc(title)}</h1>
      <div class="worker">${esc(personNames)}</div>
    </div>
    <div class="meta">
      <div class="date-big">${esc(datumStr)}</div>
      <div class="small muted">${esc(task.time_from)} &ndash; ${esc(task.time_to)}</div>
      <div class="status">${esc(statusLabel)}</div>
    </div>
  </div>

  <h2>Aufgaben-Informationen</h2>
  <table class="info">
    <tbody>
      ${infoRow("Datum", esc(datumStr))}
      ${infoRow("Aufgabentyp", esc(task.task_type))}
      ${infoRow("Haus", esc(task.haus))}
      ${infoRow("Station", esc(task.station))}
      ${infoRow("Mitarbeiter", esc(personNames))}
      ${infoRow("Beschreibung", task.description ? esc(task.description) : '<span class="muted">—</span>')}
      ${infoRow("Zeit von", esc(task.time_from))}
      ${infoRow("Zeit bis", esc(task.time_to))}
      ${infoRow("Status", esc(statusLabel))}
      ${infoRow("Gesamt-Arbeitszeit", `<strong>${esc(formatDuration(workMs))}</strong>`)}
      ${infoRow("Pause-Zeit", `<strong>${esc(formatDuration(pauseMs))}</strong>`)}
    </tbody>
  </table>

  <h2>Verlauf &amp; Timeline</h2>
  ${multiDay ? `
    <p class="muted small" style="margin:0 0 8px 0">Diese Aufgabe erstreckt sich über <strong>${days.length} Arbeitstage</strong>. Die Einträge sind nach Tagen gruppiert.</p>
    ${daysSectionsHtml}
  ` : (events.length === 0 ? '<p class="muted">Keine Ereignisse vorhanden.</p>' : `
  <table class="events">
    <thead>
      <tr>
        <th class="col-typ">Typ</th>
        <th class="col-zeit">Zeit</th>
        <th class="col-notiz">Notiz</th>
      </tr>
    </thead>
    <tbody>
      ${eventRows}
    </tbody>
  </table>
  `)}

  <div class="footer">
    <div>Gedruckt am ${esc(printDateTime)}</div>
    <div>Reinigung &middot; Aufgabenbericht</div>
  </div>

</div>

<script>
  window.addEventListener('load', () => {
    // Leave the dialog-trigger out so the user can review the document first.
    // They click the Drucken button to trigger print.
  });
</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=980,height=1280");
  if (!w) { alert("Popup blockiert. Bitte Popups für diese Seite erlauben."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
