// Direct PDF generation using jsPDF + jspdf-autotable.
// - Clean A4 black-on-white layout, automatic multi-page pagination.
// - Notiz column uses autotable's `cellWidth: 'auto'` with break-word wrapping.
// - Filename: Aufgabe_<YYYY-MM-DD>_<Aufgabentyp>.pdf

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Task, SimpleItem } from "./types";
import type { TaskWorkflow, WorkflowEvent, EventType } from "./workflow";
import { EVENT_LABEL, STATUS_LABEL_DE, totalWorkMs, totalPauseMs, personHoursMsByPeriod, formatDuration, buildDailyBreakdown, fetchAllWorkflows, getWorkflow, formatEventNote } from "./workflow";
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
 * Normalize user-entered text for PDF rendering.
 * - Convert Windows / Mac line endings to "\n" so jsPDF + autotable
 *   recognise them as explicit line breaks.
 * - Trim trailing whitespace per line (keeps user-intended blank lines).
 * - DO NOT collapse multiple newlines — user may want blank paragraphs.
 */
function normalizeMultiline(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))   // strip trailing spaces only
    .join("\n");
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
  // ---------- 1) Per-day breakdown (computed once, used everywhere) ----------
  const days = wf ? buildDailyBreakdown(wf) : [];
  const multiDay = days.length > 1;

  // ---------- 2) Union of ALL employees who participated across the whole task ----------
  //   Build a stable, deduplicated list ordered by first-seen day, then by
  //   creation order inside that day. Falls back to task.person_ids if there
  //   is no workflow yet (freshly created task).
  const personIdSet = new Set<string>();
  const orderedPersonIds: string[] = [];
  const seenAddPerson = (pid: string) => {
    if (!pid || personIdSet.has(pid)) return;
    personIdSet.add(pid);
    orderedPersonIds.push(pid);
  };
  for (const d of days) for (const pid of d.persons) seenAddPerson(pid);
  for (const pid of (task.person_ids || [])) seenAddPerson(pid);
  const personLookup = (pid: string) => persons.find((p) => p.id === pid)?.name || "—";
  const allPersonNames = orderedPersonIds.map(personLookup).filter((n) => n && n !== "—");
  const personNames = allPersonNames.join(", ") || "—";
  const personCountTotal = orderedPersonIds.length;

  // ---------- 3) Project start/end dates (first / last day with activity) ----------
  const projektBeginnISO = days[0]?.date || (task.task_date || new Date().toISOString().slice(0, 10));
  const projektEndeISO   = days[days.length - 1]?.date || projektBeginnISO;
  const projektBeginn = fmtDate(projektBeginnISO);
  const projektEnde   = fmtDate(projektEndeISO);

  // ---------- 4) Time totals — UNCHANGED logic ----------
  const workMs = wf ? totalWorkMs(wf) : 0;
  const pauseMs = wf ? totalPauseMs(wf) : 0;
  // Personenstunden = Σ (Arbeitszeit pro Tag × Anzahl Mitarbeiter dieses Tages).
  // Multi-day-correct: respects per-day staffing snapshots stored in events.
  // We pass the UNION-count so single-day legacy behaviour stays identical for
  // tasks that never had mitarbeiter_hinzu (the personHoursMsByPeriod logic
  // prefers per-event snapshots over this fallback anyway).
  const personHoursReport = wf
    ? personHoursMsByPeriod(wf, personCountTotal)
    : { totalMs: 0, periods: [] };
  const personHours = personHoursReport.totalMs;
  const events: WorkflowEvent[] = wf && wf.events
    ? [...wf.events].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    : [];
  const statusLabel = wf ? STATUS_LABEL_DE[wf.status] : "—";

  // ---------- 5) Bereich = Haus + Station combined into one field ----------
  const haus = (task.haus || "").trim();
  const station = (task.station || "").trim();
  const bereich = haus && station ? `${haus}${station}` : (haus || station || "—");

  // Used for filename + footer
  const datumISO = projektBeginnISO.slice(0, 10);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  // ----- Global text rendering defaults — defensive resets so user-entered
  // multi-line text (Beschreibung, Notiz) is rendered with NATURAL letter and
  // line spacing, exactly as typed by the user. jsPDF defaults are mostly fine
  // but we set them explicitly so future jsPDF upgrades cannot regress.
  doc.setCharSpace(0);              // NO extra spacing between glyphs
  doc.setLineHeightFactor(1.4);     // comfortable paragraph leading (~140%)
  doc.setLanguage("de");
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

  // Right side: project range (Beginn → Ende) instead of single date.
  // For single-day tasks both values are identical, so we just show one line.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  if (projektBeginnISO === projektEndeISO) {
    doc.text(projektBeginn, pageW - marginX, marginTop + 4, { align: "right" });
  } else {
    doc.text(`${projektBeginn} – ${projektEnde}`, pageW - marginX, marginTop + 4, { align: "right" });
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  // Second small line: number of work days (only when multi-day).
  if (days.length > 1) {
    doc.text(`${days.length} Arbeitstage`, pageW - marginX, marginTop + 9, { align: "right" });
  }

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

  // ----- Compact, management-friendly summary table -----
  // Removed: single "Datum", "Haus" / "Station" (now Bereich), "Zeit von" / "Zeit bis"
  //         (these are per-day values and shown in the daily summary table below).
  // Added:   "Projektbeginn" / "Projektende" (first/last work day), "Bereich" (Haus+Station)
  const infoRows: Array<[string, string]> = [
    ["Projektbeginn", projektBeginn],
    ["Projektende",   projektEnde],
    ["Aufgabentyp",   task.task_type || "—"],
    ["Bereich",       bereich],
    // All-time roster: deduplicated union of every Mitarbeiter who ever
    // participated on any day. Order = first-seen day.
    ["Mitarbeiter",   personNames],
    // Multi-line descriptions: preserve user newlines via normalizeMultiline.
    // jspdf-autotable with overflow:'linebreak' honours "\n" as a hard break.
    ["Beschreibung",  normalizeMultiline(task.description) || "—"],
    ["Status",        statusLabel],
    // UNIQUE count across all days (NOT just last day's snapshot).
    ["Gesamtmitarbeiter", String(personCountTotal)],
    ["Gesamt-Arbeitszeit", formatDuration(workMs)],
    ["Pause-Zeit",         formatDuration(pauseMs)],
    // 👥 Personenstunden = Arbeitszeit × Mitarbeiter — gleicher HH:MM:SS-Format.
    ["Personenstunden",    formatDuration(personHours)],
  ];

  autoTable(doc, {
    startY: cursorY,
    theme: "plain",
    margin: { left: marginX, right: marginX },
    styles: {
      font: "helvetica",
      fontSize: 10.5,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      lineColor: [210, 210, 210],
      lineWidth: 0.1,
      textColor: [0, 0, 0],
      // CRITICAL for multi-line content (Beschreibung etc.):
      //   - 'linebreak' makes autotable honour "\n" inside the cell value
      //     AND wrap long words at the cell width.
      //   - halign:'left' prevents any justified spacing weirdness.
      //   - valign:'top' keeps short labels aligned to first line.
      overflow: "linebreak",
      halign: "left",
      valign: "top",
      // Slightly more generous line height for paragraph readability.
      // Matches our global setLineHeightFactor above.
      // (autotable reads this from the table-level styles.)
    },
    columnStyles: {
      0: { cellWidth: 58, fontStyle: "bold", fillColor: [245, 245, 245], valign: "top" },
      1: { cellWidth: "auto", overflow: "linebreak", halign: "left", valign: "top" },
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

  // ===== SECTION: Personenstunden — Tag-für-Tag / Period-für-Period =====
  // Renders sub-periods so each "mitarbeiter_hinzu" event splits a day.
  if (personHoursReport.periods.length > 0 && (
    personHoursReport.periods.length >= 2 ||
    personHoursReport.periods.some((p) => p.personCount !== personCountTotal)
  )) {
    if (cursorY > pageH - marginBottom - 30) { doc.addPage(); cursorY = marginTop; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(124, 58, 237);   // violet 7C3AED to match UI accent
    doc.text("PERSONENSTUNDEN — TAG-FÜR-TAG", marginX, cursorY);
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.4);
    doc.line(marginX, cursorY + 1.2, pageW - marginX, cursorY + 1.2);
    cursorY += 4.5;
    const phRows = personHoursReport.periods.map((p) => [
      `${p.date}  ${p.startHHMM}–${p.endHHMM}`,
      formatDuration(p.durationMs),
      `× ${Math.max(1, p.personCount)}`,
      formatDuration(p.personHoursMs),
    ]);
    phRows.push(["GESAMT", "", "", formatDuration(personHoursReport.totalMs)]);
    autoTable(doc, {
      startY: cursorY,
      theme: "plain",
      margin: { left: marginX, right: marginX },
      head: [["Tag · Periode", "Arbeitszeit", "Mitarbeiter", "Personenstunden"]],
      body: phRows,
      headStyles: {
        fillColor: [124, 58, 237],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
        halign: "left",
      },
      styles: {
        font: "helvetica",
        fontSize: 10,
        cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
        textColor: [0, 0, 0],
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        overflow: "linebreak",
        halign: "left",
        valign: "top",
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 32, font: "courier" },
        2: { cellWidth: 28, halign: "center" },
        3: { cellWidth: "auto", font: "courier", fontStyle: "bold", halign: "right", textColor: [124, 58, 237] },
      },
      didParseCell: (data) => {
        // Bold + accent on the GESAMT row
        if (data.section === "body" && phRows[data.row.index]?.[0] === "GESAMT") {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [243, 240, 255];
          data.cell.styles.textColor = [124, 58, 237];
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
    // @ts-ignore
    cursorY = (doc as any).lastAutoTable.finalY + 9;
  }

  // ===== SECTION: TÄGLICHE ZUSAMMENFASSUNG =====
  // Replaces the old "Verlauf & Timeline" which dumped every technical event.
  // Management-friendly: ONE summary card per day. Full technical history
  // remains available inside the app (we don't delete any data).
  // Ensure we have room for heading + first day card
  if (cursorY > pageH - marginBottom - 40) {
    doc.addPage();
    cursorY = marginTop;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("TÄGLICHE ZUSAMMENFASSUNG", marginX, cursorY);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1.2, pageW - marginX, cursorY + 1.2);
  cursorY += 4;

  if (multiDay) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(
      `Diese Aufgabe erstreckt sich über ${days.length} Arbeitstage. Pro Tag wird der wichtigste Eintrag angezeigt.`,
      marginX, cursorY + 3,
    );
    cursorY += 7;
  }

  // --- helpers used only by this section ---
  const fmtTimeHM = (iso: string | null | undefined): string => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString("de-DE", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Berlin",
      });
    } catch { return "—"; }
  };
  // Pick the single "most important" note of the day. Priority:
  //   1. Latest non-empty `beenden` note  (project closure summary)
  //   2. Latest non-empty `feierabend` note (end-of-day status)
  //   3. Latest non-empty `timeline` entry (free-form daily log)
  //   4. Any other non-empty user note (latest first)
  // Admin / undone events are skipped — they are technical bookkeeping.
  const pickDayNote = (d: { events: WorkflowEvent[] }): string | null => {
    const noteOf = (ev: WorkflowEvent) =>
      normalizeMultiline(formatEventNote(ev)).trim();
    const isAdmin = (ev: WorkflowEvent) =>
      ev.type === "admin_zeitkorrektur" || ev.type === "admin_beenden_rueckgaengig";
    const userEvents = d.events.filter((ev) => !ev.undone && !isAdmin(ev));
    const inOrder = [...userEvents].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
    );
    const priority: EventType[] = ["beenden", "feierabend", "timeline"];
    for (const t of priority) {
      const matches = inOrder.filter((e) => e.type === t);
      for (let i = matches.length - 1; i >= 0; i--) {
        const n = noteOf(matches[i]);
        if (n) return n;
      }
    }
    // Fallback: latest non-empty note from any remaining user event.
    for (let i = inOrder.length - 1; i >= 0; i--) {
      const n = noteOf(inOrder[i]);
      if (n) return n;
    }
    return null;
  };

  if (days.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text("Keine Arbeitstage vorhanden.", marginX, cursorY + 4);
    cursorY += 8;
  } else {
    // Build daily-summary rows for autoTable. We use a one-table approach so
    // page-breaks are handled automatically across many days.
    const dayRows = days.map((d, idx) => {
      const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("de-DE", {
        weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
      });
      const dayPersonsList = d.persons.length
        ? d.persons.map((id) => personLookup(id)).filter((n) => n && n !== "—")
        : [];
      const dayPersonsStr = dayPersonsList.length
        ? `${dayPersonsList.length} – ${dayPersonsList.join(", ")}`
        : "—";
      const tagNote = pickDayNote(d);
      // Compose the right-hand summary cell as a single multi-line string.
      // Labels are bold-ish via a leading icon-free label. jsPDF doesn't do
      // mixed-weight inside a single cell easily; this is the cleanest
      // management-report-style layout.
      const lines = [
        `Arbeitsbeginn: ${fmtTimeHM(d.started_at)}`,
        `Arbeitsende:   ${fmtTimeHM(d.finished_at || d.feierabend_at)}`,
        `Arbeitszeit:   ${formatDuration(d.workMs)}`,
        `Pause-Zeit:    ${formatDuration(d.pauseMs)}`,
        `Mitarbeiter:   ${dayPersonsStr}`,
      ];
      if (tagNote) lines.push(`Tagesnotiz:    ${tagNote}`);
      return {
        tag: `Tag ${idx + 1}\n${dayLabel}`,
        summary: lines.join("\n"),
      };
    });

    autoTable(doc, {
      startY: cursorY,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: marginBottom },
      head: [["Tag", "Zusammenfassung"]],
      body: dayRows.map((r) => [r.tag, r.summary]),
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
        cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
        lineColor: [220, 220, 220],
        lineWidth: 0.1,
        textColor: [0, 0, 0],
        overflow: "linebreak",
        halign: "left",
        valign: "top",
      },
      columnStyles: {
        0: {
          cellWidth: 36,
          fontStyle: "bold",
          fillColor: [245, 245, 245],
          valign: "middle",
          halign: "left",
        },
        1: {
          cellWidth: "auto",
          font: "courier",
          fontSize: 10,
          overflow: "linebreak",
          valign: "top",
        },
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
    cursorY = (doc as any).lastAutoTable.finalY + 6;
  }

  // ===== SECTION: FOTOS =====
  const photos = Array.isArray(task.photos) ? [...task.photos].sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()) : [];
  if (photos.length > 0) {
    cursorY = await renderPhotosSection(doc, photos, persons, pageW, pageH, marginX, marginTop, marginBottom, cursorY);
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

/**
 * Render the "Fotos" section with embedded high-quality images.
 * - Fetches each Cloudinary URL as blob → dataURL (required by jsPDF addImage)
 * - Arranges images in a 2-column grid, 1 page per page
 * - Each image shows: Datum/Uhrzeit · Mitarbeiter · Kommentar
 */
async function renderPhotosSection(
  doc: any,
  photos: any[],
  _persons: any[],
  pageW: number,
  pageH: number,
  marginX: number,
  marginTop: number,
  marginBottom: number,
  startY: number,
): Promise<number> {
  // Section header
  let cursorY = startY;
  if (cursorY > pageH - marginBottom - 40) { doc.addPage(); cursorY = marginTop; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text("FOTOS", marginX, cursorY);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY + 1.2, pageW - marginX, cursorY + 1.2);
  cursorY += 6;

  // 2 columns layout
  const gap = 4;
  const cols = 2;
  const colW = (pageW - marginX * 2 - gap * (cols - 1)) / cols;
  const imgH = 65;             // mm — generous size for readability
  const captionH = 14;         // mm — space for metadata under image
  const itemH = imgH + captionH + gap;

  const fetchAsDataUrl = async (url: string): Promise<{ data: string; w: number; h: number } | null> => {
    try {
      const r = await fetch(url, { mode: "cors" });
      if (!r.ok) return null;
      const blob = await r.blob();
      const data = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(blob);
      });
      // Load image to get dimensions for correct aspect ratio
      const dim = await new Promise<{ w: number; h: number }>((res) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => res({ w: 1, h: 1 });
        img.src = data;
      });
      return { data, w: dim.w, h: dim.h };
    } catch { return null; }
  };

  for (let i = 0; i < photos.length; i++) {
    const col = i % cols;
    const x = marginX + col * (colW + gap);

    if (col === 0) {
      if (cursorY + itemH > pageH - marginBottom) { doc.addPage(); cursorY = marginTop; }
    }

    const p = photos[i];
    const loaded = await fetchAsDataUrl(p.fullSizeUrl || p.url || p.thumbnailUrl);

    // Frame
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.rect(x, cursorY, colW, imgH);
    doc.setFillColor(250, 250, 250);
    doc.rect(x, cursorY, colW, imgH, "F");

    if (loaded) {
      // Fit-to-box (contain)
      const ratio = loaded.w / loaded.h;
      const boxRatio = colW / imgH;
      let dw = colW, dh = imgH;
      if (ratio > boxRatio) { dh = colW / ratio; } else { dw = imgH * ratio; }
      const dx = x + (colW - dw) / 2;
      const dy = cursorY + (imgH - dh) / 2;
      try {
        doc.addImage(loaded.data, "JPEG", dx, dy, dw, dh, undefined, "FAST");
      } catch {
        try { doc.addImage(loaded.data, "PNG", dx, dy, dw, dh, undefined, "FAST"); } catch {}
      }
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("[Bild konnte nicht geladen werden]", x + 3, cursorY + imgH / 2);
    }

    // Metadata under image
    const metaY = cursorY + imgH + 3;
    const dateStr = (() => {
      try {
        const d = new Date(p.uploadedAt);
        return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })} · ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })}`;
      } catch { return "—"; }
    })();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text(dateStr, x + 1, metaY);
    if (p.uploadedBy) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const uLines = doc.splitTextToSize(p.uploadedBy, colW - 2);
      doc.text(uLines, x + 1, metaY + 3.5);
    }
    if (p.caption) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(90, 90, 90);
      const cLines = doc.splitTextToSize(p.caption, colW - 2);
      doc.text(cLines.slice(0, 2), x + 1, metaY + 7);
    }

    if (col === cols - 1 || i === photos.length - 1) cursorY += itemH;
  }
  return cursorY;
}

