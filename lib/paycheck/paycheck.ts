import type { Deduction, PayFrequency } from "@/lib/types/types";

type DeductionBreakdownEntry = {
  deductionId: string;
  linkedAccountId: string;
  monthlyAmount: number;
};

export const payFrequencyOptions: {
  label: string;
  shortLabel: string;
  value: PayFrequency;
  multiplier: number;
}[] = [
  { label: "Weekly (52/yr)", shortLabel: "Weekly", value: "weekly", multiplier: 52 / 12 },
  { label: "Bi-weekly (26/yr)", shortLabel: "Bi-weekly", value: "biweekly", multiplier: 26 / 12 },
  { label: "Semi-monthly (24/yr)", shortLabel: "Semi-monthly", value: "semimonthly", multiplier: 24 / 12 },
  { label: "Monthly (12/yr)", shortLabel: "Monthly", value: "monthly", multiplier: 12 / 12 },
];

export function calculateWithholdings(gross: number, deductions: Deduction[], frequency: PayFrequency) {
  let totalWithheld = 0;
  const deductionBreakdown: DeductionBreakdownEntry[] = [];

  for (const deduction of deductions) {
    const deductionAmount = deduction.kind === "percentOfGross"
      ? (deduction.value / 100) * gross
      : deduction.value;

    totalWithheld += deductionAmount;

    if (deduction.type !== "tax" && deduction.linkedAccountId) {
      deductionBreakdown.push({
        deductionId: deduction.id,
        linkedAccountId: deduction.linkedAccountId,
        monthlyAmount: deductionAmount * (payFrequencyOptions.find((o) => o.value === frequency)?.multiplier ?? 26 / 12),
      });
    }
  }

  const netPay = Math.max(0, gross - totalWithheld);
  const option = payFrequencyOptions.find((o) => o.value === frequency);
  const multiplier = option ? option.multiplier : 26 / 12;

  return {
    netPay,
    totalWithheld,
    estimatedMonthlyNet: netPay * multiplier,
    estimatedMonthlyGross: gross * multiplier,
    estimatedMonthlyWithheld: totalWithheld * multiplier,
    deductionBreakdown,
  };
}