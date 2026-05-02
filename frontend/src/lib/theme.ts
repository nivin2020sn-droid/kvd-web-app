export const colors = {
  bgDark: "#0F0F0F",
  bgLight: "#F7F7F8",
  surfaceDark: "#1A1A1A",
  surfaceLight: "#FFFFFF",
  borderDark: "#2A2A2A",
  borderLight: "#E5E7EB",
  textDark: "#FFFFFF",
  textLight: "#0A0A0A",
  textMutedDark: "#A1A1AA",
  textMutedLight: "#52525B",
  yellow: "#FFD600",
  green: "#00E676",
  red: "#FF3B30",
  blue: "#0055FF",
  orange: "#FF9500",
};

export const presetBackgrounds: Record<string, string> = {
  dark: "#0F0F0F",
  light: "#F7F7F8",
  navy: "#0B1F3A",
  forest: "#0E2A1F",
  charcoal: "#1C1C1E",
  steel: "#3A4A5C",
  sand: "#E8DDC8",
  sky: "#CCE4F7",
};

export function getBgColor(type: string, value: string): string {
  if (type === "preset") return presetBackgrounds[value] || colors.bgDark;
  if (type === "color") return value || colors.bgDark;
  return colors.bgDark;
}

export function isDarkBg(hex: string): boolean {
  if (!hex || !hex.startsWith("#")) return true;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}
