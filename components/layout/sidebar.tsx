"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogoIcon } from "./logo";
import {
  LayoutDashboard,
  Rocket,
  FolderOpen,
  Boxes,
  Monitor,
  Server,
  Key,
  Shield,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession } from "next-auth/react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Start a job", href: "/compute", icon: Rocket },
  { label: "Data management", href: "/storage/personal", icon: FolderOpen },
  { label: "Jobs", href: "/jobs", icon: Boxes },
  { label: "Interactive", href: "/interactive", icon: Monitor },
  { label: "Cluster", href: "/cluster", icon: Server },
  { label: "License usage", href: "/licensing", icon: Key },
  { label: "Admin", href: "/admin", icon: Shield, adminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Set in the mobile drawer: called on each link click, so the drawer closes. */
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin;

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && (
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-sidebar-foreground">
            <LogoIcon className="h-6 w-6 shrink-0" />
            <span className="truncate">QuantumHPC Portal</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8"
          aria-label={onNavigate ? "Close navigation" : collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-2">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
