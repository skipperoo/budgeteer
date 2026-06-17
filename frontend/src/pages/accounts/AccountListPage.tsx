import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { generateAccountKey, encryptAccountKeyForRecipient, bytesToBase64 } from "@/lib/crypto";
import { encryptTransactionPayload } from "@/lib/crypto-transaction";
import { getAccountKey, fetchAndDecryptTransactions } from "@/lib/decrypt-transactions";
import { formatDate, CURRENCIES, getCurrencySymbol } from "@/lib/format";
import type { CreateTransactionRequest } from "@/types";

type AccountType = "personal" | "joint" | "savings";

export default function AccountListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts, fetchAccounts, createAccount, deleteAccount } = useAccountStore();
  const user = useAuthStore((s) => s.user);
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const privKeyBase64 = plaintextPrivateKey
    ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
    : null;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [type, setType] = useState<AccountType>("personal");

  // --- Initial balance after account creation ---
  const [initialBalance, setInitialBalance] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // --- Balances state ---
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Auto-open create account dialog when navigated from no-accounts overlay
  useEffect(() => {
    const state = location.state as { openCreate?: boolean } | null;
    if (state?.openCreate) {
      setOpen(true);
      // Clear the state so it doesn't re-trigger on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Fetch and calculate balances whenever accounts change
  const fetchBalances = useCallback(async () => {
    if (accounts.length === 0) return;
    setLoadingBalances(true);
    const newBalances: Record<string, number> = {};

    await Promise.all(
      accounts.map(async (acc) => {
        try {
          const decrypted = await fetchAndDecryptTransactions(
            acc.id,
            privKeyBase64 ?? undefined,
            user?.public_key
          );
          const bal = decrypted.reduce((sum, tx) => sum + tx.payload.amount, 0);
          newBalances[acc.id] = bal;
        } catch {
          newBalances[acc.id] = 0;
        }
      })
    );
    setBalances(newBalances);
    setLoadingBalances(false);
  }, [accounts, privKeyBase64, user]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleCreate = async () => {
    if (!name) return;
    setIsCreating(true);
    try {
      const created = await createAccount(name, currency, type);
      
      // Handle initial balance if provided
      const rawAmount = parseFloat(initialBalance);
      if (created?.id && !isNaN(rawAmount) && rawAmount > 0) {
        const amount = rawAmount;
        const accountKey = await getAccountKey(created.id, privKeyBase64 ?? undefined, user?.public_key);

        const encryptedPayload = await encryptTransactionPayload(
          { amount, category: "Opening Balance", notes: "Initial balance", counterparty: "Opening Balance" },
          accountKey
        );

        await apiFetch(ENDPOINTS.transactions(created.id), {
          method: "POST",
          body: JSON.stringify({ 
            time: "1970-01-01T00:00:00.000Z", 
            encrypted_payload: encryptedPayload 
          } as CreateTransactionRequest),
        });
      }

      setOpen(false);
      setName("");
      setCurrency("EUR");
      setType("personal");
      setInitialBalance("");
      
      // Trigger balance refresh
      fetchBalances();
    } catch (err) {
      console.error("Failed to create account or initial balance:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Accounts</h1>
        <ResponsiveDialog open={open} onOpenChange={setOpen} title="New Account" trigger={<Button>Create Account</Button>}>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Account"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.symbol} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="personal">Personal</option>
                    <option value="joint">Joint</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <label className="text-sm font-medium">Opening Balance (Optional)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                    +
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0.00"
                    className="pl-7 h-9"
                    />
                  </div>
                </div>


              <Button onClick={handleCreate} className="w-full mt-4" disabled={isCreating || !name}>
                {isCreating ? "Creating..." : "Create Account"}
              </Button>
            </div>
        </ResponsiveDialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {accounts.map((account) => (
          <Card
            key={account.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/accounts/${account.id}`)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{account.name || account.currency}</CardTitle>
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                  {account.type}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`text-2xl font-bold ${(balances[account.id] ?? 0) < 0 ? "text-destructive" : ""}`}>
                    {loadingBalances && !balances[account.id] ? (
                      "..."
                    ) : (
                      <>
                        {getCurrencySymbol(account.currency)}
                        {(balances[account.id] ?? 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Created {formatDate(account.created_at)}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this account?")) {
                      deleteAccount(account.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {accounts.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          No accounts yet. Click "Create Account" to get started.
        </p>
      )}
    </div>
  );
}
