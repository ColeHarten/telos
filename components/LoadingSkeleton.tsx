"use client";

import { Box, Skeleton, Stack } from "@mui/material";

/** Placeholder rows shaped like a transaction or account list, while it loads. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Box aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Box
          key={index}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            borderTop: index === 0 ? "none" : "1px solid",
            borderColor: "grey.100",
          }}
        >
          <Skeleton variant="circular" width={32} height={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="24%" sx={{ fontSize: "0.75rem" }} />
          </Box>
          <Skeleton variant="text" width={72} />
        </Box>
      ))}
    </Box>
  );
}

/** Placeholder cards for a page's first load. */
export function CardsSkeleton({ heights = [96, 180, 180] }: { heights?: number[] }) {
  return (
    <Stack spacing={2} aria-busy="true" aria-label="Loading">
      {heights.map((height, index) => (
        <Skeleton key={index} variant="rounded" height={height} sx={{ borderRadius: 3 }} />
      ))}
    </Stack>
  );
}
