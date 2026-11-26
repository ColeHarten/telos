"use client";

import { auth } from "@/lib/firebaseClient";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import PieChartOutlineOutlinedIcon from "@mui/icons-material/PieChartOutlineOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SyncStatusChip from "@/components/SyncStatusChip";
import TelosLogo from "@/components/telos-logo";
import { TransactionsProvider, useTransactionsStore } from "@/components/TransactionsProvider";
import useAutoSync from "@/lib/hooks/useAutoSync";
import type { PlaidConnection } from "@/lib/types/types";
import {
  Avatar,
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  ButtonBase,
  CircularProgress,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListSubheader,
  Menu,
  MenuItem,
  Paper,
  Typography,
} from "@mui/material";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BOTTOM_NAV_HEIGHT } from "../theme";

const SIDEBAR_WIDTH = 240;

type NavItem = { label: string; href: string; icon: typeof DashboardOutlinedIcon };

// The pages you use most, in the sidebar and the phone tab bar.
const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardOutlinedIcon },
  { label: "Transactions", href: "/transactions", icon: ReceiptLongOutlinedIcon },
  { label: "Budgets", href: "/budgets", icon: PieChartOutlineOutlinedIcon },
  { label: "Accounts", href: "/accounts", icon: AccountBalanceOutlinedIcon },
];

// Set up once, then visited now and then. On phones they're under More.
const SETUP_NAV: NavItem[] = [
  { label: "Categories", href: "/categories", icon: CategoryOutlinedIcon },
  { label: "Rules", href: "/rules", icon: BoltOutlinedIcon },
  { label: "Settings", href: "/settings", icon: SettingsOutlinedIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  // The full menu on phones and tablets, opened from More.
  const [moreOpen, setMoreOpen] = useState(false);

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
          bgcolor: "background.default",
        }}
      >
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!user) {
    return null;
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  const sidebar = (
    <Sidebar
      user={user}
      pathname={pathname}
      connections={connections}
      onNavigate={() => setMoreOpen(false)}
      onSignOut={() => void handleSignOut()}
    />
  );

  // The provider wraps the menus too, for the Needs review count.
  return (
    <TransactionsProvider uid={user.uid}>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        {/* From md up: a fixed sidebar. */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: SIDEBAR_WIDTH,
              boxSizing: "border-box",
              borderRight: "1px solid",
              borderColor: "divider",
              bgcolor: "background.paper",
            },
          }}
        >
          {sidebar}
        </Drawer>

        {/* Below md: the same menu slides in from More. */}
        <Drawer
          variant="temporary"
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH, boxSizing: "border-box" },
          }}
        >
          {sidebar}
        </Drawer>

        {/* Below md: a slim top bar with the sync chip. */}
        <Box
          component="header"
          sx={{
            display: { xs: "flex", md: "none" },
            position: "sticky",
            top: 0,
            zIndex: (theme) => theme.zIndex.appBar,
            alignItems: "center",
            gap: 1,
            px: 2,
            height: 56,
            bgcolor: "rgba(248, 250, 252, 0.88)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Wordmark compact onNavigate={() => setMoreOpen(false)} />
          <Box sx={{ ml: "auto" }}>
            <SyncStatusChip connections={connections} />
          </Box>
        </Box>

        {/* Every page gets the same padding and width from here. */}
        <Box
          component="main"
          sx={{
            ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
            px: { xs: 2, sm: 3, md: 4 },
            pt: { xs: 2, md: 4 },
            pb: { xs: `calc(${BOTTOM_NAV_HEIGHT + 24}px + env(safe-area-inset-bottom))`, md: 6 },
          }}
        >
          <Box sx={{ maxWidth: 1200, mx: "auto" }}>{children}</Box>
        </Box>

        <PhoneTabBar pathname={pathname} onMore={() => setMoreOpen(true)} />
      </Box>
    </TransactionsProvider>
  );
}

function Wordmark({ compact, onNavigate }: { compact?: boolean; onNavigate: () => void }) {
  return (
    <ButtonBase
      component={Link}
      href="/dashboard"
      onClick={onNavigate}
      aria-label="Telos home"
      sx={{ display: "flex", alignItems: "center", gap: 1, borderRadius: 2, px: 0.5, py: 0.5 }}
    >
      <TelosLogo size={compact ? 22 : 26} />
      <Typography
        component="span"
        sx={{
          fontWeight: 800,
          fontSize: compact ? "1.125rem" : "1.35rem",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color: "text.primary",
        }}
      >
        Telos
      </Typography>
    </ButtonBase>
  );
}

function Sidebar({
  user,
  pathname,
  connections,
  onNavigate,
  onSignOut,
}: {
  user: User;
  pathname: string;
  connections: PlaidConnection[];
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const name = user.displayName ?? user.email ?? "Your account";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", px: 1.5, pt: 2, pb: 1.5 }}>
      <Box sx={{ px: 0.75, mb: 2.5 }}>
        <Wordmark onNavigate={onNavigate} />
      </Box>

      <List disablePadding>
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={onNavigate} />
        ))}
      </List>

      <List
        disablePadding
        sx={{ mt: 2.5 }}
        subheader={
          <ListSubheader
            disableSticky
            sx={{ bgcolor: "transparent", px: 1.25, lineHeight: "28px", fontSize: "0.75rem", fontWeight: 600, color: "text.disabled" }}
          >
            Setup
          </ListSubheader>
        }
      >
        {SETUP_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} onClick={onNavigate} />
        ))}
      </List>

      <Box sx={{ mt: "auto", pt: 2, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ px: 0.75, "&:empty": { display: "none" } }}>
          <SyncStatusChip connections={connections} />
        </Box>

        <ButtonBase
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          aria-label="Account menu"
          aria-haspopup="menu"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            p: 1,
            borderRadius: 2,
            textAlign: "left",
            "&:hover": { bgcolor: "grey.100" },
          }}
        >
          <Avatar src={user.photoURL ?? undefined} alt={name} sx={{ width: 32, height: 32 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: "text.primary" }}>
              {name}
            </Typography>
            {user.displayName && user.email && (
              <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary" }}>
                {user.email}
              </Typography>
            )}
          </Box>
          <ExpandMoreRoundedIcon fontSize="small" sx={{ color: "text.disabled" }} />
        </ButtonBase>

        <Menu
          anchorEl={menuAnchor}
          open={menuAnchor !== null}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{ paper: { sx: { minWidth: 208, mb: 1 } } }}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onNavigate();
              router.push("/settings");
            }}
          >
            <ListItemIcon>
              <SettingsOutlinedIcon fontSize="small" />
            </ListItemIcon>
            Settings
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onSignOut();
            }}
          >
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" />
            </ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>
      </Box>
    </Box>
  );
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <ListItemButton
      component={Link}
      href={item.href}
      onClick={onClick}
      selected={active}
      sx={{
        borderRadius: 2,
        mb: 0.25,
        minHeight: 38,
        px: 1.25,
        gap: 1.25,
        color: "text.secondary",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "&:hover": { bgcolor: "grey.100", color: "text.primary" },
        "&.Mui-selected": { bgcolor: "#eff6ff", color: "primary.main" },
        "&.Mui-selected:hover": { bgcolor: "#dbeafe" },
      }}
    >
      <ListItemIcon sx={{ minWidth: 0, color: "inherit" }}>
        <item.icon fontSize="small" />
      </ListItemIcon>
      <Typography variant="body2" sx={{ flex: 1, fontWeight: active ? 700 : 500 }}>
        {item.label}
      </Typography>
      {item.href === "/transactions" && <NeedsReviewCount />}
    </ListItemButton>
  );
}

/** How many transactions wait in Needs review, beside Transactions in the sidebar. */
function NeedsReviewCount() {
  const { needsReviewCount } = useTransactionsStore();
  if (needsReviewCount === 0) return null;
  return (
    <Box
      component="span"
      aria-label={`${needsReviewCount} transactions need review`}
      sx={{
        minWidth: 22,
        height: 20,
        px: 0.75,
        borderRadius: 999,
        bgcolor: "primary.main",
        color: "common.white",
        fontSize: "0.7rem",
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {needsReviewCount > 999 ? "999+" : needsReviewCount}
    </Box>
  );
}

/** Below md: the main pages along the bottom, plus More for the rest. */
function PhoneTabBar({ pathname, onMore }: { pathname: string; onMore: () => void }) {
  const { needsReviewCount } = useTransactionsStore();
  const current = MAIN_NAV.find((item) => isActive(pathname, item.href))?.href ?? "more";

  return (
    <Paper
      square
      elevation={0}
      sx={{
        display: { xs: "block", md: "none" },
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: "1px solid",
        borderColor: "divider",
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation showLabels value={current} sx={{ height: BOTTOM_NAV_HEIGHT, bgcolor: "transparent" }}>
        {MAIN_NAV.map((item) => (
          <BottomNavigationAction
            key={item.href}
            value={item.href}
            label={item.label}
            component={Link}
            href={item.href}
            icon={
              item.href === "/transactions" && needsReviewCount > 0 ? (
                <Badge color="primary" variant="dot" overlap="circular">
                  <item.icon />
                </Badge>
              ) : (
                <item.icon />
              )
            }
            sx={TAB_SX}
          />
        ))}
        <BottomNavigationAction value="more" label="More" icon={<MoreHorizRoundedIcon />} onClick={onMore} sx={TAB_SX} />
      </BottomNavigation>
    </Paper>
  );
}

const TAB_SX = {
  minWidth: 0,
  px: 0.5,
  color: "text.secondary",
  "& .MuiBottomNavigationAction-label": { fontSize: "0.7rem", fontWeight: 600, mt: 0.25 },
  "& .MuiBottomNavigationAction-label.Mui-selected": { fontSize: "0.7rem" },
  "&.Mui-selected": { color: "primary.main" },
} as const;
