"use client";

import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import { Box, Button, Card, CardContent, LinearProgress, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "telos.setupChecklistHidden";

export type SetupStep = {
  label: string;
  detail: string;
  done: boolean;
  href: string;
};

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveHidden(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private browsing can block storage; the checklist just shows again next time.
  }
}

/**
 * The Dashboard's getting-started steps. Shown until every step is done once,
 * or until you hide it; remembered in this browser.
 */
export default function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const [hidden, setHidden] = useState(readHidden);
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  // Once everything is done, it stays gone even if Needs Review fills up again.
  useEffect(() => {
    if (allDone) saveHidden();
  }, [allDone]);

  if (hidden || allDone) return null;

  function hide() {
    saveHidden();
    setHidden(true);
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: "14px", borderColor: "#e7eaef", bgcolor: "#fff", boxShadow: "none" }}>
      <CardContent sx={{ p: "24px" }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography sx={{ fontWeight: 600, fontSize: "1.1rem", color: "#0f172a", letterSpacing: "-0.01em" }}>Get set up</Typography>
          <Typography variant="body2" sx={{ color: "#64748b" }}>
            {doneCount} of {steps.length} done
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(doneCount / steps.length) * 100}
          sx={{ mt: 1.5, mb: 2, height: 6, borderRadius: 3, bgcolor: "#f1f5f9", "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: "#2563eb" } }}
        />

        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {steps.map((step, index) => (
            <Box
              key={step.label}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                py: 1.25,
                borderTop: index === 0 ? "none" : "1px solid #f1f5f9",
              }}
            >
              {step.done ? (
                <CheckCircleRoundedIcon sx={{ color: "#16a34a", fontSize: 22 }} />
              ) : (
                <RadioButtonUncheckedRoundedIcon sx={{ color: "#cbd5e1", fontSize: 22 }} />
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.9rem", color: step.done ? "#64748b" : "#0f172a" }}>
                  {step.label}
                </Typography>
                <Typography variant="caption" sx={{ color: "#94a3b8", display: "block" }}>
                  {step.detail}
                </Typography>
              </Box>
              {!step.done && (
                <Button
                  component={Link}
                  href={step.href}
                  size="small"
                  variant="outlined"
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "#bfdbfe", color: "#2563eb", flexShrink: 0 }}
                >
                  Start
                </Button>
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button onClick={hide} size="small" sx={{ textTransform: "none", fontWeight: 600, color: "#64748b" }}>
            Hide checklist
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
