"use client";

import { Box, type SxProps, type Theme, Typography } from "@mui/material";

type PageHeaderProps = {
  title: string;
  children?: React.ReactNode;
  sx?: SxProps<Theme>;
};

export default function PageHeader({ title, children, sx }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: 2,
        ...sx,
      }}
    >
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          color: "#0f172a",
          letterSpacing: "-0.03em",
          fontSize: "1.75rem",
          lineHeight: 1.2,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}