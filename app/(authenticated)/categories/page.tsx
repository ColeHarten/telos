"use client";

import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useCategories from "@/lib/hooks/useCategories";
import type { Account, Category, CategoryKind, PaycheckDetails } from "@/lib/types/types";
import { plaidCategoryLabel } from "@/lib/plaidCategories";
import { STARTER_CATEGORIES } from "@/lib/starterCategories";
import { formatCurrency } from "@/lib/utils";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import RestorePageRoundedIcon from "@mui/icons-material/RestorePageRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import UnarchiveRoundedIcon from "@mui/icons-material/UnarchiveRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import AddCategoryModal from "./AddCategoryModal";
import EmptyState from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import PageHeader from "@/components/PageHeader";
import StatStrip from "@/components/StatStrip";
import IsolationWarningDialog from "@/components/IsolationWarningDialog";

type KindFilter = "all" | CategoryKind;

const categoryStyles: Record<
  CategoryKind,
  { label: string; color: string; background: string; icon: typeof TrendingUpRoundedIcon }
> = {
  income: { label: "Income", color: "#059669", background: "#ecfdf5", icon: TrendingUpRoundedIcon },
  expense: { label: "Expense", color: "error.main", background: "#fef2f2", icon: TrendingDownRoundedIcon },
  transfer: { label: "Transfer", color: "primary.main", background: "#eff6ff", icon: SwapHorizRoundedIcon },
};

// --- Main Page Component ---
export default function CategoriesPage() {
  const { user, authLoading } = useAuth();
  const { accounts } = useAccounts(user, authLoading);
  const {
    categories,
    addCategory,
    updateCategory,
    archiveCategory,
    restoreCategory,
    checkCategoryIsolation,
    countCategoryUsage,
    deleteCategoryPermanently,
    reconcileContributionTransfers,
    addStarterCategories,
    categoriesLoading,
  } = useCategories(user, authLoading);
  const isLoading = categoriesLoading;

  const [isSaving, setIsSaving] = useState(false);
  const [addingStarters, setAddingStarters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEditingCategory, setSelectedEditingCategory] = useState<Category | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuCategoryId, setRowMenuCategoryId] = useState<string | null>(null);

  // Pre-archive warning flow — set once checkCategoryIsolation finds live
  // references, cleared on cancel/confirm. isCheckingIsolation covers the
  // brief async gap between clicking "Archive" and the check resolving, so
  // the row menu doesn't feel unresponsive while it runs.
  const [isolationCheckCategory, setIsolationCheckCategory] = useState<Category | null>(null);
  const [isolationReasons, setIsolationReasons] = useState<string[]>([]);
  const [isCheckingIsolation, setIsCheckingIsolation] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  // Permanent delete (archived categories only).
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleteUsage, setDeleteUsage] = useState<{ transactions: number; rules: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories]);
  const archivedCategories = useMemo(() => categories.filter((c) => c.isArchived), [categories]);

  const incomeCategories = useMemo(() => activeCategories.filter((c) => c.kind === "income"), [activeCategories]);
  const expenseCategories = useMemo(() => activeCategories.filter((c) => c.kind === "expense"), [activeCategories]);
  const transferCategories = useMemo(() => activeCategories.filter((c) => c.kind === "transfer"), [activeCategories]);

  const summary = {
    income: { count: incomeCategories.length, total: incomeCategories.reduce((s, c) => s + (c.estimatedMonthly ?? 0), 0) },
    expense: { count: expenseCategories.length, total: expenseCategories.reduce((s, c) => s + (c.estimatedMonthly ?? 0), 0) },
    transfer: { count: transferCategories.length, total: transferCategories.reduce((s, c) => s + (c.estimatedMonthly ?? 0), 0) },
  };

  function isDependentTransferCategory(category: Category | null | undefined) {
    return Boolean(category?.kind === "transfer" && category.sourceIncomeCategoryId && category.sourceDeductionId);
  }

  const displayedCategories = useMemo(() => {
    const base = showArchived ? archivedCategories : activeCategories;
    const query = searchQuery.trim().toLowerCase();

    const filtered = base.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (!query) return true;
      return c.name.toLowerCase().includes(query) || (c.description ?? "").toLowerCase().includes(query);
    });

    const incomeParents = filtered
      .filter((c) => c.kind === "income")
      .sort((a, b) => a.name.localeCompare(b.name));
    const dependentTransfers = filtered.filter((c) => isDependentTransferCategory(c));
    const otherCategories = filtered
      .filter((c) => c.kind !== "income" && !isDependentTransferCategory(c))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rows: Array<{ type: "parent" | "child" | "other"; category: Category; parentCategory?: Category }> = [];

    incomeParents.forEach((incomeCategory) => {
      rows.push({ type: "parent", category: incomeCategory });

      const children = dependentTransfers
        .filter((child) => child.sourceIncomeCategoryId === incomeCategory.id)
        .sort((a, b) => a.name.localeCompare(b.name));

      children.forEach((child) => {
        rows.push({ type: "child", category: child, parentCategory: incomeCategory });
      });
    });

    otherCategories.forEach((category) => {
      rows.push({ type: "other", category });
    });

    return rows;
  }, [showArchived, archivedCategories, activeCategories, kindFilter, searchQuery]);

  function handleOpenAddForm() {
    setFormError(null);
    setSelectedEditingCategory(null);
    setDialogOpen(true);
  }

  function handleOpenEditForm(category: Category) {
    setFormError(null);
    setSelectedEditingCategory(category);
    setDialogOpen(true);
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setSelectedEditingCategory(null);
    setFormError(null);
  }

  async function handleAddStarters() {
    setAddingStarters(true);
    try {
      await addStarterCategories();
    } catch (err) {
      console.error(err);
      setError("Could not add the starter categories.");
    } finally {
      setAddingStarters(false);
    }
  }

  async function handleSaveCategoryForm(formData: {
    name: string;
    kind: CategoryKind;
    estimatedMonthly: number;
    description: string;
    transferAccountId: string | null;
    plaidCategories: string[];
    paycheckDetails: PaycheckDetails | null;
    deductionBreakdown: { deductionId: string; linkedAccountId: string; monthlyAmount: number }[];
  }) {
    const trimmedName = formData.name.trim();
    const normalizedName = trimmedName.toLowerCase();

    if (!trimmedName) {
      setFormError("Category name is required.");
      return;
    }

    if (formData.kind === "transfer" && !formData.transferAccountId) {
      setFormError("Choose a destination account for this transfer category.");
      return;
    }

    const isDuplicate = categories.some(
      (c) => c.id !== selectedEditingCategory?.id && c.name.trim().toLowerCase() === normalizedName
    );
    if (isDuplicate) {
      setFormError(`A category named "${trimmedName}" already exists.`);
      return;
    }

    const payload = {
      name: trimmedName,
      kind: formData.kind,
      estimatedMonthly: formData.estimatedMonthly,
      description: formData.description,
      transferAccountId: formData.kind === "transfer" ? formData.transferAccountId : null,
      plaidCategories: formData.plaidCategories,
      paycheckDetails: formData.kind === "income" ? formData.paycheckDetails : null,
    };

    try {
      setFormError(null);
      setIsSaving(true);

      let incomeCategoryId: string | null = null;

      if (selectedEditingCategory) {
        await updateCategory(selectedEditingCategory.id, payload);
        incomeCategoryId = selectedEditingCategory.id;
      } else {
        incomeCategoryId = await addCategory(payload);
      }

      // Reconcile linked-deduction transfer categories whenever an income
      // category is saved — including with an empty breakdown, so turning
      // off "Add withholdings and deductions" (or removing a link) cleans
      // up any transfer categories that were auto-created previously.
      if (formData.kind === "income" && incomeCategoryId) {
        await reconcileContributionTransfers(
          incomeCategoryId,
          formData.paycheckDetails?.deductions ?? [],
          formData.deductionBreakdown
        );
      }

      setDialogOpen(false);
      setSelectedEditingCategory(null);
    } catch (saveError) {
      console.error(saveError);
      setFormError(selectedEditingCategory ? "Could not update category." : "Could not add category.");
    } finally {
      setIsSaving(false);
    }
  }

  // Actually performs the archive (used both for the "no references found"
  // fast path and after the user confirms the warning dialog).
  async function runArchiveCategory(categoryId: string) {
    try {
      setError(null);
      await archiveCategory(categoryId);
      if (selectedEditingCategory?.id === categoryId) handleCloseDialog();
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive category.");
    }
  }

  async function handleArchiveCategory(categoryId: string) {
    const categoryToArchive = categories.find((c) => c.id === categoryId);
    if (!categoryToArchive) return;

    if (isDependentTransferCategory(categoryToArchive)) {
      setError("This transfer category is managed by its income category and cannot be archived separately.");
      return;
    }

    setError(null);
    setIsCheckingIsolation(true);
    try {
      const result = await checkCategoryIsolation(categoryId);
      if (result.isIsolated) {
        await runArchiveCategory(categoryId);
      } else {
        // Don't archive yet — show the user what's still connected and let
        // them confirm. archiveCategory itself never blocks; this check is
        // purely informational (see checkCategoryIsolation's doc comment).
        setIsolationCheckCategory(categoryToArchive);
        setIsolationReasons(result.reasons);
      }
    } catch (checkError) {
      console.error(checkError);
      setError("Could not check what's connected to this category before archiving.");
    } finally {
      setIsCheckingIsolation(false);
    }
  }

  async function handleConfirmArchiveFromDialog() {
    if (!isolationCheckCategory) return;
    setIsConfirmingArchive(true);
    await runArchiveCategory(isolationCheckCategory.id);
    setIsConfirmingArchive(false);
    setIsolationCheckCategory(null);
    setIsolationReasons([]);
  }

  function handleCancelArchiveDialog() {
    setIsolationCheckCategory(null);
    setIsolationReasons([]);
  }

  async function handleOpenDelete(category: Category) {
    setError(null);
    setDeleteTarget(category);
    setDeleteUsage(null);
    try {
      setDeleteUsage(await countCategoryUsage(category.id));
    } catch (usageError) {
      console.error(usageError);
      setDeleteTarget(null);
      setError("Could not check where this category is used.");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCategoryPermanently(deleteTarget.id);
      setDeleteTarget(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete category.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRestoreCategory(category: Category) {
    try {
      setError(null);
      // restoreCategory cascades to any dependent transfer categories that
      // were archived alongside this one (see archiveCategory in
      // useCategories.ts) — resending name/kind/estimatedMonthly matches
      // the previous inline updateDoc call's behavior (a defensive no-op
      // refresh of those fields on restore).
      await restoreCategory(category, {
        name: category.name,
        kind: category.kind,
        estimatedMonthly: category.estimatedMonthly,
      });
    } catch (restoreError) {
      console.error(restoreError);
      setError("Could not restore category.");
    }
  }

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, categoryId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuCategoryId(categoryId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuCategoryId(null);
  }

  function renderAmountCell(category: Category) {
    const amount = (
      <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
        {formatCurrency(category.estimatedMonthly ?? 0)}
      </Typography>
    );

    if (category.kind === "transfer") {
      const account = accounts.find((a: Account) => a.id === category.transferAccountId);
      return (
        <Box>
          {amount}
          {account && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              → {account.name}
            </Typography>
          )}
        </Box>
      );
    }

    if (category.kind === "income" && category.paycheckDetails) {
      return (
        <Box sx={{ display: "flex", 
                   alignItems: "center", 
                   gap: 0.5, 
                   justifyContent: "flex-end"
                   }}>
          <LockRoundedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
          {amount}
        </Box>
      );
    }

    return amount;
  }

  const rowMenuCategory = categories.find((c) => c.id === rowMenuCategoryId) ?? null;

  return (
    <Stack spacing={3}>
      {/* Header */}
      <PageHeader title="Categories">
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={handleOpenAddForm} sx={{ whiteSpace: "nowrap" }}>
          Add category
        </Button>
      </PageHeader>

      {error && (
        <Snackbar open={error !== null} autoHideDuration={5000} onClose={() => setError(null)}>
          <Alert severity="error" variant="filled" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Snackbar>
      )}

      <StatStrip
        stats={[
          { label: "Income categories", value: String(summary.income.count), caption: `${formatCurrency(summary.income.total)} a month (est.)` },
          { label: "Expense categories", value: String(summary.expense.count), caption: `${formatCurrency(summary.expense.total)} a month (est.)` },
          { label: "Transfer categories", value: String(summary.transfer.count), caption: `${formatCurrency(summary.transfer.total)} a month (est.)` },
        ]}
      />

      {/* Tabs & Search */}
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", md: "center" } }}>
        <Tabs
          value={kindFilter}
          onChange={(_, v) => setKindFilter(v)}
        >
          {[
            { label: "All", value: "all" },
            { label: "Income", value: "income" },
            { label: "Expenses", value: "expense" },
            { label: "Transfers", value: "transfer" },
          ].map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={tab.label}
            />
          ))}
        </Tabs>

        <Stack direction="row" spacing={1.5}>
          <TextField
            size="small"
            placeholder="Search categories"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{ input: { startAdornment: (<InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18, color: "text.disabled" }} /></InputAdornment>) } }}
            sx={{ width: { xs: "100%", md: 240 } }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={() => setShowArchived((prev) => !prev)}
            startIcon={showArchived ? <RestorePageRoundedIcon /> : <ArchiveRoundedIcon />}
            sx={{ height: 40, px: 2, whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {showArchived ? "View active" : `Archived (${archivedCategories.length})`}
          </Button>
        </Stack>
      </Stack>

      {!isLoading && categories.length === 0 && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={handleAddStarters}
              disabled={addingStarters}
              sx={{ whiteSpace: "nowrap" }}
            >
              {addingStarters ? "Adding…" : "Add starter categories"}
            </Button>
          }
        >
          Start with {STARTER_CATEGORIES.length} common categories, each mapped to bank categories, so most
          transactions are categorized from your first sync. You can edit or archive any of them.
        </Alert>
      )}

      {/* Categories Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table sx={{ minWidth: 550 }}>
          <TableHead>
            <TableRow>
              <TableCell>Category</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Est. monthly</TableCell>
              <TableCell align="right" sx={{ width: 64 }} aria-label="Actions" />
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                  <ListSkeleton rows={5} />
                </TableCell>
              </TableRow>
            ) : displayedCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ border: 0 }}>
                  {showArchived ? (
                    <EmptyState dense icon={<ArchiveRoundedIcon />} title="No archived categories" description="Categories you archive move here." />
                  ) : searchQuery.trim() ? (
                    <EmptyState dense icon={<SearchRoundedIcon />} title="No matches" description="Try another name, or clear the search." />
                  ) : (
                    <EmptyState
                      dense
                      icon={<CategoryOutlinedIcon />}
                      title="No categories here yet"
                      description={categories.length === 0 ? "Add one, or start with the starter set above." : "Add one with Add category."}
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              displayedCategories.map((row) => {
                const category = row.category;
                const style = categoryStyles[category.kind];
                const isDependentTransfer = row.type === "child" && Boolean(row.parentCategory);

                return (
                  <TableRow key={`${row.type}-${category.id}`} hover sx={{ "&:last-child td, &:last-child th": { border: 0 } }}>
                    <TableCell>
                      <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 1, pl: isDependentTransfer ? 2.25 : 0 }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>{category.name}</Typography>
                          {isDependentTransfer && row.parentCategory && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                              Linked to {row.parentCategory.name}
                            </Typography>
                          )}
                          {category.description && !isDependentTransfer && (
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                              {category.description}
                            </Typography>
                          )}
                          {(category.plaidCategories?.length ?? 0) > 0 && (
                            <Typography
                              variant="caption"
                              sx={{ color: "grey.400", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}
                            >
                              Plaid: {category.plaidCategories?.map((code) => plaidCategoryLabel(code)).join(", ")}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={isDependentTransfer ? "Dependent transfer" : style.label}
                        size="small"
                        sx={{ bgcolor: isDependentTransfer ? "#f8fafc" : style.background, color: isDependentTransfer ? "#64748b" : style.color, fontWeight: 700, fontSize: "0.75rem", height: 24 }}
                      />
                    </TableCell>
                    <TableCell align="right">{renderAmountCell(category)}</TableCell>
                    <TableCell align="right">
                      {isDependentTransfer ? (
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginRight: "5px", color: "text.disabled" }}>
                          <LockRoundedIcon sx={{ fontSize: 14 }} />
                        </Box>
                      ) : (
                        <IconButton aria-label={`Actions for ${category.name}`} size="small" onClick={(e) => handleOpenRowMenu(e, category.id)}>
                          <MoreHorizRoundedIcon fontSize="small" sx={{ color: "text.secondary" }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <AddCategoryModal
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveCategoryForm}
        isSaving={isSaving}
        editingCategory={selectedEditingCategory}
        accounts={accounts}
        categories={categories}
        error={formError}
      />

      <IsolationWarningDialog
        open={isolationCheckCategory !== null}
        entityLabel="category"
        entityName={isolationCheckCategory?.name ?? ""}
        reasons={isolationReasons}
        isProcessing={isConfirmingArchive}
        onCancel={handleCancelArchiveDialog}
        onConfirm={handleConfirmArchiveFromDialog}
      />

      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu} slotProps={{ paper: { sx: { mt: 1, borderRadius: 2, minWidth: 160, border: "1px solid", borderColor: "divider" } } }}>
        {rowMenuCategory && isDependentTransferCategory(rowMenuCategory) ? (
          <MenuItem disabled sx={{ gap: 1.5, py: 1.25 }}>
            <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Managed by income category</Typography>
          </MenuItem>
        ) : (
          <>
            {rowMenuCategory && !rowMenuCategory.isArchived && (
              <MenuItem onClick={() => { handleOpenEditForm(rowMenuCategory); handleCloseRowMenu(); }} sx={{ gap: 1.5, py: 1.25 }}>
                <EditRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Edit</Typography>
              </MenuItem>
            )}
            {rowMenuCategory && !rowMenuCategory.isArchived ? (
              <MenuItem
                onClick={() => { handleArchiveCategory(rowMenuCategory.id); handleCloseRowMenu(); }}
                disabled={isCheckingIsolation}
                sx={{ gap: 1.5, py: 1.25, color: "error.main" }}
              >
                <ArchiveRoundedIcon sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Archive</Typography>
              </MenuItem>
            ) : (
              rowMenuCategory && (
                <MenuItem onClick={() => { handleRestoreCategory(rowMenuCategory); handleCloseRowMenu(); }} sx={{ gap: 1.5, py: 1.25, color: "success.main" }}>
                  <UnarchiveRoundedIcon sx={{ fontSize: 18 }} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>Restore</Typography>
                </MenuItem>
              )
            )}
            {rowMenuCategory && rowMenuCategory.isArchived && (
              <MenuItem onClick={() => { handleOpenDelete(rowMenuCategory); handleCloseRowMenu(); }} sx={{ gap: 1.5, py: 1.25, color: "error.main" }}>
                <DeleteForeverRoundedIcon sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Delete permanently</Typography>
              </MenuItem>
            )}
          </>
        )}
      </Menu>

      <Dialog open={Boolean(deleteTarget)} onClose={() => !isDeleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {deleteTarget?.name} permanently?</DialogTitle>
        <DialogContent>
          {deleteUsage === null ? (
            <Typography variant="body2" color="text.secondary">Checking where it's used…</Typography>
          ) : (
            <Stack spacing={1}>
              <Typography variant="body2">
                {deleteUsage.transactions === 0
                  ? "No transactions use this category."
                  : `${deleteUsage.transactions} transaction${deleteUsage.transactions === 1 ? "" : "s"} will go back to Needs review.`}
              </Typography>
              {deleteUsage.rules > 0 && (
                <Typography variant="body2">
                  {`${deleteUsage.rules} rule${deleteUsage.rules === 1 ? "" : "s"} that set${deleteUsage.rules === 1 ? "s" : ""} it will be switched off.`}
                </Typography>
              )}
              {deleteTarget && categories.some((c) => c.sourceIncomeCategoryId === deleteTarget.id) && (
                <Typography variant="body2">Its paycheck transfer categories will be deleted too.</Typography>
              )}
              <Typography variant="body2" color="text.secondary">This can't be undone.</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete} disabled={isDeleting || deleteUsage === null}>
            {isDeleting ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}