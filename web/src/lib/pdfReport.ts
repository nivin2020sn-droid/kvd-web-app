// Direct PDF generation using jsPDF + jspdf-autotable.
// - Clean A4 black-on-white layout, automatic multi-page pagination.
// - Notiz column uses autotable's `cellWidth: 'auto'` with break-word wrapping.
// - Filename: Aufgabe_<YYYY-MM-DD>_<Aufgabentyp>.pdf

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Task, SimpleItem } from "./types";
import type { TaskWorkflow, WorkflowEvent } from "./workflow";
import { EVENT_LABEL, STATUS_LABEL_DE, totalWorkMs, totalPauseMs, formatDuration, buildDailyBreakdown, fetchAllWorkflows, getWorkflow } from "./workflow";
import { loadServerConfig } from "./serverConfig";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }); }
  catch { return "—"; }
}
function fmtTime24(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Europe/Berlin" }); }
  catch { return "—"; }
}
function evTime(ev: WorkflowEvent): string {
  if (ev.display_time && /^\d{2}:\d{2}/.test(ev.display_time)) return `${ev.display_time}:00`;
  return fmtTime24(ev.ts);
}
function evDate(ev: WorkflowEvent): string {
  if (ev.display_date && /^\d{4}-\d{2}-\d{2}$/.test(ev.display_date)) {
    const [y, m, d] = ev.display_date.split("-");
    return `${d}.${m}.${y}`;
  }
  return fmtDate(ev.ts);
}
function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Resolve the freshest workflow available (server > local). We try (best-effort)
 * to pull the latest from the configured server so the PDF reflects the current
 * state, but never blocks long: we fall back to the local workflow on any error
 * or after a short timeout.
 */
async function resolveWorkflow(taskId: string, fallback: TaskWorkflow | null): Promise<TaskWorkflow | null> {
  if (loadServerConfig()) {
    try {
      const all = await Promise.race([
        fetchAllWorkflows(),
        new Promise<Record<string, TaskWorkflow>>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
      ]);
      if (all && all[taskId]) return all[taskId];
    } catch {}
  }
  // Local fallback
  try { return getWorkflow(taskId) || fallback; } catch { return fallback; }
}

export async function downloadTaskPdf(task: Task | null | undefined, wf: TaskWorkflow | null, persons: SimpleItem[]) {
  // ---- Validation: refuse to export if there is nothing meaningful to print ----
  if (!task || !task.id) {
    alert("Keine Daten zum Export");
    return;
  }

  try {
    // Always fetch the latest workflow data — this fixes "empty PDF" caused by
    // stale state when the user clicks the button before the workflow finished loading.
    const freshWf = await resolveWorkflow(task.id, wf);

    // If there is literally NOTHING to put into the PDF beyond the task header,
    // we still allow export, but only when the task itself looks valid.
    const hasEvents = !!(freshWf && freshWf.events && freshWf.events.length);
    const hasTaskHeader = !!(task.task_type && task.task_type.trim().length);
    if (!hasTaskHeader && !hasEvents) {
      alert("Keine Daten zum Export");
      return;
    }

    await renderPdf(task, freshWf, persons || []);
  } catch (err: any) {
    console.error("PDF export failed:", err);
    alert("PDF-Export fehlgeschlagen: " + (err?.message || "Unbekannter Fehler"));
  }
}

async function renderPdf(task: Task, wf: TaskWorkflow | null, persons: SimpleItem[]) {
  const personNames = task.person_ids.map((id) => persons.find((p) => p.id === id)?.name || "—").join(", ") || "—";
  const workMs = wf ? totalWorkMs(wf) : 0;
  const pauseMs = wf ? totalPauseMs(wf) : 0;
  const events: WorkflowEvent[] = wf && wf.events
    ? [...wf.events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    : [];
  const statusLabel = wf ? STATUS_LABEL_DE[wf.status] : "—";
  const datum = fmtDate(task.task_date || new Date().toISOString());
  const datumISO = (task.task_date || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();  // 297
  const marginX = 14;
  const marginTop = 16;
  const marginBottom = 16;

  // ===== HEADER =====
  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(task.task_type || "Aufgabe", pageW - marginX * 2 - 60);
  doc.text(titleLines, marginX, marginTop + 6);

  // Right side: date & status
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(datum, pageW - marginX, marginTop + 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`${task.time_from} – ${task.time_to}`, pageW - marginX, marginTop + 9, { align: "right" });

  // Status pill (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  const statusTxt = statusLabel.toUpperCase();
  const pillPadX = 3;
  const sw = doc.getTextWidth(statusTxt) + pillPadX * 2;
  const sx = pageW - marginX - sw;
  const sy = marginTop + 12;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(sx, sy, sw, 5.5);
  doc.text(statusTxt, sx + pillPadX, sy + 3.9);

  // Worker name (subtitle under title)
  let cursorY = marginTop + 8 + titleLines.length * 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(personNames, marginX, cursorY);

  cursorY += 4;
  // Separator line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(marginX, cursorY, pageW - marginX, cursorY);
  cursorY += 6;

  // ===== SECTION: Aufgaben-Informationen =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("AUFGABEN-INFORMATIONEN", marginX, cursorY);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1.2, pageW - marginX, cursorY + 1.2);
  cursorY += 4;

  const infoRows: Array<[string, string]> = [
    ["Datum", datum],
    ["Aufgabentyp", task.task_type || "—"],
    ["Haus", task.haus || "—"],
    ["Station", task.station || "—"],
    ["Mitarbeiter", personNames],
    ["Beschreibung", task.description || "—"],
    ["Zeit von", task.time_from || "—"],
    ["Zeit bis", task.time_to || "—"],
    ["Status", statusLabel],
    ["Gesamt-Arbeitszeit", formatDuration(workMs)],
    ["Pause-Zeit", formatDuration(pauseMs)],
  ];

  autoTable(doc, {
    startY: cursorY,
    theme: "plain",
    margin: { left: marginX, right: marginX },
    styles: {
      font: "helvetica",
      fontSize: 10.5,
      cellPadding: { top: 2.2, right: 3, bottom: 2.2, left: 3 },
      lineColor: [210, 210, 210],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
      overflow: "linebreak",
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: "bold", fillColor: [245, 245, 245] },
      1: { cellWidth: "auto" },
    },
    body: infoRows,
    didDrawCell: (data) => {
      // Horizontal row separators only (no full grid)
      if (data.section === "body") {
        const { doc: d, cell } = data;
        d.setDrawColor(220, 220, 220);
        d.setLineWidth(0.1);
        d.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
      }
    },
  });

  // @ts-ignore — lastAutoTable is injected by autotable
  cursorY = (doc as any).lastAutoTable.finalY + 9;

  // ===== SECTION: Verlauf & Timeline =====
  const days = wf ? buildDailyBreakdown(wf) : [];
  const multiDay = days.length > 1;
  // Ensure we have room for heading + table header
  if (cursorY > pageH - marginBottom - 40) {
    doc.addPage();
    cursorY = marginTop;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("VERLAUF & TIMELINE", marginX, cursorY);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1.2, pageW - marginX, cursorY + 1.2);
  cursorY += 4;

  if (multiDay) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Diese Aufgabe erstreckt sich über ${days.length} Arbeitstage. Einträge sind nach Tagen gruppiert.`, marginX, cursorY + 3);
    cursorY += 7;
  }

  const renderEventTable = (evs: WorkflowEvent[], startY: number): number => {
    const body = evs.map((ev) => {
      const typeLabel = EVENT_LABEL[ev.type] || ev.type;
      const undone = ev.undone ? " (zurückgenommen)" : "";
      const creator = ev.created_by ? `\n(${ev.created_by})` : "";
      const typCell = `${typeLabel}${undone}${creator}`;
      const zeitCell = `${evTime(ev)}\n${evDate(ev)}`;
      let notizCell = ev.note || "—";
      if (ev.corrections && ev.corrections.length) {
        const corrStr = ev.corrections.map((co) => `• ${EVENT_LABEL[co.target_type]}: ${fmtTime24(co.old_ts)} → ${co.new_display_time ? co.new_display_time + ':00' : fmtTime24(co.new_ts)}`).join("\n");
        notizCell = notizCell === "—" ? corrStr : `${notizCell}\n${corrStr}`;
      }
      return { typ: typCell, zeit: zeitCell, notiz: notizCell, _undone: !!ev.undone };
    });
    autoTable(doc, {
      startY,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: marginBottom },
      head: [["Typ", "Zeit (24h)", "Notiz"]],
      body: body.map((r) => [r.typ, r.zeit, r.notiz]),
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9.5,
        cellPadding: { top: 3, right: 4, bottom: 3, left: 4 },
        halign: "left",
      },
      styles: {
        font: "helvetica",
        fontSize: 10.5,
        cellPadding: { top: 3.5, right: 4, bottom: 3.5, left: 4 },
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        textColor: [0, 0, 0],
        overflow: "linebreak",
        valign: "top",
      },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 32, font: "courier", fontSize: 10 },
        2: { cellWidth: "auto" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && body[data.row.index]?._undone) {
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = "italic";
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body") {
          const { doc: d, cell } = data;
          d.setDrawColor(220, 220, 220);
          d.setLineWidth(0.1);
          d.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
        }
      },
    });
    return (doc as any).lastAutoTable.finalY;
  };

  if (events.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text("Keine Ereignisse vorhanden.", marginX, cursorY + 4);
  } else if (!multiDay) {
    cursorY = renderEventTable(events, cursorY);
  } else {
    // Render a boxed section per day
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      // Need space for day header (approx 14mm)
      if (cursorY > pageH - marginBottom - 30) { doc.addPage(); cursorY = marginTop; }

      // Day header box
      const boxTop = cursorY;
      const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
      const dayPersons = d.persons.length ? d.persons.map((id) => persons.find((p) => p.id === id)?.name || id.slice(0, 6)).join(", ") : "—";
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.setFillColor(245, 245, 245);
      doc.rect(marginX, boxTop, pageW - marginX * 2, 14, "FD");
      // Tag N + date
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`TAG ${i + 1}`, marginX + 3, boxTop + 4.5);
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(dayLabel, marginX + 3, boxTop + 9.5);
      // KPIs on right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      doc.text("Arbeitszeit", pageW - marginX - 40, boxTop + 4.5);
      doc.text("Pause-Zeit", pageW - marginX - 18, boxTop + 4.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text(formatDuration(d.workMs), pageW - marginX - 40, boxTop + 9.5);
      doc.text(formatDuration(d.pauseMs), pageW - marginX - 18, boxTop + 9.5);
      // Mitarbeiter line
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      const persLines = doc.splitTextToSize(`Mitarbeiter: ${dayPersons}`, pageW - marginX * 2 - 6);
      doc.text(persLines, marginX + 3, boxTop + 13);
      cursorY = boxTop + 14 + Math.max(0, (persLines.length - 1) * 3.5) + 2;

      // Events table
      if (d.events.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor(110, 110, 110);
        doc.text("Keine Ereignisse an diesem Tag.", marginX + 3, cursorY + 4);
        cursorY += 8;
      } else {
        cursorY = renderEventTable(d.events, cursorY) + 6;
      }
    }
  }

  // ===== FOOTER (on every page) =====
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    const now = new Date();
    const printedAt = `Erstellt am ${now.toLocaleDateString("de-DE")} · ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageH - marginBottom + 4, pageW - marginX, pageH - marginBottom + 4);
    doc.text(printedAt, marginX, pageH - marginBottom + 9);
    doc.text(`Seite ${i} / ${totalPages}`, pageW - marginX, pageH - marginBottom + 9, { align: "right" });
    doc.text("Reinigung · Aufgabenbericht", pageW / 2, pageH - marginBottom + 9, { align: "center" });
  }

  // Save: Aufgabe_<YYYY-MM-DD>_<Aufgabentyp>.pdf
  const filename = `Aufgabe_${datumISO}_${sanitizeFilename(task.task_type || "Aufgabe")}.pdf`;
  // Mobile-safe download: do NOT rely on doc.save() which can silently fail on
  // Android Chrome / iOS Safari. Generate a real Blob and attach an anchor to
  // the DOM with an explicit `download` attribute. Avoid display:none.
  const blob: Blob = (doc.output as any)("blob");
  triggerMobileSafeDownload(blob, filename);
}

/**
 * Robust download helper that works across:
 *  - Desktop Chrome/Firefox/Edge/Safari
 *  - Android Chrome (where window.open + data URI is blocked/empty)
 *  - iOS Safari (where `download` attribute is partially supported)
 *
 * Strategy: create a real <a> element *visible* on screen (off-screen via
 * transform) with `download` attribute → synthesize click event → revoke URL
 * after the browser has started the download.
 */
export function triggerMobileSafeDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank"; // iOS Safari fallback: opens in new tab if download attr unsupported
    // Off-screen but NOT display:none (Android sometimes ignores hidden anchors)
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "0";
    a.style.opacity = "0";
    a.style.pointerEvents = "none";
    document.body.appendChild(a);
    // Use a real MouseEvent so Android dispatches the download correctly
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
    a.dispatchEvent(evt);
    // Cleanup on next tick (some browsers need the anchor alive briefly)
    setTimeout(() => {
      try { document.body.removeChild(a); } catch {}
      URL.revokeObjectURL(url);
    }, 1500);
  } catch (e) {
    // Last-resort fallback: open in new tab so user can long-press → save
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
