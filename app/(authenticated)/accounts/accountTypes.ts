import type { AccountType } from "@/lib/types/types";
import AccountBalanceRoundedIcon from "@mui/icons-material/AccountBalanceRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AddBusinessRoundedIcon from "@mui/icons-material/AddBusinessRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import CurrencyBitcoinRoundedIcon from "@mui/icons-material/CurrencyBitcoinRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";

export const accountTypeStyles: Record<
  AccountType,
  {
    label: string;
    color: string;
    background: string;
    icon: typeof AccountBalanceRoundedIcon;
  }
> = {
  cash: {
    label: "Cash",
    color: "#059669",
    background: "#ecfdf5",
    icon: AccountBalanceRoundedIcon,
  },
  credit_card: {
    label: "Credit Card",
    color: "#dc2626",
    background: "#fef2f2",
    icon: CreditCardRoundedIcon,
  },
  investment: {
    label: "Investment",
    color: "#2563eb",
    background: "#eff6ff",
    icon: ShowChartRoundedIcon,
  },
  retirement: {
    label: "Retirement",
    color: "#7c3aed",
    background: "#f5f3ff",
    icon: SavingsRoundedIcon,
  },
  loan: {
    label: "Loan",
    color: "#ea580c",
    background: "#fff7ed",
    icon: SchoolRoundedIcon,
  },
  property: {
    label: "Property",
    color: "#0891b2",
    background: "#ecfeff",
    icon: HomeRoundedIcon,
  },
  crypto: {
    label: "Crypto",
    color: "#ca8a04",
    background: "#fefce8",
    icon: CurrencyBitcoinRoundedIcon,
  },
  other_asset: {
    label: "Other Asset",
    color: "#475569",
    background: "#f8fafc",
    icon: AddBusinessRoundedIcon,
  },
  other_liability: {
    label: "Other Liability",
    color: "#be123c",
    background: "#fff1f2",
    icon: AccountBalanceWalletRoundedIcon,
  },
};