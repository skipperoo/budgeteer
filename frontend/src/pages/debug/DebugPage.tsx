/**
 * DebugPage — development-only inspector for Zustand stores.
 * Only available when VITE_BUDGETEER_DEBUG_CONSOLE=1 at build time.
 *
 * Shows a tabbed interface with tables of all non-secret application state.
 */

import React, { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAccountStore } from "@/stores/account-store";
import { useCategoryStore } from "@/stores/category-store";
import { useRuleStore } from "@/stores/rule-store";
import { useBudgetStore } from "@/stores/budget-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useFilterStore } from "@/stores/filter-store";
import { useDataManagementStore } from "@/stores/data-management-store";
import { useSyncStore } from "@/stores/sync-store";
import { useMigrationStore } from "@/stores/migration-store";
import { useInvitationStore } from "@/stores/invitation-store";
import { useDateRangeStore } from "@/stores/date-range-store";

type TabKey =
  | "auth"
  | "accounts"
  | "categories"
  | "rules"
  | "budgets"
  | "notifications"
  | "invitations"
  | "filters"
  | "sync"
  | "migrations"
  | "dateRange"
  | "dataManagement";

interface Tab {
  key: TabKey;
  label: string;
  count?: number;
}

export default function DebugPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("auth");

  const tabs: Tab[] = [
    { key: "auth", label: "Auth" },
    { key: "accounts", label: "Accounts" },
    { key: "categories", label: "Categories" },
    { key: "rules", label: "Rules" },
    { key: "budgets", label: "Budgets" },
    { key: "notifications", label: "Notifications" },
    { key: "invitations", label: "Invitations" },
    { key: "filters", label: "Filters" },
    { key: "sync", label: "Sync" },
    { key: "migrations", label: "Migrations" },
    { key: "dateRange", label: "Date Range" },
    { key: "dataManagement", label: "Data Mgmt" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8">
      <h1 className="text-3xl font-bold mb-2">Debug Console</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Inspect application state. Secret fields (private keys, tokens) are hidden.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-border/50 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === tab.key
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === "auth" && <AuthTab />}
        {activeTab === "accounts" && <AccountsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "rules" && <RulesTab />}
        {activeTab === "budgets" && <BudgetsTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "filters" && <FiltersTab />}
        {activeTab === "sync" && <SyncTab />}
        {activeTab === "migrations" && <MigrationsTab />}
        {activeTab === "dateRange" && <DateRangeTab />}
        {activeTab === "dataManagement" && <DataManagementTab />}
      </div>
    </div>
  );
}

// ─── Table helper ─────────────────────────────────────────────────────────

function JsonTable({ data }: { data: Record<string, unknown> | unknown[] | null }) {
  if (!data) return <p className="text-xs text-muted-foreground italic">null</p>;
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="text-xs text-muted-foreground italic">(empty)</p>;
    const keys = [...new Set(data.flatMap((item) => Object.keys(item as object)))];
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              {keys.map((k) => (
                <th key={k} className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-secondary/30">
                {keys.map((k) => (
                  <td key={k} className="py-1.5 px-2 font-mono truncate max-w-[200px]">
                    {renderCell((row as Record<string, unknown>)[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-1">{data.length} rows</p>
      </div>
    );
  }
  // Single object
  const entries = Object.entries(data).filter(([k]) => !k.toLowerCase().includes("secret") && !k.toLowerCase().includes("password") && !k.toLowerCase().includes("private_key") && !k.toLowerCase().includes("token"));
  if (entries.length === 0) return <p className="text-xs text-muted-foreground italic">(no public fields)</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Key</th>
            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Value</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, val]) => (
            <tr key={key} className="border-b border-border/20 hover:bg-secondary/30">
              <td className="py-1.5 px-2 font-medium">{key}</td>
              <td className="py-1.5 px-2 font-mono truncate max-w-[400px]">{renderCell(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(val: unknown): React.ReactNode {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 1).slice(0, 200);
    } catch { return String(val); }
  }
  return String(val);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

function AuthTab() {
  const state = useAuthStore.getState();
  const safe = {
    isAuthenticated: !!state.token,
    user: state.user ? { id: state.user.id, email: state.user.email, is_verified: state.user.is_verified, preferences: state.user.preferences } : null,
    hasPrivateKey: !!state.plaintextPrivateKey,
    hydrating: state.hydrating,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Auth Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function AccountsTab() {
  const state = useAccountStore.getState();
  const safe = {
    accounts: state.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, created_at: a.created_at })),
    accountUsers: state.accountUsers,
    loading: state.loading,
    error: state.error,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Account Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function CategoriesTab() {
  const state = useCategoryStore.getState();
  const safe = {
    loaded: state.loaded,
    loading: state.loading,
    version: state.version,
    items: state.items.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color ?? null, icon: c.icon ?? null, is_disabled: c.is_disabled })),
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Category Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function RulesTab() {
  const state = useRuleStore.getState();
  const safe = {
    rules: state.rules.map((r) => ({
      id: r.id,
      name: r.name,
      is_active: r.is_active,
      frequency: (r as any).frequency,
      next_occurrence: (r as any).next_occurrence,
      created_at: r.created_at,
    })),
    loading: state.loading,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Rule Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function BudgetsTab() {
  const state = useBudgetStore.getState();
  const safe = {
    budgets: state.budgets.map((b) => ({ id: b.id, name: b.name, account_id: b.account_id, period: b.period, start_date: b.start_date, end_date: b.end_date })),
    loading: state.loading,
    error: state.error,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Budget Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function NotificationsTab() {
  const state = useNotificationStore.getState();
  const safe = {
    notifications: state.notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, is_read: n.is_read, created_at: n.created_at })),
    unreadCount: state.unreadCount,
    loading: state.loading,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Notification Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function InvitationsTab() {
  const state = useInvitationStore.getState();
  const safe = {
    invitations: state.invitations?.map((inv: any) => ({ id: inv.id, entity_type: inv.entity_type, status: inv.status, invited_email: inv.invited_email, created_at: inv.created_at, expires_at: inv.expires_at })) ?? [],
    loading: state.loading,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Invitation Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function FiltersTab() {
  const state = useFilterStore.getState();
  const safe = {
    selectedTypes: state.selectedTypes,
    selectedCategories: state.selectedCategories,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Filter Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function SyncTab() {
  const state = useSyncStore.getState();
  const safe = {
    items: state.items.map((s) => ({ id: s.id, action: s.action, entity_type: s.entity_type, created_at: s.created_at, consumed_at: s.consumed_at ?? null })),
    loading: state.loading,
    error: state.error,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Sync Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function MigrationsTab() {
  const state = useMigrationStore.getState();
  const safe = {
    status: state.status,
    currentMigration: state.currentMigration,
    progress: state.progress,
    error: state.error,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Migration Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}

function DateRangeTab() {
  const state = useDateRangeStore.getState();
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Date Range Store</h2>
      <JsonTable data={state.range as unknown as Record<string, unknown>} />
    </div>
  );
}

function DataManagementTab() {
  const state = useDataManagementStore.getState();
  const safe = {
    downloading: state.downloading,
    restoring: state.restoring,
    deleting: state.deleting,
    error: state.error,
    success: state.success,
  };
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Data Management Store</h2>
      <JsonTable data={safe as unknown as Record<string, unknown>} />
    </div>
  );
}
