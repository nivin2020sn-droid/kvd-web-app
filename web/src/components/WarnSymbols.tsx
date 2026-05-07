// =====================================================================
// WARN SYMBOLS — ISO 7010 / GHS / PPE Mandatory pictograms drawn as
// inline SVGs (no external assets, no emojis).
//
// Three families:
//   • PPE Mandatory  → BLUE circle (#005ea5) with white pictogram
//   • GHS Hazard     → RED diamond border (#ed1c24) with black pictogram on white
//   • Warning        → YELLOW triangle (#ffd100) with black pictogram + black border
//
// Each entry has:
//   id     — stable string saved on the product (e.g. "ppe.gloves")
//   group  — "ppe" | "ghs" | "warn"
//   label  — short German caption shown on the chip
//   description — long German explanation shown in the detail dialog
//   render — function returning the inner <g> for the pictogram
// =====================================================================
import * as React from "react";

type SymGroup = "ppe" | "ghs" | "warn";
export interface WarnSymbolDef {
  id: string;
  group: SymGroup;
  label: string;          // short German title
  description: string;    // long German explanation
  render: () => React.ReactNode; // inner pictogram (over a 100×100 viewBox, centred)
}

// ---------- Frame builders ----------
function PPEFrame({ children, size = 64 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      <circle cx="50" cy="50" r="48" fill="#005ea5" />
      <g fill="#fff" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">{children}</g>
    </svg>
  );
}
function GHSFrame({ children, size = 64 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      {/* Diamond (square rotated 45°) with thick red border on white. */}
      <rect x="10" y="10" width="80" height="80" rx="6" transform="rotate(45 50 50)" fill="#fff" stroke="#ed1c24" strokeWidth="6" />
      <g fill="#000" stroke="#000" strokeLinecap="round" strokeLinejoin="round">{children}</g>
    </svg>
  );
}
function WarnFrame({ children, size = 64 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      {/* Equilateral triangle, yellow fill, thick black border, rounded corners. */}
      <path d="M50 6 L94 86 L6 86 Z" fill="#ffd100" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
      <g fill="#000" stroke="#000" strokeLinecap="round" strokeLinejoin="round">{children}</g>
    </svg>
  );
}

// ---------- Pictograms ----------
// Each function returns ONLY the inner pictogram (in a 100×100 viewBox).
// The frame component decides the colour scheme.

const Gloves = () => (
  <g transform="translate(50 50)" fill="#fff" stroke="none">
    {/* Stylised glove silhouette */}
    <path d="M-15 -22 q-4 -2 -4 4 v18 q-3 -3 -7 -3 q-5 0 -5 6 v8 q0 6 4 10 l8 12 q3 4 8 4 h22 q5 0 7 -4 l4 -10 q1 -3 1 -6 v-26 q0 -5 -4 -5 q-3 0 -4 4 v-7 q0 -5 -5 -5 q-4 0 -4 5 v6 q-1 -5 -5 -5 q-4 0 -4 5 v6 q0 -5 -5 -5 q-4 0 -4 5 z" />
  </g>
);

const Respirator = () => (
  <g transform="translate(50 50)" fill="#fff" stroke="none">
    {/* Half-mask respirator */}
    <ellipse cx="-22" cy="-12" rx="6" ry="3" />
    <ellipse cx="22" cy="-12" rx="6" ry="3" />
    <path d="M-22 -10 q-6 8 -6 14 q0 12 12 18 q8 4 16 4 q8 0 16 -4 q12 -6 12 -18 q0 -6 -6 -14" stroke="#fff" strokeWidth="3" fill="#fff" />
    <ellipse cx="0" cy="14" rx="14" ry="9" fill="#005ea5" stroke="#fff" strokeWidth="2.5" />
    <circle cx="0" cy="14" r="5" fill="#fff" />
  </g>
);

const Goggles = () => (
  <g transform="translate(50 50)" fill="#fff" stroke="none">
    {/* Safety goggles */}
    <rect x="-30" y="-12" width="60" height="22" rx="11" fill="#fff" />
    <rect x="-26" y="-8" width="22" height="14" rx="7" fill="#005ea5" />
    <rect x="4"   y="-8" width="22" height="14" rx="7" fill="#005ea5" />
    <path d="M-30 -1 h-6 q-3 0 -3 3 q0 3 3 3 h6 z" />
    <path d="M30 -1 h6 q3 0 3 3 q0 3 -3 3 h-6 z" />
  </g>
);

const Coverall = () => (
  <g transform="translate(50 50)" fill="#fff" stroke="none">
    {/* Protective coverall pictogram */}
    <circle cx="0" cy="-22" r="9" />
    <path d="M-18 -8 q-2 0 -2 4 v16 q0 4 4 4 h2 v18 q0 3 3 3 h22 q3 0 3 -3 v-18 h2 q4 0 4 -4 v-16 q0 -4 -2 -4 l-12 -4 q-3 -1 -5 1 q-2 2 -5 2 q-3 0 -5 -2 q-2 -2 -5 -1 z" />
  </g>
);

const Ventilation = () => (
  <g transform="translate(50 50)" fill="#fff" stroke="#fff" strokeWidth="3" strokeLinecap="round">
    {/* Fan blades + arrows */}
    <circle cx="0" cy="0" r="6" fill="#fff" />
    <path d="M-3 -8 q-14 -10 -22 -2 q4 12 22 6 z" fill="#fff" stroke="none" />
    <path d="M3 -8 q14 -10 22 -2 q-4 12 -22 6 z" fill="#fff" stroke="none" transform="rotate(120 0 0)" />
    <path d="M3 -8 q14 -10 22 -2 q-4 12 -22 6 z" fill="#fff" stroke="none" transform="rotate(240 0 0)" />
    {/* Air-flow arrows around */}
    <path d="M-32 30 q10 -6 22 -2" fill="none" />
    <path d="M-12 30 l4 -2 l-1 4 z" fill="#fff" stroke="none" />
  </g>
);

// ---------- GHS Hazard pictograms ----------
const Flame = () => (
  <g transform="translate(50 52)">
    <path d="M0 -28 q-3 8 -10 14 q-12 10 -12 22 q0 16 22 18 q22 -2 22 -18 q0 -10 -8 -18 q-6 6 -8 12 q2 -10 -6 -30 z" />
    <path d="M-2 6 q-6 4 -6 10 q0 6 8 8 q8 -2 8 -8 q0 -6 -6 -10 q-2 4 -4 0 z" fill="#fff" />
  </g>
);
const Skull = () => (
  <g transform="translate(50 50)">
    <path d="M0 -22 q-22 0 -22 22 q0 8 6 14 v6 q0 4 4 4 h2 v4 q0 2 2 2 q2 0 2 -2 v-4 h12 v4 q0 2 2 2 q2 0 2 -2 v-4 h2 q4 0 4 -4 v-6 q6 -6 6 -14 q0 -22 -22 -22 z" />
    <circle cx="-7" cy="-2" r="4" fill="#fff" />
    <circle cx="7" cy="-2" r="4" fill="#fff" />
    <path d="M-3 12 l3 -4 l3 4 z" fill="#fff" />
    {/* Crossbones */}
    <rect x="-26" y="20" width="52" height="3" fill="#000" transform="rotate(20 0 22)" />
    <rect x="-26" y="20" width="52" height="3" fill="#000" transform="rotate(-20 0 22)" />
  </g>
);
const Corrosion = () => (
  <g transform="translate(50 50)" fill="#000">
    {/* Dripping liquid onto a hand and a flat bar */}
    <path d="M-30 -20 l-2 4 q-1 4 4 4 h6 l4 4 q-12 4 -16 12 l-4 8 h22 q4 0 4 -4 v-8 q0 -4 -2 -8 z" />
    <path d="M16 -20 l-4 8 q-2 4 0 6 l6 6 l-4 6 q-1 3 4 3 h12 q4 0 4 -4 v-12 q0 -4 -4 -6 z" />
    <rect x="-32" y="22" width="64" height="6" />
    {/* Drops */}
    <path d="M-12 -28 q-3 6 0 8 q3 -2 0 -8 z" />
    <path d="M14 -28 q-3 6 0 8 q3 -2 0 -8 z" />
  </g>
);
const Exclamation = () => (
  <g transform="translate(50 50)">
    <rect x="-5" y="-26" width="10" height="30" rx="3" />
    <circle cx="0" cy="14" r="6" />
  </g>
);
const Environment = () => (
  <g transform="translate(50 50)">
    {/* Dead tree + dead fish over water */}
    <path d="M-26 12 h52 v3 h-52 z" />
    <path d="M-2 14 v-22 q0 -8 4 -10 q2 -1 4 1 q-3 6 0 8 q-5 4 -2 12 q-4 6 -2 12 z" />
    <path d="M6 18 q12 4 22 2 l-4 -4 l4 -4 q-12 -2 -22 2 q-4 2 0 4 z" />
    <circle cx="22" cy="16" r="1.5" fill="#fff" />
  </g>
);
const GasCylinder = () => (
  <g transform="translate(50 50)">
    {/* Gas bottle pictogram */}
    <rect x="-12" y="-26" width="24" height="42" rx="6" />
    <rect x="-6" y="-30" width="12" height="6" rx="2" />
    <rect x="-12" y="2" width="24" height="4" fill="#fff" />
    <rect x="-12" y="10" width="24" height="4" fill="#fff" />
    <rect x="-16" y="20" width="32" height="6" rx="2" />
  </g>
);
const Explosion = () => (
  <g transform="translate(50 50)">
    {/* Explosive star */}
    <path d="M0 -28 l6 14 l16 -8 l-8 16 l16 8 l-18 4 l4 14 l-12 -10 l-10 12 l-4 -16 l-16 0 l12 -10 l-12 -8 l16 -2 z" />
  </g>
);

// ---------- ISO 7010 Warning pictograms ----------
const Electric = () => (
  <g transform="translate(50 50)">
    {/* Zigzag lightning bolt */}
    <path d="M6 -28 l-22 30 h12 l-6 28 l24 -34 h-12 z" />
  </g>
);
const Fire = () => (
  <g transform="translate(50 52)">
    <path d="M0 -28 q-4 10 -12 16 q-12 8 -12 22 q0 14 22 16 q22 -2 22 -16 q0 -10 -8 -18 q-6 4 -8 10 q4 -12 -4 -30 z" />
  </g>
);

// ---------- Public catalog ----------
export const WARN_SYMBOLS: WarnSymbolDef[] = [
  // PPE Mandatory (blue circles)
  { id: "ppe.gloves",        group: "ppe", label: "Handschuhe",       description: "Schutzhandschuhe benutzen",                      render: Gloves },
  { id: "ppe.respirator",    group: "ppe", label: "Atemschutz",       description: "Atemschutz benutzen",                            render: Respirator },
  { id: "ppe.eye",           group: "ppe", label: "Augenschutz",      description: "Augenschutz benutzen",                           render: Goggles },
  { id: "ppe.coverall",      group: "ppe", label: "Schutzkleidung",   description: "Schutzkleidung benutzen",                        render: Coverall },
  { id: "ppe.ventilation",   group: "ppe", label: "Belüftung",        description: "Nur in gut belüfteten Bereichen verwenden",      render: Ventilation },
  // GHS Hazard (red diamonds)
  { id: "ghs.flame",         group: "ghs", label: "Entzündlich",      description: "GHS02 — Entzündbare Stoffe",                     render: Flame },
  { id: "ghs.skull",         group: "ghs", label: "Giftig",           description: "GHS06 — Akute Toxizität (Lebensgefahr)",         render: Skull },
  { id: "ghs.corrosion",     group: "ghs", label: "Ätzend",           description: "GHS05 — Ätzend / Korrosiv (Haut/Augen/Metall)",  render: Corrosion },
  { id: "ghs.exclamation",   group: "ghs", label: "Reizend",          description: "GHS07 — Reizend, gesundheitsschädlich",          render: Exclamation },
  { id: "ghs.environment",   group: "ghs", label: "Umweltgefährdung", description: "GHS09 — Gewässergefährdend",                     render: Environment },
  { id: "ghs.gas",           group: "ghs", label: "Druckgas",         description: "GHS04 — Gase unter Druck",                       render: GasCylinder },
  { id: "ghs.explosion",     group: "ghs", label: "Explosiv",         description: "GHS01 — Explosionsgefährlich",                   render: Explosion },
  // Warning (yellow triangles)
  { id: "warn.electric",     group: "warn", label: "Strom",           description: "W012 — Warnung vor elektrischer Spannung",       render: Electric },
  { id: "warn.fire",         group: "warn", label: "Feuer",           description: "W021 — Warnung vor feuergefährlichen Stoffen",   render: Fire },
];

const SYMBOL_BY_ID: Record<string, WarnSymbolDef> = Object.fromEntries(WARN_SYMBOLS.map((s) => [s.id, s]));
export const getWarnSymbol = (id: string): WarnSymbolDef | undefined => SYMBOL_BY_ID[id];

// =====================================================================
// Render component — hides the framing logic from callers.
// =====================================================================
export function WarnIcon({ id, size = 36, title }: { id: string; size?: number; title?: string }) {
  const def = SYMBOL_BY_ID[id];
  if (!def) return null;
  const Frame = def.group === "ppe" ? PPEFrame : def.group === "ghs" ? GHSFrame : WarnFrame;
  return (
    <span title={title || def.label} style={{ display: "inline-block", lineHeight: 0 }}>
      <Frame size={size}>{def.render()}</Frame>
    </span>
  );
}
