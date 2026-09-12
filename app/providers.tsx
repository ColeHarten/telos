"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

const GLOBAL_FONT_FAMILY = "var(--font-manrope), sans-serif";

const theme = createTheme({
  palette: {
    mode: "light",
  },
  typography: {
    fontFamily: GLOBAL_FONT_FAMILY,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": {
          fontFamily: `${GLOBAL_FONT_FAMILY}`,
        },
      },
    },
  },
});

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}