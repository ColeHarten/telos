"use client";

import { Box, Button, Typography } from "@mui/material";
import Link from "next/link";

export default function NotFound() {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>

      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The page you are looking for does not exist.
      </Typography>

      <Button component={Link} href="/dashboard" variant="contained">
        Back to Dashboard
      </Button>
    </Box>
  );
}