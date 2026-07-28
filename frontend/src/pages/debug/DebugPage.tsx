/**
 * DebugPage — development-only inspector for Zustand stores.
 * Only available when VITE_BUDGETEER_DEBUG_CONSOLE=1 at build time.
 *
 * Data display rules:
 *  - First-level fields → dedicated key-value table
 *  - Object fields → preview in cell, click opens overlay with formatted object
 *  - Array fields → sub-table below the main table: first-level fields unpacked
 *    into columns, one row per item. Nested objects in list cells use the same
 *    preview/overlay pattern.
 */

import React, { useState, useCallback, useEffect } from "react";
import { X } from "lucide-react";
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
import { bytesToBase64 } from "@/lib/crypto";
import { decryptTransactionPayload, decryptCheckpointBlob } from "@/lib/crypto-transaction";
import { decryptECIESPayload } from "@/lib/crypto-rules";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import type { Transaction } from "@/types";

// ─── Tab definitions ──────────────────────────────────────────────────────

type TabKey =
  | "auth" | "accounts" | "categories" | "transactions"
  | "rules" | "budgets" | "notifications" | "invitations"
  | "filters" | "sync" | "migrations" | "dateRange" | "dataManagement"
  | "checkpoints";

const TABS: { key: TabKey; label: string }[] = [
  { key: "auth", label: "Auth" },
  { key: "accounts", label: "Accounts" },
  { key: "categories", label: "Categories" },
  { key: "transactions", label: "Transactions" },
  { key: "checkpoints", label: "Checkpoints" },
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

// ─── Overlay ──────────────────────────────────────────────────────────────

function ObjectOverlay({
  title,
  data,
  onClose,
}: {
  title: string;
  data: unknown;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg bg-card p-6 elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/30 p-3 rounded-lg max-h-[60vh] overflow-y-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** True if the value is a non-null, non-array object. */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/** Truncate a value to a short preview string. */
function preview(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    if (val.length > 60) return val.slice(0, 57) + "...";
    return val;
  }
  if (Array.isArray(val)) return `[${val.length} items]`;
  if (isPlainObject(val)) return `{${Object.keys(val).length} keys}`;
  return String(val);
}

// ─── Object Table (key-value) ─────────────────────────────────────────────

function ObjectTable({
  data,
  filterKeys,
}: {
  data: Record<string, unknown>;
  /** Keys to exclude from the top-level table (they are rendered as sub-tables). */
  filterKeys?: string[];
}) {
  const [overlay, setOverlay] = useState<{ title: string; data: unknown } | null>(null);

  const entries = Object.entries(data).filter(
    ([k]) =>
      !filterKeys?.includes(k) &&
      !k.toLowerCase().includes("secret") &&
      !k.toLowerCase().includes("password") &&
      !k.toLowerCase().includes("private_key") &&
      !k.toLowerCase().includes("token")
  );

  if (entries.length === 0) return <p className="text-xs text-muted-foreground italic">(no public fields)</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider w-[180px]">Key</th>
              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, val]) => {
              const clickable = isPlainObject(val);
              return (
                <tr
                  key={key}
                  className={`border-b border-border/20 hover:bg-secondary/30 ${clickable ? "cursor-pointer" : ""}`}
                  onClick={clickable ? () => setOverlay({ title: key, data: val }) : undefined}
                >
                  <td className="py-1.5 px-2 font-medium">{key}</td>
                  <td className="py-1.5 px-2 font-mono max-w-[500px]">
                    {clickable ? (
                      <span className="text-primary underline underline-offset-2 decoration-dotted decoration-primary/40 hover:decoration-primary/80 transition-colors">
                        {preview(val)}
                      </span>
                    ) : (
                      <span className="truncate">{preview(val)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {overlay && (
        <ObjectOverlay
          title={overlay.title}
          data={overlay.data}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}

// ─── Array Table (columnar) ───────────────────────────────────────────────

function ArrayTable({ data }: { data: unknown[] }) {
  const [overlay, setOverlay] = useState<{ title: string; data: unknown } | null>(null);

  if (data.length === 0) return <p className="text-xs text-muted-foreground italic">(empty)</p>;

  // Collect all unique keys across all items
  const keys = [
    ...new Set(
      data.flatMap((item) => {
        if (isPlainObject(item)) return Object.keys(item);
        return ["value"];
      })
    ),
  ];

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">#</th>
              {keys.map((k) => (
                <th key={k} className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-secondary/30">
                <td className="py-1.5 px-2 text-muted-foreground">{i}</td>
                {keys.map((k) => {
                  const val = isPlainObject(item) ? item[k] : item;
                  const clickable = isPlainObject(val);
                  return (
                    <td
                      key={k}
                      className={`py-1.5 px-2 font-mono max-w-[250px] ${clickable ? "cursor-pointer" : ""}`}
                      onClick={clickable ? () => setOverlay({ title: `${k}[${i}]`, data: val }) : undefined}
                    >
                      {clickable ? (
                        <span className="text-primary underline underline-offset-2 decoration-dotted decoration-primary/40 hover:decoration-primary/80 transition-colors">
                          {preview(val)}
                        </span>
                      ) : (
                        <span className="truncate">{preview(val)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-1">{data.length} rows</p>
      </div>

      {overlay && (
        <ObjectOverlay
          title={overlay.title}
          data={overlay.data}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}

// ─── SmartTable — auto-selects ObjectTable or ArrayTable ──────────────────

function SmartTable({ data, label }: { data: unknown; label?: string }) {
  if (data === null || data === undefined) {
    return <p className="text-xs text-muted-foreground italic">null</p>;
  }

  if (Array.isArray(data)) {
    return (
      <section>
        {label && <h3 className="text-sm font-medium mb-2 text-muted-foreground">{label}</h3>}
        <ArrayTable data={data} />
      </section>
    );
  }

  if (isPlainObject(data)) {
    return (
      <section>
        {label && <h3 className="text-sm font-medium mb-2 text-muted-foreground">{label}</h3>}
        <ObjectTable data={data} />
      </section>
    );
  }

  // Scalar — just show preview
  return <span className="text-xs font-mono">{preview(data)}</span>;
}

// ─── CompoundTable — renders a top-level object + sub-tables for arrays ───

function CompoundTable({
  data,
  label,
}: {
  data: Record<string, unknown> | null;
  label?: string;
}) {
  if (!data) return <p className="text-xs text-muted-foreground italic">null</p>;

  // Find array fields
  const arrayKeys = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k]) => k);

  return (
    <section>
      {label && <h2 className="text-lg font-semibold mb-3">{label}</h2>}
      <ObjectTable data={data} filterKeys={arrayKeys} />

      {arrayKeys.map((k) => {
        const arr = data[k] as unknown[];
        return (
          <div key={k} className="mt-6">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded">
                ARRAY
              </span>
              {k}
              <span className="text-muted-foreground font-normal">({arr.length})</span>
            </h3>
            <ArrayTable data={arr} />
          </div>
        );
      })}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function DebugPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("auth");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-8">
      <h1 className="text-3xl font-bold mb-2">Debug Console</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Inspect application state. Click dotted-underlined values to inspect objects. Secret fields are hidden.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-border/50 pb-2">
        {TABS.map((tab) => (
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
        {activeTab === "transactions" && <TransactionsTab />}
        {activeTab === "checkpoints" && <CheckpointsTab />}
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

// ─── Tabs ─────────────────────────────────────────────────────────────────

function AuthTab() {
  const state = useAuthStore.getState();
  const safe: Record<string, unknown> = {
    isAuthenticated: !!state.token,
    user: state.user
      ? {
          id: state.user.id,
          email: state.user.email,
          is_verified: state.user.is_verified,
          preferences: state.user.preferences,
        }
      : null,
    hasPrivateKey: !!state.plaintextPrivateKey,
    hydrating: state.hydrating,
  };
  return <CompoundTable data={safe} label="Auth Store" />;
}

function AccountsTab() {
  const state = useAccountStore.getState();
  const safe: Record<string, unknown> = {
    loading: state.loading,
    error: state.error,
    accounts: state.accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      type: a.type,
      encrypted_metadata: a.encrypted_metadata,
      created_at: a.created_at,
    })),
    accountUsers: state.accountUsers,
  };
  return <CompoundTable data={safe} label="Account Store" />;
}

function CategoriesTab() {
  const state = useCategoryStore.getState();
  const safe: Record<string, unknown> = {
    loaded: state.loaded,
    loading: state.loading,
    version: state.version,
    items: state.items.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color ?? null,
      icon: c.icon ?? null,
      is_disabled: c.is_disabled,
    })),
  };
  return <CompoundTable data={safe} label="Category Store" />;
}

function TransactionsTab() {
  const [txs, setTxs] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ title: string; data: unknown } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authStore = useAuthStore.getState();
      const privKey = authStore.plaintextPrivateKey;
      const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
      const userPubKey = authStore.user?.public_key;

      const accStore = useAccountStore.getState();
      if (accStore.accounts.length === 0) await accStore.fetchAccounts();
      const accounts = accStore.accounts;

      const allRows: Record<string, unknown>[] = [];

      for (const acc of accounts) {
        let accountKey: string | null = null;
        try {
          accountKey = await getAccountKey(acc.id, privKeyBase64 ?? undefined, userPubKey);
        } catch { /* skip */ }

        const raw = await apiFetch<Transaction[]>(ENDPOINTS.transactions(acc.id));
        if (!raw) continue;

        for (const tx of raw) {
          let payload: unknown = null;
          let decryptErr: string | null = null;

          try {
            if (tx.encrypted_payload.startsWith("1|")) {
              if (privKeyBase64) {
                payload = await decryptECIESPayload<unknown>(tx.encrypted_payload, privKeyBase64);
              } else {
                decryptErr = "no private key";
              }
            } else if (accountKey) {
              payload = await decryptTransactionPayload(tx.encrypted_payload, accountKey);
            } else {
              decryptErr = "no account key";
            }
          } catch (e) {
            decryptErr = e instanceof Error ? e.message : "decrypt failed";
          }

          allRows.push({
            account_id: acc.id,
            account_name: acc.name,
            id: tx.id,
            time: tx.time,
            decrypted: payload,
            decrypt_error: decryptErr,
            created_at: tx.created_at,
          });
        }
      }

      setTxs(allRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Transactions</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Load all transactions across all accounts and decrypt them.
      </p>

      {!txs && !loading && (
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Load Transactions
        </button>
      )}

      {loading && <p className="text-sm text-muted-foreground italic">Loading and decrypting...</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      {txs && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">{txs.length} transactions loaded</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Payload</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Error</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, i) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-secondary/30">
                    <td className="py-1.5 px-2 font-mono">{tx.account_name as string}</td>
                    <td className="py-1.5 px-2 font-mono">{(tx.id as string).slice(0, 8)}…</td>
                    <td className="py-1.5 px-2 font-mono">{(tx.time as string).slice(0, 10)}</td>
                    <td className="py-1.5 px-2 font-mono">
                      {tx.decrypt_error ? (
                        <span className="text-muted-foreground italic">{tx.decrypt_error as string}</span>
                      ) : tx.decrypted ? (
                        <button
                          type="button"
                          onClick={() => setOverlay({ title: `Payload ${(tx.id as string).slice(0, 8)}`, data: tx.decrypted })}
                          className="text-primary underline underline-offset-2 decoration-dotted decoration-primary/40 hover:decoration-primary/80"
                        >
                          {preview(tx.decrypted)}
                        </button>
                      ) : (
                        <span className="text-muted-foreground italic">no data</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">
                      {tx.decrypt_error ? (tx.decrypt_error as string) : "—"}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-muted-foreground">
                      {(tx.created_at as string)?.slice(0, 10) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="mt-3 px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            Reload
          </button>
        </div>
      )}

      {overlay && (
        <ObjectOverlay
          title={overlay.title}
          data={overlay.data}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}

function RulesTab() {
  const state = useRuleStore.getState();
  const safe: Record<string, unknown> = {
    loading: state.loading,
    rules: state.rules.map((r) => ({
      id: r.id,
      name: r.name,
      is_active: r.is_active,
      frequency: (r as any).frequency,
      next_occurrence: (r as any).next_occurrence,
      created_at: r.created_at,
    })),
  };
  return <CompoundTable data={safe} label="Rule Store" />;
}

function BudgetsTab() {
  const state = useBudgetStore.getState();
  const safe: Record<string, unknown> = {
    loading: state.loading,
    error: state.error,
    budgets: state.budgets.map((b) => ({
      id: b.id,
      name: b.name,
      account_id: b.account_id,
      period: b.period,
      start_date: b.start_date,
      end_date: b.end_date,
    })),
  };
  return <CompoundTable data={safe} label="Budget Store" />;
}

function NotificationsTab() {
  const state = useNotificationStore.getState();
  const safe: Record<string, unknown> = {
    unreadCount: state.unreadCount,
    loading: state.loading,
    notifications: state.notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      is_read: n.is_read,
      created_at: n.created_at,
    })),
  };
  return <CompoundTable data={safe} label="Notification Store" />;
}

function InvitationsTab() {
  const state = useInvitationStore.getState();
  const safe: Record<string, unknown> = {
    loading: state.loading,
    invitations: (state.invitations ?? []).map((inv: any) => ({
      id: inv.id,
      entity_type: inv.entity_type,
      status: inv.status,
      invited_email: inv.invited_email,
      created_at: inv.created_at,
      expires_at: inv.expires_at,
    })),
  };
  return <CompoundTable data={safe} label="Invitation Store" />;
}

function FiltersTab() {
  const state = useFilterStore.getState();
  const safe: Record<string, unknown> = {
    selectedTypes: state.selectedTypes,
    selectedCategories: state.selectedCategories,
  };
  return <CompoundTable data={safe} label="Filter Store" />;
}

function SyncTab() {
  const state = useSyncStore.getState();
  const safe: Record<string, unknown> = {
    loading: state.loading,
    error: state.error,
    items: state.items.map((s) => ({
      id: s.id,
      action: s.action,
      entity_type: s.entity_type,
      created_at: s.created_at,
      consumed_at: s.consumed_at ?? null,
    })),
  };
  return <CompoundTable data={safe} label="Sync Store" />;
}

function MigrationsTab() {
  const state = useMigrationStore.getState();
  const safe: Record<string, unknown> = {
    status: state.status,
    currentMigration: state.currentMigration,
    progress: state.progress,
    error: state.error,
  };
  return <CompoundTable data={safe} label="Migration Store" />;
}

function DateRangeTab() {
  const state = useDateRangeStore.getState();
  return <CompoundTable data={state.range as unknown as Record<string, unknown>} label="Date Range Store" />;
}

function DataManagementTab() {
  const state = useDataManagementStore.getState();
  const safe: Record<string, unknown> = {
    downloading: state.downloading,
    restoring: state.restoring,
    deleting: state.deleting,
    error: state.error,
    success: state.success,
  };
  return <CompoundTable data={safe} label="Data Management Store" />;
}

function CheckpointsTab() {
  const [checkpoints, setCheckpoints] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ title: string; data: unknown } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const authStore = useAuthStore.getState();
      const privKey = authStore.plaintextPrivateKey;
      const privKeyBase64 = privKey ? bytesToBase64(new Uint8Array(privKey)) : null;
      const userPubKey = authStore.user?.public_key;

      const accStore = useAccountStore.getState();
      if (accStore.accounts.length === 0) await accStore.fetchAccounts();
      const accounts = accStore.accounts;

      const allRows: Record<string, unknown>[] = [];

      for (const acc of accounts) {
        try {
          let accountKey: string | null = null;
          try {
            accountKey = await getAccountKey(acc.id, privKeyBase64 ?? undefined, userPubKey);
          } catch { /* skip decrypt */ }

          const resp = await apiFetch<{ checkpoints: Array<Record<string, unknown>> }>(
            ENDPOINTS.checkpoints(acc.id),
          );
          if (!resp?.checkpoints) continue;
          for (const cp of resp.checkpoints) {
            // Decrypt the encrypted balance.
            let decrypted: unknown = null;
            let decryptErr: string | null = null;
            if (accountKey && cp.encrypted_balance) {
              try {
                decrypted = await decryptCheckpointBlob(
                  cp.encrypted_balance as string,
                  accountKey,
                );
              } catch (e) {
                decryptErr = e instanceof Error ? e.message : "decrypt failed";
              }
            } else {
              decryptErr = accountKey ? "missing encrypted_balance" : "no account key";
            }

            allRows.push({
              account_id: acc.id,
              account_name: acc.name,
              checkpoint_month: cp.checkpoint_month,
              balance: decrypted ? (decrypted as Record<string, unknown>).balance : decryptErr,
              tx_count: decrypted ? (decrypted as Record<string, unknown>).tx_count : null,
              encrypted_balance: cp.encrypted_balance,
              updated_at: cp.updated_at,
              created_at: cp.created_at,
            });
          }
        } catch {
          // skip accounts we can't access
        }
      }

      setCheckpoints(allRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Checkpoints</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Monthly balance checkpoints (decrypted). <strong>balance</strong> is the
        running cumulative balance &mdash; <strong>tx_count</strong> is the
        cumulative transaction count through that month. Click a cell to inspect.
      </p>

      {!checkpoints && !loading && (
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Load Checkpoints
        </button>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading checkpoints…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {overlay && (
        <ObjectOverlay
          title={overlay.title}
          data={overlay.data}
          onClose={() => setOverlay(null)}
        />
      )}

      {checkpoints && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            {checkpoints.length} checkpoint(s) loaded
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {checkpoints.length > 0 &&
                    Object.keys(checkpoints[0]).map((col) => (
                      <th key={col} className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {checkpoints.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                    {Object.entries(row).map(([col, val]) => (
                      <td
                        key={col}
                        className="px-2 py-1 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer hover:text-primary transition-colors"
                        onClick={() =>
                          setOverlay({ title: `${row.account_name ?? ""} — ${col}`, data: val })
                        }
                      >
                        {preview(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
