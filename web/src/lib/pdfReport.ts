// Direct PDF generation using jsPDF + jspdf-autotable.
// - Clean A4 black-on-white layout, automatic multi-page pagination.
// - Notiz column uses autotable's `cellWidth: 'auto'` with break-word wrapping.
// - Filename: Aufgabe_<YYYY-MM-DD>_<Aufgabentyp>.pdf

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Task, SimpleItem } from "./types";
import type { TaskWorkflow, WorkflowEvent } from "./workflow";
import { EVENT_LABEL, STATUS_LABEL_DE, totalWorkMs, totalPauseMs, formatDuration } from "./workflow";

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
function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function downloadTaskPdf(task: Task, wf: TaskWorkflow | null, persons: SimpleItem[]) {
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

  if (events.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text("Keine Ereignisse vorhanden.", marginX, cursorY + 4);
  } else {
    const eventBody = events.map((ev) => {
      const typeLabel = EVENT_LABEL[ev.type] || ev.type;
      const undone = ev.undone ? " (zurückgenommen)" : "";
      const creator = ev.created_by ? `\n(${ev.created_by})` : "";
      const typCell = `${typeLabel}${undone}${creator}`;
      const zeitCell = `${fmtTime24(ev.ts)}\n${fmtDate(ev.ts)}`;
      let notizCell = ev.note || "—";
      if (ev.corrections && ev.corrections.length) {
        const corrStr = ev.corrections.map((co) => `• ${EVENT_LABEL[co.target_type]}: ${fmtTime24(co.old_ts)} → ${fmtTime24(co.new_ts)}`).join("\n");
        notizCell = notizCell === "—" ? corrStr : `${notizCell}\n${corrStr}`;
      }
      return { typ: typCell, zeit: zeitCell, notiz: notizCell, _undone: !!ev.undone };
    });

    autoTable(doc, {
      startY: cursorY,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: marginBottom },
      head: [["Typ", "Zeit (24h)", "Notiz"]],
      body: eventBody.map((r) => [r.typ, r.zeit, r.notiz]),
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
        0: { cellWidth: 38 },                           // Typ  (fixed but wraps)
        1: { cellWidth: 32, font: "courier", fontSize: 10 }, // Zeit  (mono)
        2: { cellWidth: "auto" },                       // Notiz (fills rest, wraps)
      },
      didParseCell: (data) => {
        if (data.section === "body" && eventBody[data.row.index]?._undone) {
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
  doc.save(filename);
}
