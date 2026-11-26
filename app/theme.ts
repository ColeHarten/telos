import { createTheme, type Shadows } from "@mui/material/styles";

/**
 * Telos's one theme. Colors, corners, shadows, and each component's default
 * look live here, so pages only style layout. The palette is Tailwind's slate
 * grays with blue-600 as the accent, the same values the pages used inline.
 */

/** Tailwind's slate grays, also the theme's `grey` palette. */
export const slate = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0f172a",
} as const;

/** Accent and status colors, for the few places theme tokens can't reach (charts, SVG). */
export const colors = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  primaryTint: "#eff6ff",
  success: "#16a34a",
  error: "#dc2626",
  warning: "#d97706",
  info: "#0284c7",
} as const;

/** Height of the tab bar along the bottom on phones and tablets (below md). */
export const BOTTOM_NAV_HEIGHT = 64;

const FONT = "var(--font-manrope), sans-serif";
const PHONE = "@media (max-width:599.95px)";
const BELOW_MD = "@media (max-width:899.95px)";
const POPUP_SHADOW = "0 12px 30px rgba(15, 23, 42, 0.12)";

// Soft, slate-tinted shadows in place of Material's heavier defaults.
function shadow(level: number): string {
  if (level === 0) return "none";
  const y = Math.max(1, Math.round(level / 2));
  const blur = level * 2 + 2;
  const alpha = Math.min(0.04 + level * 0.005, 0.14).toFixed(3);
  return `0 1px 2px rgba(15, 23, 42, 0.04), 0 ${y}px ${blur}px rgba(15, 23, 42, ${alpha})`;
}

const shadows = Array.from({ length: 25 }, (_, level) => shadow(level)) as Shadows;

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: colors.primary, dark: colors.primaryDark, contrastText: "#fff" },
    success: { main: colors.success },
    error: { main: colors.error },
    warning: { main: colors.warning },
    info: { main: colors.info },
    text: { primary: slate[900], secondary: slate[500], disabled: slate[400] },
    divider: slate[200],
    background: { default: slate[50], paper: "#fff" },
    grey: slate,
  },
  shadows,
  typography: {
    fontFamily: FONT,
    h4: { fontWeight: 700, letterSpacing: "-0.03em" },
    h5: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700, letterSpacing: "-0.01em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": { fontFamily: FONT },
        // Digits all the same width, so amounts line up in columns.
        body: { fontVariantNumeric: "tabular-nums" },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
        outlined: { boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 12 },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
    },
    MuiPopover: {
      styleOverrides: {
        paper: { border: `1px solid ${slate[200]}`, boxShadow: POPUP_SHADOW },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { border: `1px solid ${slate[200]}`, boxShadow: POPUP_SHADOW },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: "0.875rem", minHeight: 36 },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { border: `1px solid ${slate[200]}`, boxShadow: POPUP_SHADOW },
      },
    },
    MuiDialog: {
      styleOverrides: {
        // On phones, dialogs rise from the bottom as sheets.
        container: { [PHONE]: { alignItems: "flex-end" } },
        paper: {
          borderRadius: 16,
          [PHONE]: {
            margin: 0,
            width: "100%",
            maxWidth: "100%",
            maxHeight: "calc(100% - 32px)",
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            paddingBottom: "env(safe-area-inset-bottom)",
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: "1.125rem", letterSpacing: "-0.01em" },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: "8px 24px 20px" },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: "#fff",
          "&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline": {
            borderColor: slate[300],
          },
        },
        notchedOutline: { borderColor: slate[200] },
      },
    },
    // Tabs are segmented controls: a white pill track with a tinted selection.
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
          backgroundColor: "#fff",
          borderRadius: 8,
          border: `1px solid ${slate[200]}`,
          padding: 4,
          width: "fit-content",
          maxWidth: "100%",
        },
        indicator: { display: "none" },
      },
    },
    MuiTab: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          minHeight: 32,
          minWidth: 0,
          padding: "0 14px",
          borderRadius: 6,
          fontWeight: 600,
          fontSize: "0.8rem",
          color: slate[500],
          "&.Mui-selected": { color: colors.primary, backgroundColor: colors.primaryTint },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: slate[900], fontSize: "0.75rem", fontWeight: 500, borderRadius: 6, padding: "6px 10px" },
        arrow: { color: slate[900] },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: "bottom", horizontal: "center" } },
      styleOverrides: {
        // Above the tab bar on phones and tablets.
        root: { [BELOW_MD]: { bottom: `calc(${BOTTOM_NAV_HEIGHT + 12}px + env(safe-area-inset-bottom))` } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: slate[100] },
        head: { color: slate[500], fontWeight: 600, fontSize: "0.75rem" },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 999, backgroundColor: slate[100] },
        bar: { borderRadius: 999 },
      },
    },
    MuiSkeleton: {
      defaultProps: { animation: "wave" },
    },
  },
});

export default theme;
