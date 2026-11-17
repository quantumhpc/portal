"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, Settings, AppWindow, HeartPulse } from "lucide-react";

const tabs = [
  { label: "Users", href: "/admin", icon: Users },
  { label: "Applications", href: "/admin/apps", icon: AppWindow },
  { label: "Configuration", href: "/admin/config", icon: Settings },
  { label: "Health", href: "/admin/health", icon: HeartPulse },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Administration</h2>
        <nav className="flex gap-1 mt-3 border-b">
          {tabs.map((tab) => {
            const active = tab.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
