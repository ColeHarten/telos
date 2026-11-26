"use client";

import { auth } from "@/lib/firebaseClient";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BoltIcon from "@mui/icons-material/Bolt";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PieChartOutlineOutlinedIcon from "@mui/icons-material/PieChartOutlineOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import SyncStatusChip from "@/components/SyncStatusChip";
import TelosLogo from "@/components/telos-logo";
import { TransactionsProvider, useTransactionsStore } from "@/components/TransactionsProvider";
import useAutoSync from "@/lib/hooks/useAutoSync";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  Toolbar,
  Typography
} from "@mui/material";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const drawerWidth = 240;

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardOutlinedIcon },
  { label: "Accounts", href: "/accounts", icon: AccountBalanceOutlinedIcon },
  { label: "Categories", href: "/categories", icon: SwapHorizOutlinedIcon },
  { label: "Budgets", href: "/budgets", icon: PieChartOutlineOutlinedIcon },
  { label: "Transactions", href: "/transactions", icon: ReceiptLongOutlinedIcon },
  { label: "Rules", href: "/rules", icon: BoltIcon },
  { label: "Settings", href: "/settings", icon: SettingsOutlinedIcon },
];

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsCheckingAuth(false);

      if (!nextUser) {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Keeps bank data fresh while Telos is open (see useAutoSync), and reports each bank's status.
  const connections = useAutoSync(user?.uid ?? null);

  if (isCheckingAuth) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        p: 1.25,
      }}
    >
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25, // Space between logo and text
            padding: 1.25, // Padding around the logo and text
            cursor: "pointer",
          }}
          onClick={() => router.push("/dashboard")}
        >
          <TelosLogo size={30} />

          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              fontSize: "1.9rem",
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "text.primary",
              userSelect: "none",
            }}
          >
            Telos
          </Typography>
        </Box>

        <Divider sx={{ mb: 1 }} />

        <List sx={{ py: 0 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              selected={pathname === item.href}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 40,
                px: 1.5,
                gap: 1,
                justifyContent: "flex-start",
                color: "text.secondary",
                transition: "background-color 0.15s ease, color 0.15s ease",
                "&:hover": {
                  bgcolor: "grey.100",
                },
                "&.Mui-selected": {
                  bgcolor: "#eff6ff",
                  color: "#2563eb",
                },
                "&.Mui-selected:hover": {
                  bgcolor: "#dbeafe",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  color: "inherit",
                }}
              >
                <item.icon fontSize="small" />
              </ListItemIcon>

              <Typography
                variant="body2"
                sx={{
                  fontWeight: pathname === item.href ? 700 : 500,
                }}
              >
                {item.label}
              </Typography>
              {item.href === "/transactions" && <NeedsReviewBadge />}
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box>
        <Divider sx={{ mb: 1.25 }} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Avatar
            src={user.photoURL ?? undefined}
            alt={user.displayName ?? user.email ?? "User"}
            sx={{ width: 32, height: 32 }}
          />

          <Box>
            <Typography
              variant="body2"
              sx={{
                px: 1.75,
                color: "text.secondary",
                wordBreak: "break-word",
              }}
            >
              {user.displayName ?? user.email}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  // The provider wraps the nav too, for the Needs Review count.
  return (
    <TransactionsProvider uid={user.uid}>
      <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            width: drawerWidth,
            flexShrink: 0,
            zIndex: (theme) => theme.zIndex.drawer + 2,
            [`& .MuiDrawer-paper`]: {
              width: drawerWidth,
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              zIndex: (theme) => theme.zIndex.drawer + 2,
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Below md, the same navigation opens from the menu button. */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{
            display: { xs: "block", md: "none" },
            [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box" },
          }}
        >
          {drawerContent}
        </Drawer>

        <Box
          component="main"
          sx={{
            ml: { xs: 0, md: `${drawerWidth}px` },
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            bgcolor: "grey.50",
          }}
        >
          <Toolbar sx={{ display: { xs: "none", md: "flex" }, justifyContent: "flex-end", px: { md: 4 } }}>
            <SyncStatusChip connections={connections} />
          </Toolbar>
          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 1, px: 2, pt: 2 }}>
            <IconButton aria-label="Open menu" edge="start" onClick={() => setMobileOpen(true)}>
              <MenuRoundedIcon />
            </IconButton>
            <Box sx={{ ml: "auto" }}>
              <SyncStatusChip connections={connections} />
            </Box>
          </Box>

          <Container
            maxWidth="lg"
            sx={{
              flexGrow: 1,
              pb: 4,
            }}
          >
            {children}
          </Container>

          <Box
            component="footer"
            sx={{
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
              py: 2,
            }}
          >
            <Container maxWidth="lg">
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "flex-start", sm: "center" },
                  justifyContent: "space-between",
                  gap: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  © 2026 Telos
                </Typography>
              </Box>
            </Container>
          </Box>
        </Box>
      </Box>
    </TransactionsProvider>
  );
}

/** How many transactions wait in Needs Review, beside Transactions in the nav. */
function NeedsReviewBadge() {
  const { needsReviewCount } = useTransactionsStore();
  if (needsReviewCount === 0) return null;
  return (
    <Chip
      size="small"
      label={needsReviewCount > 999 ? "999+" : needsReviewCount}
      aria-label={`${needsReviewCount} transactions need review`}
      sx={{ ml: "auto", height: 20, fontSize: "0.7rem", fontWeight: 700, bgcolor: "#fef2f2", color: "#dc2626", borderRadius: "6px" }}
    />
  );
}