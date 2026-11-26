"use client";

import type { Category, CategoryKind } from "@/lib/types/types";
import { Autocomplete, TextField } from "@mui/material";
import { useMemo } from "react";

const GROUP_LABELS: Record<CategoryKind, string> = { expense: "Expenses", income: "Income", transfer: "Transfers" };
const GROUP_ORDER: Record<CategoryKind, number> = { expense: 0, income: 1, transfer: 2 };

type CategoryPickerProps = {
  categories: readonly Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  label?: string;
  placeholder?: string;
  size?: "small" | "medium";
  disabled?: boolean;
  autoFocus?: boolean;
  /** Leaves categories out (for example, transfers to the transaction's own account). */
  exclude?: (category: Category) => boolean;
};

/**
 * A searchable category picker grouped into Expenses, Income, and Transfers.
 * Archived categories are offered only when already selected.
 */
export default function CategoryPicker({
  categories,
  value,
  onChange,
  label,
  placeholder,
  size = "small",
  disabled,
  autoFocus,
  exclude,
}: CategoryPickerProps) {
  const options = useMemo(
    () =>
      categories
        .filter((category) => category.id === value || (!category.isArchived && !exclude?.(category)))
        .sort((a, b) => GROUP_ORDER[a.kind] - GROUP_ORDER[b.kind] || a.name.localeCompare(b.name)),
    [categories, value, exclude]
  );
  const selected = options.find((category) => category.id === value) ?? null;

  return (
    <Autocomplete
      options={options}
      value={selected}
      onChange={(_, next) => onChange(next?.id ?? null)}
      groupBy={(option) => GROUP_LABELS[option.kind]}
      getOptionLabel={(option) => (option.isArchived ? `${option.name} (archived)` : option.name)}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      size={size}
      disabled={disabled}
      autoHighlight
      openOnFocus
      fullWidth
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} autoFocus={autoFocus} />}
    />
  );
}
