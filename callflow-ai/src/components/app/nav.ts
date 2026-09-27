import {
  BarChart3, BookOpen, Bot, Calendar, CreditCard, FileText, Inbox, LayoutDashboard, Phone, Plug, Settings, Star, Users, UserSquare2, Workflow,
} from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/leads", label: "Leads", icon: UserSquare2 },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/reviews", label: "Reviews", icon: Star },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/ai-receptionist", label: "AI Receptionist", icon: Bot },
  { href: "/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
