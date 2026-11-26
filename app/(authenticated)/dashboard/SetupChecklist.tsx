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

  // Once everything is done, it stays gone even if Needs review fills up again.
  useEffect(() => {
    if (allDone) saveHidden();
  }, [allDone]);

  if (hidden || allDone) return null;

  function hide() {
    saveHidden();
    setHidden(true);
  }

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, "&:last-child": { pb: { xs: 1.5, md: 2 } } }}>
        <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>Get set up</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {doneCount} of {steps.length} done
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(doneCount / steps.length) * 100}
          sx={{ mt: 1.5, mb: 1.5, height: 6 }}
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
                borderTop: index === 0 ? "none" : "1px solid",
                borderColor: "grey.100",
              }}
            >
              {step.done ? (
                <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 22 }} />
              ) : (
                <RadioButtonUncheckedRoundedIcon sx={{ color: "grey.300", fontSize: 22 }} />
              )}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.9rem", color: step.done ? "text.secondary" : "text.primary" }}>
                  {step.label}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  {step.detail}
                </Typography>
              </Box>
              {!step.done && (
                <Button
                  component={Link}
                  href={step.href}
                  size="small"
                  variant="outlined"
                  sx={{ flexShrink: 0 }}
                >
                  Start
                </Button>
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
          <Button onClick={hide} size="small" color="inherit" sx={{ color: "text.secondary" }}>
            Hide checklist
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
