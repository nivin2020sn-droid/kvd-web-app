// =====================================================================
// LAGER REPORT — Export utilities for the warehouse module.
//
// Two report types:
//   • Full report  (Gesamtlager)  → every folder + every product
//   • Folder report (Ordnerbericht) → only products inside one folder
//                                     (recursive: includes sub-folders).
//
// Two output formats:
//   • PDF  (printable, with images, color-coded status)
//   • CSV  (Excel-friendly, semicolon-separated, BOM for UTF-8)
//
// IMPORTANT: this module ONLY reads. It never writes / mutates any
// product or folder. Pure export.
// =====================================================================
import { jsPDF } from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";
import { api } from "./api";
import { getWarnSymbol } from "../components/WarnSymbols";

// ---------- Public types (mirror server schema) ----------
export interface LagerFolder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order?: number;
  image_url?: string | null;
  image_thumbnail?: string | null;
  image_public_id?: string | null;
  created_at: string;
}
export interface LagerProduct {
  id: string;
  folder_id: string;
  name: string;
  lan?: string | null;
  image_url?: string | null;
  image_thumbnail?: string | null;
  image_public_id?: string | null;
  menge: number;
  einheit: string;
  inhalt_pro_stueck?: number | null;
  zweite_einheit?: string | null;
  minimum_quantity?: number;
  info_text?: string;
  warn_symbols?: string[];
  created_at: string;
}

// Stock status — identical semantics to LagerViews.computeStock().
export type StockStatus = "critical" | "low" | "ok" | "neutral";
export function computeStockStatus(p: LagerProduct): StockStatus {
  const m = Number(p.menge) || 0;
  const min = Number(p.minimum_quantity) || 0;
  if (m <= 0) return "critical";
  if (min > 0 && m < min) return "low";
  if (min > 0) return "ok";
  return "neutral";
}

// German status label used in both PDF and CSV.
const STATUS_LABEL: Record<StockStatus, string> = {
  critical: "Leer",
  low: "Niedrig",
  ok: "Ausreichend",
  neutral: "—",
};

// RGB colors for PDF row backgrounds (subtle tint, white text not needed).
const STATUS_BG_RGB: Record<StockStatus, [number, number, number]> = {
  critical: [255, 220, 220], // light red
  low:      [255, 235, 205], // light orange
  ok:       [220, 245, 220], // light green
  neutral:  [245, 245, 245], // light gray
};
const STATUS_FG_RGB: Record<StockStatus, [number, number, number]> = {
  critical: [180,  20,  20],
  low:      [180,  90,   0],
  ok:       [ 30, 130,  30],
  neutral:  [ 90,  90,  90],
};

// ---------- Data loading ----------
export interface LagerReportInput {
  scope: "all" | "folder";
  folderId?: string;          // required when scope === "folder"
  folderName?: string;        // shown in the report title (optional)
  lagerPv?: number;           // PIN-session version (required for /lager/* endpoints)
}
export interface LagerReportData {
  generatedAt: Date;
  scope: "all" | "folder";
  title: string;                       // e.g. "LAGERBERICHT" or "ORDNERBERICHT — Taubennetze"
  folderTree: LagerFolder[];           // ALL folders (for path lookup)
  groups: Array<{
    folder: LagerFolder;
    products: LagerProduct[];          // already sorted by LAN asc, name asc
  }>;
  totals: {
    productCount: number;
    ok: number;
    low: number;
    critical: number;
    neutral: number;
  };
}

// Locale-aware comparator: "BA001" < "BA002" < "BB001", products without LAN
// sort to the end.
function compareLan(a: string | null | undefined, b: string | null | undefined): number {
  const sa = (a || "").trim();
  const sb = (b || "").trim();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa.localeCompare(sb, "de", { numeric: true, sensitivity: "base" });
}

// Build the full folder path "Parent › Child › Sub" for a given folder.
function folderPathName(folderTree: LagerFolder[], folderId: string): string {
  const byId = new Map(folderTree.map((f) => [f.id, f]));
  const out: string[] = [];
  let cur: LagerFolder | undefined = byId.get(folderId);
  let safety = 32;
  while (cur && safety-- > 0) {
    out.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out.join(" › ") || "—";
}

// Walks `folderTree` and returns the IDs of folderId + ALL descendants.
function collectDescendantIds(folderTree: LagerFolder[], rootId: string): Set<string> {
  const childrenByParent = new Map<string | null, LagerFolder[]>();
  for (const f of folderTree) {
    const arr = childrenByParent.get(f.parent_id || null) || [];
    arr.push(f);
    childrenByParent.set(f.parent_id || null, arr);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    const kids = childrenByParent.get(cur) || [];
    for (const k of kids) {
      if (!out.has(k.id)) {
        out.add(k.id);
        stack.push(k.id);
      }
    }
  }
  return out;
}

export async function buildLagerReportData(input: LagerReportInput): Promise<LagerReportData> {
  // 1) Fetch everything (no filter → server returns all).
  const apiOpts = typeof input.lagerPv === "number" ? { lagerPv: input.lagerPv } : {};
  const [allFolders, allProducts] = await Promise.all([
    api<LagerFolder[]>("/lager/folders", apiOpts),
    api<LagerProduct[]>("/lager/products", apiOpts),
  ]);

  // 2) Decide which folders are in scope.
  let scopeFolderIds: Set<string> | null = null;
  let titleSuffix = "";
  if (input.scope === "folder" && input.folderId) {
    scopeFolderIds = collectDescendantIds(allFolders, input.folderId);
    const rootName = allFolders.find((f) => f.id === input.folderId)?.name
      || input.folderName
      || "Ordner";
    titleSuffix = " — " + rootName;
  }

  // 3) Group products by folder, applying scope filter.
  const productsByFolder = new Map<string, LagerProduct[]>();
  for (const p of allProducts) {
    if (scopeFolderIds && !scopeFolderIds.has(p.folder_id)) continue;
    const arr = productsByFolder.get(p.folder_id) || [];
    arr.push(p);
    productsByFolder.set(p.folder_id, arr);
  }
  // Sort products inside each folder by LAN asc → name asc.
  for (const arr of productsByFolder.values()) {
    arr.sort((a, b) => {
      const c = compareLan(a.lan, b.lan);
      if (c !== 0) return c;
      return (a.name || "").localeCompare(b.name || "", "de", { sensitivity: "base" });
    });
  }

  // 4) Build groups. Only include folders that actually have products
  //    in the current scope (keeps the report tight).
  const groups: LagerReportData["groups"] = [];
  for (const f of allFolders) {
    const list = productsByFolder.get(f.id);
    if (!list || list.length === 0) continue;
    if (scopeFolderIds && !scopeFolderIds.has(f.id)) continue;
    groups.push({ folder: f, products: list });
  }
  // Sort groups by folder full-path (so nested order reads naturally).
  groups.sort((a, b) =>
    folderPathName(allFolders, a.folder.id).localeCompare(
      folderPathName(allFolders, b.folder.id),
      "de",
      { sensitivity: "base" },
    ),
  );

  // 5) Totals.
  const totals = { productCount: 0, ok: 0, low: 0, critical: 0, neutral: 0 };
  for (const g of groups) {
    for (const p of g.products) {
      totals.productCount++;
      const s = computeStockStatus(p);
      totals[s]++;
    }
  }

  return {
    generatedAt: new Date(),
    scope: input.scope,
    title: (input.scope === "all" ? "LAGERBERICHT" : "ORDNERBERICHT") + titleSuffix,
    folderTree: allFolders,
    groups,
    totals,
  };
}

// =====================================================================
// CSV EXPORT
// =====================================================================
//
// Semicolon-separated (German Excel-friendly), UTF-8 with BOM so umlauts
// render correctly when double-clicked into Excel on Windows.
// Columns chosen to match the user's spec.
// =====================================================================
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Escape: wrap in quotes if contains separator, quote, or newline.
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportLagerCSV(data: LagerReportData): void {
  const header = [
    "Ordner",
    "LAN",
    "Produkt",
    "Menge",
    "Einheit",
    "Inhalt pro Stück",
    "Zweite Einheit",
    "Mindestmenge",
    "Status",
    "Warnsymbole",
    "Produktinformationen",
    "Bild-URL",
  ];
  const rows: string[][] = [];

  // Summary as a block at the very top (comment-like rows).
  rows.push([data.title]);
  rows.push([
    "Erstellt am",
    data.generatedAt.toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
  ]);
  rows.push(["Produkte gesamt", String(data.totals.productCount)]);
  rows.push(["Ausreichend",     String(data.totals.ok)]);
  rows.push(["Niedrig",         String(data.totals.low)]);
  rows.push(["Leer",            String(data.totals.critical)]);
  rows.push(["Ohne Mindestmenge", String(data.totals.neutral)]);
  rows.push([]); // blank line
  rows.push(header);

  for (const g of data.groups) {
    const folderPath = folderPathName(data.folderTree, g.folder.id);
    for (const p of g.products) {
      const status = computeStockStatus(p);
      const warns = (p.warn_symbols || [])
        .map((id) => getWarnSymbol(id)?.label || id)
        .join(", ");
      rows.push([
        folderPath,
        p.lan || "",
        p.name || "",
        String(p.menge ?? 0),
        p.einheit || "",
        p.inhalt_pro_stueck != null ? String(p.inhalt_pro_stueck) : "",
        p.zweite_einheit || "",
        p.minimum_quantity != null && p.minimum_quantity > 0
          ? String(p.minimum_quantity)
          : "",
        STATUS_LABEL[status],
        warns,
        (p.info_text || "").replace(/\r?\n+/g, " ⏎ "),
        p.image_url || p.image_thumbnail || "",
      ]);
    }
  }

  const sep = ";";
  const text = rows.map((r) => r.map(csvCell).join(sep)).join("\r\n");
  // Add UTF-8 BOM so Excel detects encoding.
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, buildFilename(data, "csv"));
}

// =====================================================================
// PDF EXPORT
// =====================================================================
//
// Layout (A4 portrait):
//   1) Title bar
//   2) Summary block: 4 counters (gesamt / ok / niedrig / leer)
//   3) For each folder: section title + one autoTable.
//      Columns: [Bild] [LAN] [Produkt] [Menge] [Einheit] [Min.] [Status]
//      Notiz (Info + Warnsymbole) wraps as a sub-row beneath the product
//      name to keep the table from getting too wide.
//   4) Page footer: page number + generation timestamp.
// =====================================================================

// Fetch a remote image (e.g. Cloudinary thumbnail) and turn it into a
// data: URL we can hand to jsPDF.addImage(). Failures are caught and
// returned as null so the report keeps rendering.
async function urlToDataUrl(
  url: string,
  timeoutMs = 4000,
): Promise<{ data: string; format: "PNG" | "JPEG" } | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { mode: "cors", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const blob = await res.blob();
    const reader = new FileReader();
    const dataUrl: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith("data:image/")) return null;
    const fmt: "PNG" | "JPEG" = /image\/png/i.test(dataUrl) ? "PNG" : "JPEG";
    return { data: dataUrl, format: fmt };
  } catch {
    return null;
  }
}

// Pre-load all product thumbnails in parallel. Returns a map productId → dataUrl.
// Cap parallelism so we don't slam Cloudinary if the report is huge.
async function preloadProductImages(
  data: LagerReportData,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Map<string, { data: string; format: "PNG" | "JPEG" }>> {
  const all: Array<{ id: string; url: string }> = [];
  for (const g of data.groups) {
    for (const p of g.products) {
      const url = p.image_thumbnail || p.image_url || "";
      if (url) all.push({ id: p.id, url });
    }
  }
  const out = new Map<string, { data: string; format: "PNG" | "JPEG" }>();
  let done = 0;
  const limit = 6;
  let idx = 0;
  async function worker() {
    while (idx < all.length) {
      const myIdx = idx++;
      const { id, url } = all[myIdx];
      const res = await urlToDataUrl(url);
      if (res) out.set(id, res);
      done++;
      try { onProgress?.(done, all.length); } catch {}
    }
  }
  const workers = Array.from({ length: Math.min(limit, all.length) }, worker);
  await Promise.all(workers);
  return out;
}

export interface PdfExportOptions {
  includeImages?: boolean;        // default true
  onProgress?: (loaded: number, total: number) => void;
}

export async function exportLagerPDF(
  data: LagerReportData,
  opts: PdfExportOptions = {},
): Promise<void> {
  const includeImages = opts.includeImages !== false;
  const imageMap = includeImages
    ? await preloadProductImages(data, opts.onProgress)
    : new Map<string, { data: string; format: "PNG" | "JPEG" }>();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;

  // --- Title ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 0, 0);
  doc.text(data.title, margin, margin + 4);

  // --- Generated at (right) ---
  const ts = data.generatedAt.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("Erstellt: " + ts, pageW - margin, margin + 4, { align: "right" });

  // --- Summary card ---
  const summaryY = margin + 10;
  const cards: Array<{ label: string; value: number; rgb: [number, number, number] }> = [
    { label: "Gesamt",      value: data.totals.productCount, rgb: [80, 80, 80] },
    { label: "Ausreichend", value: data.totals.ok,           rgb: [30, 130, 30] },
    { label: "Niedrig",     value: data.totals.low,          rgb: [180, 90, 0] },
    { label: "Leer",        value: data.totals.critical,     rgb: [180, 20, 20] },
  ];
  const cardW = (pageW - 2 * margin - 3 * 3) / 4;
  const cardH = 18;
  cards.forEach((c, i) => {
    const x = margin + i * (cardW + 3);
    doc.setFillColor(c.rgb[0], c.rgb[1], c.rgb[2]);
    doc.setDrawColor(c.rgb[0], c.rgb[1], c.rgb[2]);
    doc.roundedRect(x, summaryY, cardW, cardH, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(String(c.value), x + 3, summaryY + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(c.label, x + 3, summaryY + 15);
  });
  if (data.totals.neutral > 0) {
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text(
      `(${data.totals.neutral} Produkte ohne Mindestmenge — nicht bewertet)`,
      margin, summaryY + cardH + 5,
    );
  }

  let cursorY = summaryY + cardH + (data.totals.neutral > 0 ? 9 : 6);

  // Helper: enforce/insert a page break with a safety margin.
  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageH - 14) {
      doc.addPage();
      cursorY = margin;
    }
  };

  // Custom cell renderer: paints the LAN/Status column backgrounds tinted
  // by status. We tag rows via raw data carrying their status string.
  const drawRowBackground = (hookData: CellHookData) => {
    const raw = hookData.row?.raw as any;
    if (!raw || !raw.__status) return;
    const st = raw.__status as StockStatus;
    const bg = STATUS_BG_RGB[st];
    hookData.cell.styles.fillColor = bg;
    // Status column → use stronger color
    if (hookData.column.dataKey === "status") {
      const fg = STATUS_FG_RGB[st];
      hookData.cell.styles.textColor = fg;
      hookData.cell.styles.fontStyle = "bold";
    }
  };

  // ---------- Per-folder section ----------
  for (const g of data.groups) {
    ensureSpace(14);
    const folderPath = folderPathName(data.folderTree, g.folder.id);
    // Section header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(folderPath + `  ·  ${g.products.length} Produkte`, margin, cursorY + 4);
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.3);
    doc.line(margin, cursorY + 6, pageW - margin, cursorY + 6);
    cursorY += 8;

    // Table
    const head = [[
      { content: "Bild",    styles: { halign: "center" as const } },
      { content: "LAN",     styles: { halign: "left"   as const } },
      { content: "Produkt", styles: { halign: "left"   as const } },
      { content: "Menge",   styles: { halign: "right"  as const } },
      { content: "Einheit", styles: { halign: "left"   as const } },
      { content: "Min.",    styles: { halign: "right"  as const } },
      { content: "Status",  styles: { halign: "center" as const } },
    ]];
    const body: any[] = [];
    for (const p of g.products) {
      const st = computeStockStatus(p);
      const warns = (p.warn_symbols || [])
        .map((id) => getWarnSymbol(id)?.label || id)
        .filter(Boolean)
        .join(" · ");
      // Product cell composes: name + (optional) info + warn symbols labels.
      const productCellLines: string[] = [p.name || "—"];
      if (p.info_text && p.info_text.trim()) {
        productCellLines.push("ℹ " + p.info_text.trim().replace(/\r?\n+/g, " "));
      }
      if (warns) {
        productCellLines.push("⚠ " + warns);
      }
      const productCell = productCellLines.join("\n");

      const zweite = (p.inhalt_pro_stueck && p.zweite_einheit)
        ? ` (= ${p.inhalt_pro_stueck} ${p.zweite_einheit})`
        : "";

      body.push({
        __status: st,
        __productId: p.id,
        bild: "",                                      // drawn via didDrawCell
        lan: p.lan || "—",
        produkt: productCell,
        menge: String(p.menge ?? 0),
        einheit: (p.einheit || "") + zweite,
        min: (p.minimum_quantity && p.minimum_quantity > 0)
          ? String(p.minimum_quantity) : "—",
        status: STATUS_LABEL[st],
      });
    }

    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      columns: [
        { dataKey: "bild" },
        { dataKey: "lan" },
        { dataKey: "produkt" },
        { dataKey: "menge" },
        { dataKey: "einheit" },
        { dataKey: "min" },
        { dataKey: "status" },
      ],
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 9,
        cellPadding: 1.5,
        valign: "middle",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [35, 35, 35],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      columnStyles: {
        bild:    { cellWidth: 16,  halign: "center", minCellHeight: 16 },
        lan:     { cellWidth: 18,  halign: "left",   fontStyle: "bold" },
        produkt: { cellWidth: "auto", halign: "left" },
        menge:   { cellWidth: 14,  halign: "right" },
        einheit: { cellWidth: 26,  halign: "left" },
        min:     { cellWidth: 12,  halign: "right" },
        status:  { cellWidth: 22,  halign: "center" },
      },
      didParseCell: drawRowBackground,
      didDrawCell: (hookData) => {
        // Insert thumbnail image into the "bild" column body cells.
        if (
          hookData.section === "body"
          && hookData.column.dataKey === "bild"
        ) {
          const raw = hookData.row.raw as any;
          const img = raw?.__productId ? imageMap.get(raw.__productId) : null;
          if (img) {
            const cell = hookData.cell;
            const size = Math.min(cell.height, cell.width) - 2;
            const x = cell.x + (cell.width - size) / 2;
            const y = cell.y + (cell.height - size) / 2;
            try {
              doc.addImage(img.data, img.format, x, y, size, size, undefined, "FAST");
            } catch {
              /* ignore broken images */
            }
          }
        }
      },
      didDrawPage: () => {
        // Footer: page X / total Y  + small timestamp.
        const str = `${data.title}  ·  ${ts}`;
        const pn  = `Seite ${doc.getNumberOfPages()}`;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(str, margin, pageH - 6);
        doc.text(pn, pageW - margin, pageH - 6, { align: "right" });
      },
    });

    // jspdf-autotable stores its last drawn Y in (doc as any).lastAutoTable.finalY
    const finalY = (doc as any).lastAutoTable?.finalY || cursorY;
    cursorY = finalY + 6;
  }

  if (data.groups.length === 0) {
    doc.setTextColor(120, 120, 120);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.text("Keine Produkte gefunden.", margin, cursorY + 8);
  }

  // ---------- Save ----------
  doc.save(buildFilename(data, "pdf"));
}

// ---------- Filename helper ----------
function buildFilename(data: LagerReportData, ext: "pdf" | "csv"): string {
  const stamp = data.generatedAt.toISOString().slice(0, 10);
  const safeTitle = data.title
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_\-—]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safeTitle}_${stamp}.${ext}`;
}

// ---------- Download helper ----------
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
