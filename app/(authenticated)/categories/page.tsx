"use client";

import useAccounts from "@/lib/hooks/useAccounts";
import useAuth from "@/lib/hooks/useAuth";
import useCategories from "@/lib/hooks/useCategories";
import type { Account, Category, CategoryKind, PaycheckProfile } from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import CurrencyBitcoinRoundedIcon from "@mui/icons-material/CurrencyBitcoinRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import RequestQuoteRoundedIcon from "@mui/icons-material/RequestQuoteRounded";
import RestorePageRoundedIcon from "@mui/icons-material/RestorePageRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import UnarchiveRoundedIcon from "@mui/icons-material/UnarchiveRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AddCategoryModal from "./AddCategoryModal";
import ProfileEditorDialog, { calculateWithholdings } from "./ProfileEditorDialog";

type KindFilter = "all" | CategoryKind;

const categoryStyles: Record<
  CategoryKind,
  { label: string; color: string; background: string; icon: typeof TrendingUpRoundedIcon }
> = {
  income: { label: "Income", color: "#059669", background: "#ecfdf5", icon: TrendingUpRoundedIcon },
  expense: { label: "Expense", color: "#dc2626", background: "#fef2f2", icon: TrendingDownRoundedIcon },
  transfer: { label: "Transfer", color: "#2563eb", background: "#eff6ff", icon: SwapHorizRoundedIcon },
};

function getAccountVisual(accountType: string) {
  switch (accountType) {
    case "credit_card":
      return { icon: <CreditCardRoundedIcon sx={{ fontSize: 15 }} />, bg: "#fef2f2", color: "#dc2626" };
    case "investment":
    case "retirement":
      return { icon: <ShowChartRoundedIcon sx={{ fontSize: 15 }} />, bg: "#f0fdf4", color: "#16a34a" };
    case "loan":
      return { icon: <RequestQuoteRoundedIcon sx={{ fontSize: 15 }} />, bg: "#fff7ed", color: "#ea580c" };
    case "property":
      return { icon: <HomeRoundedIcon sx={{ fontSize: 15 }} />, bg: "#fff7ed", color: "#ea580c" };
    case "crypto":
      return { icon: <CurrencyBitcoinRoundedIcon sx={{ fontSize: 15 }} />, bg: "#f5f3ff", color: "#7c3aed" };
    default:
      return { icon: <AccountBalanceRoundedIcon sx={{ fontSize: 15 }} />, bg: "#eff6ff", color: "#2563eb" };
  }
}

function accountTypeLabel(accountType: string) {
  return accountType.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// --- Main Page Component ---
export default function CategoriesPage() {
  const { user, authLoading } = useAuth();
  const { accounts } = useAccounts(user, authLoading);
  const {
    categories,
    paycheckProfiles,
    addCategory,
    updateCategory,
    archiveCategory,
    categoriesLoading,
  } = useCategories(user, authLoading);
  const isLoading = categoriesLoading;

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEditingCategory, setSelectedEditingCategory] = useState<Category | null>(null);

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuCategoryId, setRowMenuCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [user, categories]);

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

  const displayedCategories = useMemo(() => {
    const base = showArchived ? archivedCategories : activeCategories;
    const query = searchQuery.trim().toLowerCase();
    return base.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (!query) return true;
      return c.name.toLowerCase().includes(query) || (c.description ?? "").toLowerCase().includes(query);
    });
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

  async function handleSaveCategoryForm(formData: {
    name: string;
    kind: CategoryKind;
    estimatedMonthly: number;
    description: string;
    keywords: string[];
    transferAccountId: string | null;
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
      keywords: formData.keywords,
      transferAccountId: formData.kind === "transfer" ? formData.transferAccountId : null,
    };

    try {
      setFormError(null);
      setIsSaving(true);

      if (selectedEditingCategory) {
        await updateCategory(selectedEditingCategory.id, payload);
      } else {
        await addCategory(payload);
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

  async function handleArchiveCategory(categoryId: string) {
    try {
      setError(null);
      await archiveCategory(categoryId);
      if (selectedEditingCategory?.id === categoryId) handleCloseDialog();
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive category.");
    }
  }

  async function handleRestoreCategory(category: Category) {
    try {
      setError(null);
      await updateCategory(category.id, {
        name: category.name,
        kind: category.kind,
        estimatedMonthly: category.estimatedMonthly,
        isArchived: false,
      });
    } catch (restoreError) {
      console.error(restoreError);
      setError("Could not restore category.");
    }
  }

  function handleOpenAddProfile() {
    setEditingProfileId(null);
    setProfileDialogOpen(true);
  }

  function handleOpenEditProfile(profileId: string) {
    setEditingProfileId(profileId);
    setProfileDialogOpen(true);
  }

  function handleCloseProfileDialog() {
    setProfileDialogOpen(false);
    setEditingProfileId(null);
  }

  function handleOpenRowMenu(event: React.MouseEvent<HTMLElement>, categoryId: string) {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuCategoryId(categoryId);
  }

  function handleCloseRowMenu() {
    setRowMenuAnchor(null);
    setRowMenuCategoryId(null);
  }

  function renderLinkedCell(category: Category) {
    if (category.kind === "transfer") {
      const account = accounts.find((a: Account) => a.id === category.transferAccountId);
      if (!account) return <Typography variant="body2" color="text.secondary">—</Typography>;
      const visual = getAccountVisual(account.accountType);
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: visual.bg, color: visual.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {visual.icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name}</Typography>
            <Typography variant="caption" color="text.secondary">{accountTypeLabel(account.accountType)}</Typography>
          </Box>
        </Box>
      );
    }

    if (category.kind === "income") {
      const profile = paycheckProfiles.find((p) => p.linkedIncomeCategoryId === category.id);
      if (profile) {
        return (
          <Box
            onClick={() => handleOpenEditProfile(profile.id)}
            sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer", width: "fit-content" }}
          >
            <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: "#eff6ff", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <PersonRoundedIcon sx={{ fontSize: 15 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 500, color: "#2563eb" }}>Paycheck Profile</Typography>
          </Box>
        );
      }
    }

    return <Typography variant="body2" color="text.secondary">—</Typography>;
  }

  const rowMenuCategory = categories.find((c) => c.id === rowMenuCategoryId) ?? null;

  return (
    <Stack spacing={2.25}>
      {/* Header */}
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
            Categories
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={handleOpenAddForm}
          sx={{ height: 40, borderRadius: 2, textTransform: "none", fontWeight: 700, whiteSpace: "nowrap", alignSelf: { xs: "stretch", sm: "auto" } }}
        >
          Add Category
        </Button>
      </Stack>

      {error && (
        <Snackbar open={error !== null} autoHideDuration={5000} onClose={() => setError(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
          <Alert onClose={() => setError(null)} severity="error" variant="filled" sx={{ borderRadius: 2, boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)", fontWeight: 600 }}>
            {error}
          </Alert>
        </Snackbar>
      )}

      {/* Summary cards */}
      <Grid container spacing={1.5}>
        {(
          [
            { key: "income" as const, title: "Income Categories", ...summary.income, ...categoryStyles.income },
            { key: "expense" as const, title: "Expense Categories", ...summary.expense, ...categoryStyles.expense },
            { key: "transfer" as const, title: "Transfer Categories", ...summary.transfer, ...categoryStyles.transfer },
          ]
        ).map((card) => {
          const Icon = card.icon;
          return (
            <Grid key={card.key} size={{ xs: 12, sm: 4 }}>
              <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
                <CardContent sx={{ p: 2.25 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{card.title}</Typography>
                      <Typography variant="h5" sx={{ color: card.color, fontWeight: 800, mt: 0.25, letterSpacing: "-0.03em" }}>
                        {card.count}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Total estimated monthly
                        <br />
                        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{formatCurrency(card.total)}</Box>
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", bgcolor: card.background, color: card.color, borderRadius: 2, width: 40, height: 40, flexShrink: 0 }}>
                      <Icon sx={{ fontSize: 22 }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Categories table */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }} elevation={0}>
        <Box sx={{ p: 2.25, display: "flex", flexWrap: "wrap", gap: 1.5, justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid", borderColor: "divider" }}>
          <Tabs
            value={kindFilter}
            onChange={(_, v) => setKindFilter(v)}
            sx={{ minHeight: 36, "& .MuiTabs-flexContainer": { gap: 0.5 }, "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontWeight: 600, fontSize: 14, borderRadius: 2 } }}
          >
            <Tab label="All" value="all" />
            <Tab label="Income" value="income" />
            <Tab label="Expenses" value="expense" />
            <Tab label="Transfers" value="transfer" />
          </Tabs>

          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ width: 220, "& .MuiOutlinedInput-root": { height: 36, borderRadius: 2 } }}
            />
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowArchived((prev) => !prev)}
              startIcon={showArchived ? <RestorePageRoundedIcon /> : <ArchiveRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, height: 36, whiteSpace: "nowrap" }}
            >
              {showArchived ? "View Active" : `Archived (${archivedCategories.length})`}
            </Button>
          </Stack>
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 100px 200px 120px 56px" },
            bgcolor: "#f8fafc",
            p: 1,
            px: 2.25,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Category</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Type</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Linked / Destination</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Est. Monthly</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Actions</Typography>
        </Box>

        <CardContent sx={{ p: 0 }}>
          {isLoading ? (
            <Box sx={{ p: 2.25 }}><Typography color="text.secondary" variant="body2">Loading categories...</Typography></Box>
          ) : displayedCategories.length === 0 ? (
            <Box sx={{ p: 2.25 }}>
              <Typography color="text.secondary" variant="body2">
                {showArchived ? "No archived categories found." : "No categories match here yet."}
              </Typography>
            </Box>
          ) : (
            displayedCategories.map((category, index) => {
              const style = categoryStyles[category.kind];
              const Icon = style.icon;
              return (
                <Box key={category.id}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 100px 200px 120px 56px" },
                      alignItems: "center",
                      gap: 1.5,
                      p: 1,
                      px: 2.25,
                      minHeight: 54,
                      "&:hover": { bgcolor: "#f8fafc" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", bgcolor: style.background, color: style.color, borderRadius: 2, width: 32, height: 32, flexShrink: 0 }}>
                        <Icon sx={{ fontSize: 17 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{category.name}</Typography>
                        {category.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                            {category.description}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <Box>
                      <Chip label={style.label} size="small" sx={{ bgcolor: style.background, color: style.color, fontWeight: 700, fontSize: 12, height: 22, px: 1, "& .MuiChip-label": { px: 1.25 } }} />
                    </Box>
                    <Box>{renderLinkedCell(category)}</Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: { xs: "left", md: "right" } }}>
                        {formatCurrency(category.estimatedMonthly ?? 0)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                      <IconButton aria-label={`Actions for ${category.name}`} size="small" onClick={(e) => handleOpenRowMenu(e, category.id)}>
                        <MoreHorizRoundedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>
                  {index < displayedCategories.length - 1 && <Divider />}
                </Box>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Paycheck Profiles Section */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>Paycheck Profiles</Typography>
            <Typography variant="body2" color="text.secondary">Define how your gross pay is converted to take-home pay.</Typography>
          </Box>
          <Button onClick={handleOpenAddProfile} size="small" startIcon={<AddRoundedIcon />} variant="contained" sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5, whiteSpace: "nowrap" }}>
            Create Profile
          </Button>
        </Box>
        <CardContent sx={{ p: paycheckProfiles.length > 0 ? 0 : 2.25 }}>
          {isLoading ? (
            <Typography color="text.secondary" variant="body2">Loading profiles...</Typography>
          ) : paycheckProfiles.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "#f8fafc", p: 3, borderRadius: 2, gap: 1, color: "text.secondary" }}>
              <PersonRoundedIcon sx={{ fontSize: 32 }} />
              <Typography variant="body2" sx={{ textAlign: "center" }}>
                Create a paycheck profile to automatically calculate your take-home pay, including taxes and deductions.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {paycheckProfiles.map((profile: PaycheckProfile) => {
                const relatedCategory = categories.find((c) => c.id === profile.linkedIncomeCategoryId);
                return (
                  <Box
                    key={profile.id}
                    sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 100px 130px 160px 120px 40px" }, alignItems: "center", gap: 1.5, p: 2.25, "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{profile.name}</Typography>
                    <Typography variant="body2" sx={{ textTransform: "capitalize" }}>{profile.payFrequency}</Typography>
                    <Typography variant="body2">{formatCurrency(profile.grossSalary)} gross</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Linked to <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{relatedCategory?.name ?? "None"}</Box>
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                      <IconButton onClick={() => handleOpenEditProfile(profile.id)} size="small">
                        <EditRoundedIcon sx={{ color: "text.secondary", fontSize: 18 }} />
                      </IconButton>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      <AddCategoryModal
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveCategoryForm}
        isSaving={isSaving}
        editingCategory={selectedEditingCategory}
        accounts={accounts}
        error={formError}
      />

      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        {rowMenuCategory && !rowMenuCategory.isArchived && (
          <MenuItem onClick={() => { handleOpenEditForm(rowMenuCategory); handleCloseRowMenu(); }} sx={{ gap: 1 }}>
            <EditRoundedIcon sx={{ fontSize: 16 }} /> Edit
          </MenuItem>
        )}
        {rowMenuCategory && !rowMenuCategory.isArchived ? (
          <MenuItem onClick={() => { handleArchiveCategory(rowMenuCategory.id); handleCloseRowMenu(); }} sx={{ gap: 1, color: "error.main" }}>
            <ArchiveRoundedIcon sx={{ fontSize: 16 }} /> Archive
          </MenuItem>
        ) : (
          rowMenuCategory && (
            <MenuItem onClick={() => { handleRestoreCategory(rowMenuCategory); handleCloseRowMenu(); }} sx={{ gap: 1, color: "success.main" }}>
              <UnarchiveRoundedIcon sx={{ fontSize: 16 }} /> Restore
            </MenuItem>
          )
        )}
      </Menu>

      <ProfileEditorDialog editingProfileId={editingProfileId} incomeCategories={incomeCategories} onClose={handleCloseProfileDialog} open={profileDialogOpen} />
    </Stack>
  );
}