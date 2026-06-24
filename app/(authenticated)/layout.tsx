"use client";

import { auth } from "@/lib/firebaseClient";
import {
  Avatar,
  Box,
  CircularProgress,
  Container,
  Divider,
  Drawer,
  List,
  ListItemButton,
  Toolbar,
  Typography
} from "@mui/material";
import { onAuthStateChanged, User } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const drawerWidth = 240;

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Accounts", href: "/accounts" },
  { label: "Cashflows", href: "/cashflows" },
  { label: "Budgets", href: "/budgets" },
  { label: "Transactions", href: "/transactions" },
  { label: "Settings", href: "/settings" },
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

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <Drawer
        variant="permanent"
        sx={{
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
            <Typography
              variant="h6"
              sx={{
                px: 1.75,
                py: 1.25,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Budgeting
            </Typography>

            <Divider sx={{ mb: 1 }} />

            <List sx={{ py: 0 }}>
              {navItems.map((item) => (
                <ListItemButton
                  key={item.href}
                  component={Link}
                  href={item.href}
                  selected={pathname === item.href}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    minHeight: 40,
                    "&.Mui-selected": {
                      bgcolor: "#eff6ff",
                      color: "#2563eb",
                    },
                    "&.Mui-selected:hover": {
                      bgcolor: "#dbeafe",
                    },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: pathname === item.href ? 700 : 500,
                    }}
                  >
                    {item.label}
                  </Typography>
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
      </Drawer>

      <Box
        component="main"
        sx={{
          ml: `${drawerWidth}px`,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          bgcolor: "grey.50",
        }}
      >
        <Toolbar />

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
                © 2026 Budgeting
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Phase 1: Manual budgeting
              </Typography>
            </Box>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}