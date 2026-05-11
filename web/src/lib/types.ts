export type TaskStatus = "pending" | "accepted" | "finished" | "cannot_accept" | "not_finished" | "not_done";

export interface SimpleItem { id: string; name: string; }

export interface TaskPhoto {
  id: string;
  url: string;
  fullSizeUrl: string;
  thumbnailUrl: string;
  public_id: string;
  uploadedAt: string;
  uploadedBy: string;
  caption: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export interface Task {
  id: string;
  task_type: string;
  haus: string;
  station: string;
  description: string;
  person_ids: string[];
  time_from: string;
  time_to: string;
  status: TaskStatus | "weitergeschoben";
  accept_reason?: string | null;
  not_finished_reason?: string | null;
  not_done_reason?: string | null;
  accepted_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  archived: boolean;
  archive_date?: string | null;
  task_date: string;
  // Immutable creation/planned day. Set ONCE on POST /tasks. Used to compute
  // the historical visit list — never changes after creation.
  original_date?: string | null;
  // Set when workflow → 'finished'. After this, auto-rollover skips the task.
  completed_date?: string | null;
  continue_tomorrow?: boolean;
  next_work_date?: string | null;
  // Audit trail of every rollover the server applied to this task.
  rollover_log?: Array<{ from: string; to: string; reason?: string; ts?: string; status?: string }>;
  photos?: TaskPhoto[];
  // ====== Virtual stub fields (server-decorated only) ======
  // When a task once lived on date X but has been rolled forward, querying
  // X returns the task with these flags set so the UI can render a
  // historical placeholder ("Weitergeschoben auf …") instead of full controls.
  _stub?: boolean;
  _is_weitergeschoben?: boolean;
  _weitergeschoben_auf?: string | null;
  _current_live_date?: string | null;
}

export interface AppSettings {
  logo_base64?: string | null;
  background_type: "preset" | "color" | "image";
  background_value: string;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Neu",
  accepted: "Angenommen",
  finished: "Erledigt",
  cannot_accept: "Nicht annehmbar",
  not_finished: "Nicht beendbar",
  not_done: "Nicht erledigt",
};

export const STATUS_DOT: Record<string, string> = {
  pending: "#3B82F6",
  accepted: "#FF9500",
  finished: "#00E676",
  cannot_accept: "#991B1B",
  not_finished: "#991B1B",
  not_done: "#FF3B30",
};

export const PRESET_BG: Record<string, string> = {
  dark: "#0F0F0F",
  light: "#F7F7F8",
  navy: "#0B1F3A",
  forest: "#0E2A1F",
  charcoal: "#1C1C1E",
  steel: "#3A4A5C",
  sand: "#E8DDC8",
  sky: "#CCE4F7",
};

export function isDarkBg(hex: string): boolean {
  if (!hex || !hex.startsWith("#")) return true;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export const APP_VERSION = "1.0.0";
