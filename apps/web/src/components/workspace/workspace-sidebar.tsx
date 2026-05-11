"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, ListTree, RotateCw, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarTab {
  key: "budget" | "accounts" | "transactions" | "recurring" | string;
  href: string;
  label: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  budget: LayoutDashboard,
  accounts: Wallet,
  transactions: ListTree,
  recurring: RotateCw,
};

interface WorkspaceSidebarProps {
  workspaceName: string;
  defaultCurrency: string;
  tabs: SidebarTab[];
}

export function WorkspaceSidebar({
  workspaceName,
  defaultCurrency,
  tabs,
}: WorkspaceSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 sm:block">
      <div className="sticky top-20 space-y-1">
        <div className="mb-4 flex items-center gap-2 rounded-md border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-3 py-2">
          <Briefcase className="h-4 w-4 text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--on-dark)]">
              {workspaceName}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] num">
              {defaultCurrency}
            </p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {tabs.map((tab) => {
            const Icon = ICONS[tab.key] ?? LayoutDashboard;
            const active = pathname?.startsWith(tab.href) ?? false;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-[var(--primary)] font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-muted/50 hover:text-[var(--on-dark)]",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
