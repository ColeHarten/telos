"use client";

import { Box, Typography } from "@mui/material";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Less padding, for inside a card or a table. */
  dense?: boolean;
};

/** The one empty-state style: an icon, a line or two of text, and an optional button. */
export default function EmptyState({ icon, title, description, action, dense }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 0.75,
        px: 3,
        py: dense ? 4 : 7,
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 44,
            height: 44,
            mb: 0.75,
            borderRadius: "50%",
            bgcolor: "grey.100",
            color: "text.secondary",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            "& svg": { fontSize: 22 },
          }}
        >
          {icon}
        </Box>
      )}
      <Typography sx={{ fontWeight: 600, fontSize: "0.95rem", color: "text.primary" }}>{title}</Typography>
      {description && (
        <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 440 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.25 }}>{action}</Box>}
    </Box>
  );
}
