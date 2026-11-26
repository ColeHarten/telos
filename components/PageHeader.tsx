"use client";

import { Box, type SxProps, type Theme, Typography } from "@mui/material";

type PageHeaderProps = {
  title: string;
  /** A line under the title. */
  description?: React.ReactNode;
  /** Buttons and controls, on the right from sm up. */
  children?: React.ReactNode;
  sx?: SxProps<Theme>;
};

/** Every page's title row: the title, an optional line under it, and its controls. */
export default function PageHeader({ title, description, children, sx = [] }: PageHeaderProps) {
  return (
    <Box
      sx={[
        {
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: 2,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontSize: { xs: "1.5rem", md: "1.75rem" }, lineHeight: 1.2 }}
        >
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}
