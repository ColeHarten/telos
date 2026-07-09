"use client";

import useAuth from "@/lib/hooks/useAuth";
import useCategories from "@/lib/hooks/useCategories";
import type { Category, CategoryKind } from "@/lib/types/types";
import { formatCurrency } from "@/lib/utils";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
import RestorePageRoundedIcon from "@mui/icons-material/RestorePageRounded";
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
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import AddCategoryModal from "./AddCategoryModal";
import ProfileEditorDialog, { calculateWithholdings } from "./ProfileEditorDialog";

const categoryStyles: Record<
  CategoryKind,
  {
    label: string;
    color: string;
    background: string;
    icon: typeof TrendingUpRoundedIcon;
  }
> = {
  income: {
    label: "Income",
    color: "#059669",
    background: "#ecfdf5",
    icon: TrendingUpRoundedIcon,
  },
  expense: {
    label: "Expense",
    color: "#dc2626",
    background: "#fef2f2",
    icon: TrendingDownRoundedIcon,
  },
  transfer: {
    label: "Transfer",
    color: "#2563eb",
    background: "#eff6ff",
    icon: TrendingUpRoundedIcon,
  },
};

// --- Main Page Component ---
export default function CategoriesPage() {
  const { user, authLoading } = useAuth();
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

  // Filter state for viewing active vs archived records
  const [showArchived, setShowArchived] = useState(false);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const [rowMenuAnchor, setRowMenuAnchor] = useState<HTMLElement | null>(null);
  const [rowMenuCategoryId, setRowMenuCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [user, categories]);

  const activeCategories = useMemo(() => categories.filter((category) => !category.isArchived), [categories]);
  const archivedCategories = useMemo(() => categories.filter((category) => category.isArchived), [categories]);

  const displayedCategories = showArchived ? archivedCategories : activeCategories;

  const incomeCount = activeCategories.filter((c) => c.kind === "income").length;
  const expenseCount = activeCategories.filter((c) => c.kind === "expense").length;
  const incomeCategories = useMemo(() => activeCategories.filter((c) => c.kind === "income"), [activeCategories]);

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
  }) {
    const trimmedName = formData.name.trim();
    const normalizedName = trimmedName.toLowerCase();

    if (!trimmedName) {
      setFormError("Category name is required.");
      return;
    }

    const isDuplicate = categories.some(
      (c) =>
        c.id !== selectedEditingCategory?.id &&
        c.name.trim().toLowerCase() === normalizedName
    );
    if (isDuplicate) {
      setFormError(`A category named "${trimmedName}" already exists.`);
      return;
    }

    try {
      setFormError(null);
      setIsSaving(true);

      if (selectedEditingCategory) {
        await updateCategory(selectedEditingCategory.id, {
          name: trimmedName,
          kind: formData.kind,
          estimatedMonthly: formData.estimatedMonthly,
        });
      } else {
        await addCategory({
          name: trimmedName,
          kind: formData.kind,
          estimatedMonthly: formData.estimatedMonthly,
        });
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
      if (selectedEditingCategory?.id === categoryId) {
        handleCloseDialog();
      }
    } catch (archiveError) {
      console.error(archiveError);
      setError("Could not archive category.");
    }
  }

  // Restore callback unarchives a category and matches existing update infrastructure
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
        <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}>
          Categories
        </Typography>

        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={handleOpenAddForm}
          sx={{
            height: 40,
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 700,
            whiteSpace: "nowrap",
            alignSelf: { xs: "stretch", sm: "auto" },
          }}
        >
          Add Category
        </Button>
      </Stack>

      {error && (
        <Snackbar
          open={error !== null}
          autoHideDuration={5000}
          onClose={() => setError(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        >
          <Alert
            onClose={() => setError(null)}
            severity="error"
            variant="filled"
            sx={{
              borderRadius: 2,
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
              fontWeight: 600,
            }}
          >
            {error}
          </Alert>
        </Snackbar>
      )}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
            <CardContent sx={{ p: 2.25 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Income Categories
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#059669", fontWeight: 800, mt: 0.25, letterSpacing: "-0.03em" }}>
                    {incomeCount}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "#ecfdf5",
                    color: "#059669",
                    borderRadius: 2,
                    width: 40,
                    height: 40,
                  }}
                >
                  <TrendingUpRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
            <CardContent sx={{ p: 2.25 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Expense Categories
                  </Typography>
                  <Typography variant="h5" sx={{ color: "#dc2626", fontWeight: 800, mt: 0.25, letterSpacing: "-0.03em" }}>
                    {expenseCount}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "#fef2f2",
                    color: "#dc2626",
                    borderRadius: 2,
                    width: 40,
                    height: 40,
                  }}
                >
                  <TrendingDownRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Your Categories Datagrid View */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3, overflow: "hidden" }} elevation={0}>
        <Box sx={{ p: 2.25, px: 2.25, borderBottom: "1px solid", borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>Your Categories</Typography>

          {/* Archive View Toggle */}
          <Button
            size="small"
            variant="outlined"
            onClick={() => setShowArchived((prev) => !prev)}
            startIcon={showArchived ? <RestorePageRoundedIcon /> : <ArchiveRoundedIcon />}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 1.5 }}
          >
            {showArchived ? "View Active" : `View Archived (${archivedCategories.length})`}
          </Button>
        </Box>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 120px 140px 140px 72px" },
              bgcolor: "#f8fafc",
              p: 1,
              px: 2.25,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Category</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Type</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>Status</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Estimated monthly</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textAlign: "right" }}>Actions</Typography>
          </Box>

          {isLoading ? (
            <Box sx={{ p: 2.25 }}><Typography color="text.secondary" variant="body2">Loading categories...</Typography></Box>
          ) : displayedCategories.length === 0 ? (
            <Box sx={{ p: 2.25 }}>
              <Typography color="text.secondary" variant="body2">
                {showArchived ? "No archived categories found." : "No categories yet."}
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
                      gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 120px 140px 140px 72px" },
                      alignItems: "center",
                      gap: 1.5,
                      p: 1,
                      px: 2.25,
                      minHeight: 46,
                    }}
                  >
                    <Box sx={{ display: "flex", direction: "row", alignItems: "center", gap: "10px" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: style.background,
                          color: style.color,
                          borderRadius: 2,
                          width: 30,
                          height: 30,
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 17 }} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{category.name}</Typography>
                    </Box>
                    <Box>
                      <Chip
                        label={style.label}
                        size="small"
                        sx={{ bgcolor: style.background, color: style.color, fontWeight: 700, fontSize: 12, height: 22, px: 1, "& .MuiChip-label": { px: 1.25 } }}
                      />
                    </Box>
                    <Box>
                      <Chip
                        label={category.isArchived ? "Archived" : "Active"}
                        size="small"
                        sx={{
                          bgcolor: category.isArchived ? "#f1f5f9" : "#ecfdf5",
                          color: category.isArchived ? "#475569" : "#059669",
                          fontWeight: 700,
                          fontSize: 12,
                          height: 22,
                          px: 1,
                          "& .MuiChip-label": { px: 1.25 }
                        }}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, textAlign: { xs: "left", md: "right" } }}>
                        {formatCurrency(category.estimatedMonthly ?? 0)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                      <IconButton
                        aria-label={`Actions for ${category.name}`}
                        size="small"
                        onClick={(e) => handleOpenRowMenu(e, category.id)}
                      >
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

      {/* Withholding Profiles Section */}
      <Card sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 3 }} elevation={0}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", p: 2.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="body1" sx={{ fontWeight: 700 }}>Your Withholding Profiles (Gross Pay to Net Pay)</Typography>
          <Button onClick={handleOpenAddProfile} size="small" startIcon={<TrendingUpRoundedIcon />} variant="contained" sx={{ textTransform: "none", fontWeight: 600, borderRadius: 1.5 }}>
            Create Profile
          </Button>
        </Box>
        <CardContent sx={{ p: paycheckProfiles.length > 0 ? 0 : 2.25 }}>
          {isLoading ? (
            <Typography color="text.secondary" variant="body2">Loading profiles...</Typography>
          ) : paycheckProfiles.length === 0 ? (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", bgcolor: "#f8fafc", p: 3, borderRadius: 2, gap: 1, color: "text.secondary" }}>
              <PercentRoundedIcon sx={{ fontSize: 32 }} />
              <Typography variant="body2" sx={{ textAlign: "center" }}>
                Define a withholding profile to automatically calculate your true income, including taxes and deductions, to bridge the gap from gross pay to your net deposits.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {paycheckProfiles.map((profile) => {
                const calculated = calculateWithholdings(profile.grossSalary, profile.deductions, profile.payFrequency);
                const relatedCategory = categories.find((c) => c.id === profile.linkedIncomeCategoryId);

                return (
                  <Box key={profile.id} sx={{ p: 2.25 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px auto", alignItems: "center", gap: 2 }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{profile.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
                          {profile.payFrequency} • {profile.deductions?.length || 0} deductions
                        </Typography>
                      </Box>
                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="text.secondary">Linked Category</Typography>
                        <Typography variant="body2" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontWeight: 500 }}>
                          {relatedCategory?.name ?? "None Linked"}
                        </Typography>
                      </Stack>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="caption" color="text.secondary">Gross per Paycheck</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(profile.grossSalary)}</Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Typography variant="caption" color="text.secondary">Est. Monthly Net</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: "#166534" }}>
                          {formatCurrency(calculated.estimatedMonthlyNet)}
                        </Typography>
                      </Box>
                      <IconButton onClick={() => handleOpenEditProfile(profile.id)}>
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

      {/* Add / Edit Category Modal */}
      <AddCategoryModal
        open={dialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSaveCategoryForm}
        isSaving={isSaving}
        editingCategory={selectedEditingCategory}
        error={formError}
      />

      {/* Row context action options menu popup */}
      <Menu anchorEl={rowMenuAnchor} open={Boolean(rowMenuAnchor)} onClose={handleCloseRowMenu}>
        {rowMenuCategory && !rowMenuCategory.isArchived && (
          <MenuItem
            onClick={() => {
              handleOpenEditForm(rowMenuCategory);
              handleCloseRowMenu();
            }}
            sx={{ gap: 1 }}
          >
            <EditRoundedIcon sx={{ fontSize: 16 }} /> Edit
          </MenuItem>
        )}
        {rowMenuCategory && !rowMenuCategory.isArchived ? (
          <MenuItem
            onClick={() => {
              handleArchiveCategory(rowMenuCategory.id);
              handleCloseRowMenu();
            }}
            sx={{ gap: 1, color: "error.main" }}
          >
            <ArchiveRoundedIcon sx={{ fontSize: 16 }} /> Archive
          </MenuItem>
        ) : (
          rowMenuCategory && (
            <MenuItem
              onClick={() => {
                handleRestoreCategory(rowMenuCategory);
                handleCloseRowMenu();
              }}
              sx={{ gap: 1, color: "success.main" }}
            >
              <UnarchiveRoundedIcon sx={{ fontSize: 16 }} /> Restore
            </MenuItem>
          )
        )}
      </Menu>

      {/* Editor Dialogue Modal */}
      <ProfileEditorDialog editingProfileId={editingProfileId} incomeCategories={incomeCategories} onClose={handleCloseProfileDialog} open={profileDialogOpen} />
    </Stack>
  );
}