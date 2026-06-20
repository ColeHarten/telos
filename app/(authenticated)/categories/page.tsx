"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

const initialCategories = [
  { name: "Salary / Paycheck", bucketType: "income" },
  { name: "Rent", bucketType: "expense" },
  { name: "Groceries", bucketType: "expense" },
  { name: "Restaurants", bucketType: "expense" },
  { name: "Retirement Savings", bucketType: "savings" },
  { name: "Student Loan Payment", bucketType: "debt" },
];

export default function CategoriesPage() {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newBucketType, setNewBucketType] = useState("expense");

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">
          Categories
        </Typography>
        <Typography color="text.secondary">
          Manage the categories used in your monthly budgets.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h6">
            Add Category
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Category name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Bucket type</InputLabel>
                <Select
                  label="Bucket type"
                  value={newBucketType}
                  onChange={(event) => setNewBucketType(event.target.value)}
                >
                  <MenuItem value="income">Income</MenuItem>
                  <MenuItem value="expense">Expense</MenuItem>
                  <MenuItem value="savings">Savings</MenuItem>
                  <MenuItem value="debt">Debt</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Button fullWidth variant="contained" sx={{ height: "100%" }}>
                Add
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6">
            Existing Categories
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={1.5}>
            {initialCategories.map((category) => (
              <Stack
                key={category.name}
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                }}
              >
                <Typography>{category.name}</Typography>

                <Stack direction="row" spacing={1}>
                  <Chip label={category.bucketType} size="small" />
                  <Button size="small" variant="outlined">
                    Edit
                  </Button>
                  <Button size="small" color="error">
                    Archive
                  </Button>
                </Stack>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}