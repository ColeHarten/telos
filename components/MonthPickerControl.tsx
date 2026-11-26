"use client";

import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import {
  Box,
  Button,
  Divider,
  Grid,
  IconButton,
  Popover,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { getCurrentMonthKey, shiftMonthKey } from "@/lib/budgetCalculations";

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMonthLabel(monthKey: string) {
  if (!monthKey) {
    return "Loading month";
  }

  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export { getCurrentMonthKey, shiftMonthKey };

type MonthPickerControlProps = {
  monthKey: string;
  onChange: (nextMonthKey: string) => void;
  // When true, shows the prev/next chevrons around the label.
  // Set to false for a compact label-only trigger (e.g. a second picker
  // in a start/end range pair where stepping isn't needed).
  showStepButtons?: boolean;
  ariaLabelPrefix?: string;
};

// A clickable month label that opens a year + month-grid popover, with
// optional prev/next chevrons for single-step navigation. Used by both the
// dashboard's single-month header and its range start/end pickers.
export function MonthPickerControl({
  monthKey,
  onChange,
  showStepButtons = true,
  ariaLabelPrefix = "",
}: MonthPickerControlProps) {
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const isPickerOpen = Boolean(pickerAnchor);

  // Year currently shown inside the picker popover. Separate from monthKey's
  // year so the user can browse years without changing the selected month
  // until they actually click one.
  const [pickerYear, setPickerYear] = useState<number>(() =>
    Number(monthKey.split("-")[0])
  );

  function openPicker(event: React.MouseEvent<HTMLElement>) {
    setPickerYear(Number(monthKey.split("-")[0]));
    setPickerAnchor(event.currentTarget);
  }

  function closePicker() {
    setPickerAnchor(null);
  }

  function selectMonthFromPicker(monthIndex: number) {
    onChange(`${pickerYear}-${String(monthIndex + 1).padStart(2, "0")}`);
    closePicker();
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "8px",
        bgcolor: "background.paper",
        height: "40px",
        overflow: "hidden",
      }}
    >
      {showStepButtons && (
        <>
          <IconButton
            onClick={() => onChange(shiftMonthKey(monthKey, -1))}
            aria-label={`${ariaLabelPrefix}Previous month`}
            sx={{
              borderRadius: 0,
              height: "100%",
              px: "8px",
            }}
          >
            <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>

          <Divider orientation="vertical" flexItem />
        </>
      )}

      <Box
        onClick={openPicker}
        sx={{
          display: "flex",
          alignItems: "center",
          px: "12px",
          height: "100%",
          cursor: "pointer",
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            whiteSpace: "nowrap",
            minWidth: "120px",
            textAlign: "center",
          }}
        >
          {formatMonthLabel(monthKey)}
        </Typography>
      </Box>

      {showStepButtons && (
        <>
          <Divider orientation="vertical" flexItem />

          <IconButton
            onClick={() => onChange(shiftMonthKey(monthKey, 1))}
            aria-label={`${ariaLabelPrefix}Next month`}
            sx={{
              borderRadius: 0,
              height: "100%",
              px: "8px",
            }}
          >
            <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </>
      )}

      <Popover
        open={isPickerOpen}
        anchorEl={pickerAnchor}
        onClose={closePicker}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "12px",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
              mt: "4px",
            },
          },
        }}
      >
        <Box sx={{ p: "16px", width: "280px" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              mb: "12px",
            }}
          >
            <IconButton
              onClick={() => setPickerYear((year) => year - 1)}
              aria-label="Previous year"
              size="small"
            >
              <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>

            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {pickerYear}
            </Typography>

            <IconButton
              onClick={() => setPickerYear((year) => year + 1)}
              aria-label="Next year"
              size="small"
            >
              <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          <Grid container spacing="8px">
            {MONTH_SHORT_LABELS.map((label, index) => {
              const candidateKey = `${pickerYear}-${String(
                index + 1
              ).padStart(2, "0")}`;
              const isSelected = candidateKey === monthKey;

              return (
                <Grid key={label} size={4}>
                  <Button
                    onClick={() => selectMonthFromPicker(index)}
                    variant={isSelected ? "contained" : "text"}
                    fullWidth
                    sx={{
                      minWidth: 0,
                      height: "36px",
                    }}
                  >
                    {label}
                  </Button>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Popover>
    </Box>
  );
}

export default MonthPickerControl;