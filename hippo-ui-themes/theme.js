export const themes = {
  modernLight: {
    id: "modernLight",
    name: "Modern Light",
    mode: "light",
    colors: {
      primary: "#6366F1", primaryHover: "#4F46E5", primarySoft: "#EEF2FF",
      background: "#F8FAFC", surface: "#FFFFFF", surfaceMuted: "#F1F5F9",
      sidebar: "#FFFFFF", sidebarText: "#334155", text: "#0F172A",
      textMuted: "#64748B", border: "#E2E8F0", success: "#16A34A",
      warning: "#F59E0B", danger: "#DC2626", info: "#0284C7"
    },
    radius: "12px"
  },
  corporateBlue: {
    id: "corporateBlue",
    name: "Corporate Blue",
    mode: "light",
    colors: {
      primary: "#1D4ED8", primaryHover: "#1E40AF", primarySoft: "#DBEAFE",
      background: "#F4F7FB", surface: "#FFFFFF", surfaceMuted: "#EAF0F8",
      sidebar: "#082F49", sidebarText: "#E0F2FE", text: "#0F172A",
      textMuted: "#64748B", border: "#D7E0EC", success: "#15803D",
      warning: "#D97706", danger: "#B91C1C", info: "#0369A1"
    },
    radius: "10px"
  },
  darkModern: {
    id: "darkModern",
    name: "Dark Modern",
    mode: "dark",
    colors: {
      primary: "#8B5CF6", primaryHover: "#7C3AED", primarySoft: "#2E1065",
      background: "#0B1120", surface: "#111827", surfaceMuted: "#1F2937",
      sidebar: "#030712", sidebarText: "#E5E7EB", text: "#F8FAFC",
      textMuted: "#94A3B8", border: "#273449", success: "#22C55E",
      warning: "#F59E0B", danger: "#F87171", info: "#38BDF8"
    },
    radius: "12px"
  },
  sunsetWarm: {
    id: "sunsetWarm",
    name: "Sunset Warm",
    mode: "light",
    colors: {
      primary: "#F97316", primaryHover: "#EA580C", primarySoft: "#FFEDD5",
      background: "#FFF7ED", surface: "#FFFFFF", surfaceMuted: "#FFEDD5",
      sidebar: "#FFFDF8", sidebarText: "#7C2D12", text: "#431407",
      textMuted: "#9A5B43", border: "#FED7AA", success: "#16A34A",
      warning: "#D97706", danger: "#BE123C", info: "#0284C7"
    },
    radius: "14px"
  },
  natureGreen: {
    id: "natureGreen",
    name: "Nature Green",
    mode: "light",
    colors: {
      primary: "#16A34A", primaryHover: "#15803D", primarySoft: "#DCFCE7",
      background: "#F0FDF4", surface: "#FFFFFF", surfaceMuted: "#ECFDF5",
      sidebar: "#064E3B", sidebarText: "#D1FAE5", text: "#052E16",
      textMuted: "#4B6355", border: "#BBF7D0", success: "#16A34A",
      warning: "#D97706", danger: "#DC2626", info: "#0F766E"
    },
    radius: "12px"
  },
  royalPurple: {
    id: "royalPurple",
    name: "Royal Purple",
    mode: "light",
    colors: {
      primary: "#7C3AED", primaryHover: "#6D28D9", primarySoft: "#F3E8FF",
      background: "#FAF5FF", surface: "#FFFFFF", surfaceMuted: "#F5F3FF",
      sidebar: "#312E81", sidebarText: "#EDE9FE", text: "#2E1065",
      textMuted: "#6B5B7A", border: "#DDD6FE", success: "#16A34A",
      warning: "#D97706", danger: "#DC2626", info: "#4F46E5"
    },
    radius: "14px"
  }
};

export const defaultThemeId = "corporateBlue";

export function getTheme(themeId) {
  return themes[themeId] ?? themes[defaultThemeId];
}

export function applyTheme(themeId) {
  if (typeof document === "undefined") return;
  const theme = getTheme(themeId);
  const root = document.documentElement;
  const c = theme.colors;

  const vars = {
    "--ui-primary": c.primary,
    "--ui-primary-hover": c.primaryHover,
    "--ui-primary-soft": c.primarySoft,
    "--ui-background": c.background,
    "--ui-surface": c.surface,
    "--ui-surface-muted": c.surfaceMuted,
    "--ui-sidebar": c.sidebar,
    "--ui-sidebar-text": c.sidebarText,
    "--ui-text": c.text,
    "--ui-text-muted": c.textMuted,
    "--ui-border": c.border,
    "--ui-success": c.success,
    "--ui-warning": c.warning,
    "--ui-danger": c.danger,
    "--ui-info": c.info,
    "--ui-radius": theme.radius
  };

  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.dataset.theme = theme.id;
  root.dataset.mode = theme.mode;
  root.style.colorScheme = theme.mode;
}
