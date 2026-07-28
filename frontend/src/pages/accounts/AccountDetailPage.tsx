import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCategoryStore, type CategoryType } from "@/stores/category-store";
import { useDateRangeStore } from "@/stores/date-range-store";
import { BalanceChart } from "@/components/shared/BalanceChart";
import { BudgetProgressSection } from "@/components/shared/BudgetProgressSection";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { bytesToBase64 } from "@/lib/crypto";
import { encryptForRecipient, decryptECIESPayload } from "@/lib/crypto-rules";
import { encryptTransactionPayload, decryptTransactionPayload, effectiveAmount, isTransferPayload, transactionMonthEnd, previousMonthEnd, currentMonthEnd } from "@/lib/crypto-transaction";
import { useFilterStore } from "@/stores/filter-store";
import type { TransactionPayload } from "@/lib/crypto-transaction";
import { encryptFile } from "@/lib/crypto-file";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { decryptAccountMetadata, encryptAccountMetadata } from "@/lib/account-metadata";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { applyCheckpointUpdateAfterTxChange, verifyCheckpoints, recomputeFrom } from "@/lib/checkpoint-recompute";
import { useRuleStore } from "@/stores/rule-store";
import { TransactionCard, type TransactionDisplay } from "@/components/transactions/TransactionCard";
import { TransactionDetailOverlay } from "@/components/transactions/TransactionDetailOverlay";
import { TransactionForm, type TransactionFormData } from "@/components/transactions/TransactionForm";
import { CURRENCIES, getCurrencySymbol, formatCurrency, formatNumber, formatDate, parseLocaleNumber } from "@/lib/format";
import type { Transaction, CreateTransactionRequest, DocumentMetadata } from "@/types";
import { CategoryPieChart } from "@/components/shared/CategoryPieChart";

const ACCOUNT_TYPES = ["personal", "joint", "savings"] as const;

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accounts, accountUsers, fetchAccounts, fetchAccountUsers, updateAccount, inviteUser, removeUser } = useAccountStore();
  const account = accounts.find((a) => a.id === id);
  const currentUser = useAuthStore((s) => s.user);

  // --- Invite state ---
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  // --- Edit account state ---
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCurrency, setEditCurrency] = useState("");
  const [editType, setEditType] = useState("");
  const [editOpeningBalance, setEditOpeningBalance] = useState("");
  const [editError, setEditError] = useState("");
  const [editing, setEditing] = useState(false);

  // --- Decryption ---
  const plaintextPrivateKey = useAuthStore((s) => s.plaintextPrivateKey);
  const privKeyBase64 = plaintextPrivateKey
    ? bytesToBase64(new Uint8Array(plaintextPrivateKey))
    : null;
  const [accountKeyBase64, setAccountKeyBase64] = useState<string | null>(null);
  // Opening balance read from accounts.encrypted_metadata (post-migration model).
  // Falls back to summing legacy "Opening Balance" transactions for unmigrated accounts.
  const [metadataOpeningBalance, setMetadataOpeningBalance] = useState<number | null>(null);

  // --- Transaction state ---
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState("");

  // --- Create transaction state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txAmount, setTxAmount] = useState("");
  const [txCommission, setTxCommission] = useState(() => {
    const fromPrefs = currentUser?.preferences?.default_commission;
    if (fromPrefs != null && fromPrefs > 0) return String(fromPrefs);
    try { return localStorage.getItem("budgeteer_default_commission") ?? ""; } catch { return ""; }
  });
  const [txCategory, setTxCategory] = useState("");
  const [txNotes, setTxNotes] = useState("");
  const [txCounterparty, setTxCounterparty] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txCreating, setTxCreating] = useState(false);
  const [txCreateError, setTxCreateError] = useState("");

  // --- Edit transaction state (using shared TransactionForm) ---
  const [editTxOpen, setEditTxOpen] = useState(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);
  const [editTxInitialValues, setEditTxInitialValues] = useState<Partial<TransactionFormData> | undefined>(undefined);
  const [editTxExistingDocs, setEditTxExistingDocs] = useState<DocumentMetadata[]>([]);
  const [editTxSaving, setEditTxSaving] = useState(false);
  const [editTxError, setEditTxError] = useState("");

  // --- Detail overlay state ---
  const [detailTx, setDetailTx] = useState<TransactionDisplay | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // --- Show All transactions overlay state ---
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [showAllTxs, setShowAllTxs] = useState<TransactionDisplay[]>([]);
  const [showAllLoading, setShowAllLoading] = useState(false);
  const [showAllRawOffset, setShowAllRawOffset] = useState(0); // raw unfiltered count for pagination offset
  const [hasMoreTxs, setHasMoreTxs] = useState(true);

  // --- Card transaction limit for "Show more" pagination ---
  const [cardTxLimit, setCardTxLimit] = useState(10);

  // --- Opening balance edit state ---
  const [openingBalanceEditOpen, setOpeningBalanceEditOpen] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");
  const [openingBalanceSaving, setOpeningBalanceSaving] = useState(false);
  const [openingBalanceError, setOpeningBalanceError] = useState("");

  // --- File upload state (create) ---
  const [txFile, setTxFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // --- File upload state (edit — TransactionForm handles its own state) ---

  // --- File input error state (debug: show file input errors) ---
  const [fileInputError, setFileInputError] = useState("");

  // Category combobox state
  const { getCategories, addCategory, version: _catVersion } = useCategoryStore();
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    if (id) {
      fetchAccountUsers(id);
      // Fetch the account key first, then transactions (so we can decrypt)
      fetchAccountKey().then((key) => {
        fetchTransactions(key ?? undefined);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fetchAccountUsers]);

  // Fetch and decrypt the account key for this account.
  // Delegates to the shared getAccountKey which handles caching in
  // sessionStorage for page-refresh resilience.
  const fetchAccountKey = async (): Promise<string | null> => {
    if (!id) return null;
    try {
      const key = await getAccountKey(id, privKeyBase64 ?? undefined, currentUser?.public_key);
      setAccountKeyBase64(key);
      // Decrypt account metadata (opening balance) and load + verify checkpoints.
      // Use a local variable for the OB so recomputeFrom gets the correct value
      // (React state is async and wouldn't be updated yet here).
      let localOpeningBalance = 0;
      if (account?.encrypted_metadata) {
        const meta = await decryptAccountMetadata(account.encrypted_metadata, key);
        localOpeningBalance = meta ? meta.opening_balance : 0;
        setMetadataOpeningBalance(localOpeningBalance);
      } else {
        setMetadataOpeningBalance(null);
      }
      try {
        await useCheckpointStore.getState().loadCheckpoints(id);
        // Lazily verify; if a rule fired into a closed month, recompute (blocking).
        const res = await verifyCheckpoints(id);
        const firstBad = res?.stale[0] ?? res?.missing[0];
        if (firstBad) {
          await recomputeFrom(id, firstBad, { seedOpeningBalance: localOpeningBalance });
          await useCheckpointStore.getState().loadCheckpoints(id);
        }
      } catch { /* checkpoints optional */ }
      return key;
    } catch {
      return null; /* no key available */
    }
  };

  // Re-fetch accounts if we don't have this one yet
  useEffect(() => {
    if (id && !account && accounts.length === 0) {
      fetchAccounts();
    }
  }, [id, account, accounts.length, fetchAccounts]);

  const TRANSACTION_PAGE_SIZE = 200;

  const fetchTransactions = async (key?: string) => {
    if (!id) return;
    const keyToUse = key ?? accountKeyBase64;
    setTxLoading(true);
    setTxError("");
    try {
      // When checkpoints are loaded, download only the active window (§5.2)
      // + the start-month before windowStart for the partial-month sum.
      // Otherwise paginate through ALL transactions (pre-migration fallback;
      // needed for the classic opening‑balance sum).
      const cpEntries = useCheckpointStore.getState().getEntries(id);
      const hasCheckpoints = cpEntries.length > 0;
      const rangeStart = dateRange.start;
      const allRaw: Transaction[] = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let url = `${ENDPOINTS.transactions(id)}?limit=${TRANSACTION_PAGE_SIZE}&offset=${offset}`;
        if (hasCheckpoints) {
          // Fetch from the 1st of the start-month so the §4.5 partial-month
          // sum (transactions before windowStart within the start month) works.
          const fromDate = rangeStart.slice(0, 8) + "01";
          url += `&from=${encodeURIComponent(new Date(fromDate + "T00:00:00.000Z").toISOString())}`;
          url += `&to=${encodeURIComponent(new Date(dateRange.end + "T23:59:59.999Z").toISOString())}`;
        }
        const page = await apiFetch<Transaction[]>(url);
        if (!page || page.length === 0) break;
        allRaw.push(...page);
        if (page.length < TRANSACTION_PAGE_SIZE) break;
        offset += TRANSACTION_PAGE_SIZE;
      }

      const decrypted: TransactionDisplay[] = await Promise.all(
        allRaw.map(async (tx) => {
          // Rule-generated transactions use ECIES (encrypted with user's X25519 public key)
          // and have the "1|" prefix. User-created transactions use AES-GCM with the account key
          // and have no prefix.
          if (tx.encrypted_payload.startsWith("1|")) {
            if (privKeyBase64) {
              try {
                const payload = await decryptECIESPayload<TransactionPayload>(
                  tx.encrypted_payload,
                  privKeyBase64,
                );
                return { id: tx.id, time: tx.time, account_id: tx.account_id, payload };
              } catch { /* fall through: show "could not decrypt" */ }
            }
            return {
              id: tx.id,
              time: tx.time,
              account_id: tx.account_id,
              payload: null,
              decryptError: privKeyBase64 ? "Decryption failed" : "Key unavailable",
            };
          }
          // Account-key-encrypted transaction (user-created)
          if (keyToUse) {
            try {
              const payload = await decryptTransactionPayload(
                tx.encrypted_payload,
                keyToUse,
              );
              return { id: tx.id, time: tx.time, account_id: tx.account_id, payload };
            } catch { /* fall through: show "could not decrypt" */ }
          }
          return {
            id: tx.id,
            time: tx.time,
            account_id: tx.account_id,
            payload: null,
            decryptError: keyToUse ? "Decryption failed" : "Key unavailable",
          };
        })
      );

      setTransactions(decrypted);
    } catch (err: any) {
      setTxError(err.message);
    } finally {
      setTxLoading(false);
    }
  };

  // Re-decrypt when account key changes (e.g., after invite generates a new key)
  useEffect(() => {
    if (accountKeyBase64 && transactions.length > 0) {
      fetchTransactions(accountKeyBase64);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKeyBase64]);

  // --- Edit account ---
  const openEdit = () => {
    if (!account) return;
    setEditName(account.name);
    setEditCurrency(account.currency);
    setEditType(account.type);
    setEditOpeningBalance(formatNumber(Math.abs(openingBalance)));
    setEditError("");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!id) return;
    setEditError("");
    setEditing(true);
    try {
      // Opening balance is now account metadata (not a transaction). If the
      // value changed, write encrypted_metadata and recompute checkpoints by
      // adding the delta to every checkpoint's balance (propagated forward).
      const rawOB = parseLocaleNumber(editOpeningBalance);
      const desiredOB = !isNaN(rawOB) && rawOB >= 0 ? rawOB : null;
      const currentOB = openingBalance;
      const metaChanged = desiredOB !== null && Math.abs(desiredOB - currentOB) >= 0.001;

      if (metaChanged && accountKeyBase64) {
        const metaBlob = { opening_balance: desiredOB! };
        const encMeta = await encryptAccountMetadata(metaBlob, accountKeyBase64);
        await updateAccount(id, editName, editCurrency, editType, encMeta);
        setMetadataOpeningBalance(desiredOB!);

        // Recompute checkpoints from the first checkpoint month through current
        // (the opening-balance base shifts; recomputeFrom re-sums from history
        // or the prior verified checkpoint). The delta approach across
        // existing checkpoints would also work, but a full recomputeFrom is
        // simpler and obviously correct here since the base value changed.
        try {
          const entries = useCheckpointStore.getState().getEntries(id);
          const firstMonth = entries[0]?.checkpoint_month;
          if (firstMonth) {
            await recomputeFrom(id, firstMonth, { seedOpeningBalance: desiredOB! });
          }
        } catch { /* checkpoints will reconcile on next open */ }
      } else {
        await updateAccount(id, editName, editCurrency, editType);
      }

      setEditOpen(false);
      await fetchTransactions();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditing(false);
    }
  };

  // --- Invite ---
  const handleInvite = async () => {
    if (!id) return;
    setInviteError("");
    setInviting(true);

    try {
      // Get the account key
      let keyToUse: string;
      if (accountKeyBase64) {
        keyToUse = accountKeyBase64;
      } else {
        keyToUse = await getAccountKey(
          id,
          privKeyBase64 ?? undefined,
          currentUser?.public_key
        );
      }

      // Get the server's public key (to encrypt account key for pending invitation)
      let serverPubKey = useRuleStore.getState().serverPublicKey;
      if (!serverPubKey) {
        serverPubKey = await useRuleStore.getState().fetchServerPublicKey();
      }
      if (!serverPubKey) {
        setInviteError("Server public key not available");
        setInviting(false);
        return;
      }

      // Encrypt the account key with the server's public key so the server
      // can re-encrypt it for the invitee when they accept.
      const encryptedAccountKey = await encryptForRecipient(
        { account_key: keyToUse },
        serverPubKey
      );

      await inviteUser(id, inviteEmail, encryptedAccountKey);
      setInviteOpen(false);
      setInviteEmail("");
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviting(false);
    }
  };

  // Category helpers
  const handleSelectCategory = (cat: string) => {
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  const handleAddNewCategory = () => {
    const cat = newCategory.trim();
    if (!cat) return;
    if (id) addCategory(txType as CategoryType, cat);
    setTxCategory(cat);
    setShowCategoryInput(false);
    setNewCategory("");
  };

  // --- Edit transaction ---
  const openEditTx = async (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx || !tx.payload) return;
    setEditTxId(txId);
    setEditTxInitialValues({
      type: tx.payload.amount >= 0 ? "income" : "expense",
      amount: formatNumber(Math.abs(tx.payload.amount)),
      commission: tx.payload.commission ? formatNumber(tx.payload.commission) : "",
      interest_amount: tx.payload.interest_amount ? formatNumber(tx.payload.interest_amount) : "",
      date: tx.time.slice(0, 10),
      category: tx.payload.category ?? "",
      counterparty: tx.payload.counterparty ?? "",
      notes: tx.payload.notes ?? "",
      isTransfer: isTransferPayload(tx.payload),
      targetAccountId: tx.payload.is_transfer
        ? (tx.payload.amount > 0
            ? tx.payload.transfer_source_account_id   // income side → other side is the source
            : tx.payload.transfer_target_account_id)   // expense side → other side is the target
        : undefined,
    });
    // Fetch existing documents for the transaction
    try {
      const docs = await apiFetch<DocumentMetadata[]>(
        ENDPOINTS.transactionDocuments(txId),
      );
      setEditTxExistingDocs(docs ?? []);
    } catch {
      setEditTxExistingDocs([]);
    }
    setEditTxOpen(true);
  };

  const handleUpdateTransaction = async (data: TransactionFormData) => {
    if (!editTxId) return;
    if (!accountKeyBase64) {
      setEditTxError("Account key not available. Try re-encrypting the key.");
      return;
    }

    setEditTxError("");
    setEditTxSaving(true);

    try {
      const rawAmount = parseLocaleNumber(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseLocaleNumber(data.commission) : 0;
      const interest = data.interest_amount ? parseLocaleNumber(data.interest_amount) : 0;
      const time = new Date(data.date + "T12:00:00Z").toISOString();

      // Find the existing transaction being edited
      const existingTx = transactions.find((t) => t.id === editTxId);
      const existingPayload = existingTx?.payload;
      const wasTransfer = existingPayload ? isTransferPayload(existingPayload) : false;
      const existingPairId = existingPayload?.transfer_pair_id;

      if (data.isTransfer && data.targetAccountId) {
        // ---- Updating as a transfer ----
        const transferPairId = existingPairId || crypto.randomUUID();
        const currentIsSource = !existingPayload || existingPayload.amount < 0;

        const sourceAccountId = currentIsSource ? id! : data.targetAccountId;
        const targetAccountId = currentIsSource ? data.targetAccountId : id!;

        const sourceAccount = accounts.find((a) => a.id === sourceAccountId);
        const targetAccount = accounts.find((a) => a.id === targetAccountId);
        const sourceName = sourceAccount?.name || sourceAccount?.currency || sourceAccountId;
        const targetName = targetAccount?.name || targetAccount?.currency || targetAccountId;
        const counterpartyText = `${sourceName} → ${targetName}`;

        const sourcePayload = {
          amount: -absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: sourceAccountId,
          transfer_target_account_id: targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };

        const targetPayload = {
          amount: absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: sourceAccountId,
          transfer_target_account_id: targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };

        // Encrypt and update current side
        const currentEncrypted = await encryptTransactionPayload(
          currentIsSource ? sourcePayload : targetPayload,
          accountKeyBase64
        );
        await apiFetch(ENDPOINTS.transaction(editTxId), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: currentEncrypted } as CreateTransactionRequest),
        });

        // Find and update/create paired side
        const pairedAccountId = currentIsSource ? targetAccountId : sourceAccountId;
        const pairedKey = await getAccountKey(pairedAccountId, privKeyBase64 ?? undefined, currentUser?.public_key);

        if (existingPairId && wasTransfer) {
          const pairedTx = transactions.find(
            (t) => t.id !== editTxId && t.payload?.transfer_pair_id === existingPairId
          );
          if (pairedTx) {
            const pairedEncrypted = await encryptTransactionPayload(
              currentIsSource ? targetPayload : sourcePayload,
              pairedKey
            );
            await apiFetch(ENDPOINTS.transaction(pairedTx.id), {
              method: "PUT",
              body: JSON.stringify({ time, encrypted_payload: pairedEncrypted } as CreateTransactionRequest),
            });
          } else {
            const pairedEncrypted = await encryptTransactionPayload(
              currentIsSource ? targetPayload : sourcePayload,
              pairedKey
            );
            await apiFetch(ENDPOINTS.transactions(pairedAccountId), {
              method: "POST",
              body: JSON.stringify({ time, encrypted_payload: pairedEncrypted }),
            });
          }
        } else {
          const pairedEncrypted = await encryptTransactionPayload(
            currentIsSource ? targetPayload : sourcePayload,
            pairedKey
          );
          await apiFetch(ENDPOINTS.transactions(pairedAccountId), {
            method: "POST",
            body: JSON.stringify({ time, encrypted_payload: pairedEncrypted }),
          });
        }
      } else if (wasTransfer && existingPairId) {
        // ---- Was a transfer, now becoming a regular transaction ----
        const pairedTx = transactions.find(
          (t) => t.id !== editTxId && t.payload?.transfer_pair_id === existingPairId
        );
        if (pairedTx) {
          await apiFetch(ENDPOINTS.transaction(pairedTx.id), { method: "DELETE" });
        }

        // Fall through to regular update
        const amount = data.type === "expense" ? -absAmount : absAmount;
        const category = data.category || "general";
        const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);
        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
          accountKeyBase64
        );
        await apiFetch(ENDPOINTS.transaction(editTxId), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
        });
      } else {
        // ---- Regular transaction update ----
        const amount = data.type === "expense" ? -absAmount : absAmount;
        const category = data.category || "general";
        const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);

        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
          accountKeyBase64
        );

        await apiFetch(ENDPOINTS.transaction(editTxId), {
          method: "PUT",
          body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
        });
      }

      // Handle document uploads and deletions
      if (data.file) {
        // Delete old documents, then upload new one
        for (const doc of editTxExistingDocs) {
          await apiFetch(ENDPOINTS.transactionDocument(editTxId, doc.id), {
            method: "DELETE",
          });
        }
        const fileData = await encryptFile(data.file, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(editTxId), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }
      for (const docId of data.documentsToDelete) {
        await apiFetch(ENDPOINTS.transactionDocument(editTxId, docId), {
          method: "DELETE",
        });
      }

      setEditTxOpen(false);
      setEditTxId(null);
      setEditTxInitialValues(undefined);
      await fetchTransactions();

      // Propagate the edited transaction's month to its checkpoints.
      if (id) {
        const txMonth = transactionMonthEnd(new Date(data.date + "T12:00:00Z").toISOString());
        await applyCheckpointUpdateAfterTxChange(id, txMonth);
      }
    } catch (err: any) {
      setEditTxError(err.message);
    } finally {
      setEditTxSaving(false);
    }
  };

  // --- Create transaction ---
  const handleCreateTransaction = async (data: TransactionFormData) => {
    if (!id) return;
    setTxCreateError("");
    setTxCreating(true);

    try {
      const rawAmount = parseLocaleNumber(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseLocaleNumber(data.commission) : 0;
      const time = new Date(data.date + "T12:00:00Z").toISOString();

      if (data.isTransfer && data.targetAccountId) {
        // ---- Account-to-account transfer ----
        const transferPairId = crypto.randomUUID();

        // Source account: expense (the current account)
        const sourceKey = await getAccountKey(id, privKeyBase64 ?? undefined, currentUser?.public_key);
        const sourceAccount = accounts.find((a) => a.id === id);
        const targetAccount = accounts.find((a) => a.id === data.targetAccountId);
        const sourceName = sourceAccount?.name || sourceAccount?.currency || id;
        const targetName = targetAccount?.name || targetAccount?.currency || data.targetAccountId;
        const counterpartyText = `${sourceName} → ${targetName}`;

        const sourcePayload = {
          amount: -absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: id,
          transfer_target_account_id: data.targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };
        const sourceEncrypted = await encryptTransactionPayload(sourcePayload, sourceKey);
        await apiFetch<Transaction>(ENDPOINTS.transactions(id), {
          method: "POST",
          body: JSON.stringify({ time, encrypted_payload: sourceEncrypted }),
        });

        // Target account: income
        const targetKey = await getAccountKey(data.targetAccountId, privKeyBase64 ?? undefined, currentUser?.public_key);
        const targetPayload = {
          amount: absAmount,
          category: "Transfer",
          notes: data.notes,
          counterparty: counterpartyText,
          commission: commission > 0 ? commission : undefined,
          is_transfer: true,
          transfer_pair_id: transferPairId,
          transfer_source_account_id: id,
          transfer_target_account_id: data.targetAccountId,
          transfer_source_account_name: sourceName,
          transfer_target_account_name: targetName,
        };
        const targetEncrypted = await encryptTransactionPayload(targetPayload, targetKey);
        await apiFetch<Transaction>(ENDPOINTS.transactions(data.targetAccountId), {
          method: "POST",
          body: JSON.stringify({ time, encrypted_payload: targetEncrypted }),
        });

        setCreateOpen(false);
        await fetchTransactions();
        return;
      }

      // ---- Regular transaction ----
      const amount = data.type === "expense" ? -absAmount : absAmount;
      const accountKeyBase64 = await getAccountKey(id, privKeyBase64 ?? undefined, currentUser?.public_key);

      const category = data.category || "general";
      const categoryId = await useCategoryStore.getState().ensureCategory(data.type as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, category_id: categoryId, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined },
        accountKeyBase64
      );

      const createdTx = await apiFetch<Transaction>(ENDPOINTS.transactions(id), {
        method: "POST",
        body: JSON.stringify({ time, encrypted_payload: encryptedPayload } as CreateTransactionRequest),
      });

      // If there's a file, encrypt and upload as a document
      if (data.file && createdTx?.id) {
        const fileData = await encryptFile(data.file, accountKeyBase64);
        await apiFetch(ENDPOINTS.transactionDocuments(createdTx.id), {
          method: "POST",
          body: JSON.stringify(fileData),
        });
      }

      setCreateOpen(false);
      await fetchTransactions();

      // Propagate the new transaction's month to the affected checkpoints.
      // For transfers both legs live in different accounts; update both.
      if (id) {
        const txMonth = transactionMonthEnd(new Date(data.date + "T12:00:00Z").toISOString());
        await applyCheckpointUpdateAfterTxChange(id, txMonth);
        if (data.isTransfer && data.targetAccountId) {
          await applyCheckpointUpdateAfterTxChange(data.targetAccountId, txMonth);
        }
      }
    } catch (err: any) {
      setTxCreateError(err.message);
    } finally {
      setTxCreating(false);
    }
  };

  const handleEditOpeningBalance = async () => {
    setOpeningBalanceError("");
    const raw = parseLocaleNumber(openingBalanceInput);
    if (isNaN(raw) || raw < 0) {
      setOpeningBalanceError("Please enter a valid positive amount");
      return;
    }

    const desiredOB = raw;
    const currentOB = openingBalance;
    if (Math.abs(desiredOB - currentOB) < 0.001) {
      setOpeningBalanceEditOpen(false);
      return;
    }

    setOpeningBalanceSaving(true);
    try {
      const accountKeyBase64Val = accountKeyBase64;
      if (!accountKeyBase64Val) throw new Error("Account key not available");
      if (!account || !id) throw new Error("Account not found");

      // Opening balance is now account metadata.
      const encMeta = await encryptAccountMetadata(
        { opening_balance: desiredOB },
        accountKeyBase64Val,
      );
      await updateAccount(id, account.name, account.currency, account.type, encMeta);
      setMetadataOpeningBalance(desiredOB);

      try {
        const entries = useCheckpointStore.getState().getEntries(id);
        const firstMonth = entries[0]?.checkpoint_month;
        if (firstMonth) {
          await recomputeFrom(id, firstMonth, { seedOpeningBalance: desiredOB });
        }
      } catch { /* will reconcile on next open */ }

      setOpeningBalanceEditOpen(false);
      await fetchTransactions();
    } catch (err: any) {
      setOpeningBalanceError(err.message);
    } finally {
      setOpeningBalanceSaving(false);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm("Delete this transaction?")) return;
    try {
      // Capture the tx's month before deleting (for checkpoint propagation).
      const tx = transactions.find((t) => t.id === txId);
      const txMonth = tx?.time ? transactionMonthEnd(tx.time) : null;
      await apiFetch(ENDPOINTS.transaction(txId), { method: "DELETE" });
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      if (id && txMonth) await applyCheckpointUpdateAfterTxChange(id, txMonth);
    } catch (err: any) {
      setTxError(err.message);
    }
  };

  if (!account) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => navigate("/accounts")}>
          &larr; Back to Accounts
        </Button>
        <p className="text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  // Date range (affects all components)
  const dateRange = useDateRangeStore((s) => s.range);
  const { selectedCategories, selectedTypes } = useFilterStore();

  // All-time balance for this account
  // Live balance: opening balance (metadata or legacy OB txs) + sum of
  // all decrypted transactions. This is the simplest correct formula:
  // the OB is the base, and every non-OB transaction adds/subtracts from it.
  const totalBalance = (metadataOpeningBalance ?? 0) + transactions
    .filter((tx) => tx.payload && tx.payload.category !== "Opening Balance")
    .reduce((sum, tx) => sum + effectiveAmount(tx.payload!), 0);

  // Date-range-only filter (used for stats: counts, money flow, balance chart)
  const filteredTxs = transactions.filter((tx) => {
    const d = tx.time.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  });

  // Display filter: date range + category + type (used for pie charts and transaction lists)
  const displayFilteredTxs = filteredTxs.filter((tx) => {
    if (!tx.payload) return true;
    if (selectedTypes.length > 0) {
      const isTransfer = isTransferPayload(tx.payload);
      const txType = isTransfer ? "transfer" : tx.payload.amount > 0 ? "income" : "expense";
      if (!selectedTypes.includes(txType)) return false;
    }
    if (selectedCategories.length > 0) {
      if (!selectedCategories.includes(tx.payload.category)) return false;
    }
    return true;
  });

  // Category colors are now sourced from the category store (user-defined or deterministic fallback)

  // Expenses by category — applies display filters + excludes transfers.
  // (category !== "Opening Balance" guard is a defense for unmigrated
  // accounts; no-op post-migration.)
  const expenseChartData = (() => {
    const groups = new Map<string, { id?: string; name: string; value: number }>();
    displayFilteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && tx.payload.category !== "Opening Balance" && !isTransferPayload(tx.payload)) {
        const key = tx.payload.category_id || tx.payload.category || "General";
        const existing = groups.get(key);
        if (existing) {
          existing.value += Math.abs(effectiveAmount(tx.payload));
        } else {
          groups.set(key, {
            id: tx.payload.category_id,
            name: useCategoryStore.getState().resolveCategoryName(tx.payload.category, tx.payload.category_id),
            value: Math.abs(effectiveAmount(tx.payload)),
          });
        }
      }
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, value: Number(g.value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Income by category — applies display filters + excludes transfers.
  // (category !== "Opening Balance" guard is a defense for unmigrated
  // accounts; no-op post-migration.)
  const incomeChartData = (() => {
    const groups = new Map<string, { id?: string; name: string; value: number }>();
    displayFilteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && tx.payload.category !== "Opening Balance" && !isTransferPayload(tx.payload)) {
        const key = tx.payload.category_id || tx.payload.category || "General";
        const existing = groups.get(key);
        if (existing) {
          existing.value += effectiveAmount(tx.payload);
        } else {
          groups.set(key, {
            id: tx.payload.category_id,
            name: useCategoryStore.getState().resolveCategoryName(tx.payload.category, tx.payload.category_id),
            value: effectiveAmount(tx.payload),
          });
        }
      }
    });
    return Array.from(groups.values())
      .map((g) => ({ ...g, value: Number(g.value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Totals for donut center labels
  const expenseTotal = expenseChartData.reduce((sum, d) => sum + d.value, 0);
  const incomeTotal = incomeChartData.reduce((sum, d) => sum + d.value, 0);

  // Balance chart data for this account, scoped to the date range
  const accountChartData = (() => {
    const startDate = new Date(dateRange.start + "T12:00:00");
    const endDate = new Date(dateRange.end + "T12:00:00");
    const windowStartEpoch = startDate.getTime();

    // Opening balance: prefer checkpoint (range-sum) when available; fall back
    // to the classic pre-window sum from downloaded transactions.
    const cpEntries = id ? useCheckpointStore.getState().getEntries(id) : [];
    let chartOpeningBalance = 0;
    if (cpEntries.length > 0) {
      // Spec §4.5: checkpoint of the month before window start + partial month.
      // When the previous month's checkpoint is missing (window starts in the
      // same month as the first checkpoint), use the metadata opening balance
      // as the 0th prefix-sum element.
      const lastMonthEnd = previousMonthEnd(dateRange.start);
      const cpBefore = id
        ? useCheckpointStore.getState().balanceThrough(id, lastMonthEnd)
        : null;
      const checkpointBase = cpBefore ?? metadataOpeningBalance ?? 0;
      const startMonth = transactionMonthEnd(new Date(windowStartEpoch).toISOString());
      let partialMonth = 0;
      for (const tx of transactions) {
        if (!tx.payload) continue;
        const txTime = new Date(tx.time).getTime();
        if (txTime < windowStartEpoch && transactionMonthEnd(tx.time) === startMonth) {
          partialMonth += effectiveAmount(tx.payload);
        }
      }
      chartOpeningBalance = checkpointBase + partialMonth;
    } else {
      // Classic fallback: sum all pre-window transactions from downloaded data.
      for (const tx of transactions) {
        if (tx.payload && new Date(tx.time).getTime() < windowStartEpoch) {
          chartOpeningBalance += effectiveAmount(tx.payload);
        }
      }
    }

    // Build contiguous calendar
    const dayTotals: Record<string, number> = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dayTotals[d.toISOString().slice(0, 10)] = 0;
    }

    // Accumulate filtered transactions into daily buckets
    for (const tx of filteredTxs) {
      const key = tx.time.slice(0, 10);
      if (key in dayTotals && tx.payload) {
        dayTotals[key] += effectiveAmount(tx.payload);
      }
    }

    // Running total
    const sortedDates = Object.keys(dayTotals).sort();
    let cumulative = chartOpeningBalance;
    return sortedDates.map((date) => {
      cumulative += dayTotals[date];
      return {
        date,
        displayDate: formatDate(date, { month: "short", day: "numeric" }),
        balance: Number(cumulative.toFixed(2)),
      };
    });
  })();

  // Opening balance — read from accounts.encrypted_metadata (post-migration);
  // fall back to summing legacy "Opening Balance" transactions for accounts
  // that haven't run the client-side migration yet.
  const legacyOBTransactions = transactions.filter(
    (tx) => tx.payload && tx.payload.category === "Opening Balance"
  );
  const openingBalance =
    metadataOpeningBalance != null
      ? metadataOpeningBalance
      : legacyOBTransactions.reduce((sum, tx) => sum + effectiveAmount(tx.payload!), 0);

  // Regular transactions: exclude transfers from stats.
  // (category !== "Opening Balance" guard is a defense for unmigrated accounts.)
  const regularFilteredTxs = filteredTxs.filter(
    (tx) => tx.payload && tx.payload.category !== "Opening Balance" && !isTransferPayload(tx.payload)
  );
  const incomeTx = regularFilteredTxs.filter((tx) => tx.payload && tx.payload.amount > 0);
  const expenseTxFromFiltered = regularFilteredTxs.filter((tx) => tx.payload && tx.payload.amount < 0);
  const incomeCountAcc = incomeTx.length;
  const expenseCountAcc = expenseTxFromFiltered.length;
  const incomeAvgAcc = incomeTx.length > 0
    ? incomeTx.reduce((sum, tx) => sum + effectiveAmount(tx.payload!), 0) / incomeTx.length
    : 0;
  const expenseAvgAcc = expenseTxFromFiltered.length > 0
    ? Math.abs(expenseTxFromFiltered.reduce((sum, tx) => sum + effectiveAmount(tx.payload!), 0)) / expenseTxFromFiltered.length
    : 0;
  // For display: apply display filters.
  // (category !== "Opening Balance" guard defends unmigrated accounts.)
  const displayAccountTxs = displayFilteredTxs.filter(
    (tx) => tx.payload && tx.payload.category !== "Opening Balance"
  );
  const recentAccountTxs = displayAccountTxs.slice(0, cardTxLimit);
  const hasMoreCardTxs = cardTxLimit < displayAccountTxs.length;

  // --- Show All transactions callbacks ---
  const openShowAll = useCallback(() => {
    setShowAllTxs(displayAccountTxs);
    setShowAllRawOffset(transactions.length); // total raw (unfiltered) transactions fetched so far
    setHasMoreTxs(transactions.length >= 50);
    setShowAllOpen(true);
  }, [displayAccountTxs, transactions]);

  const loadMoreTransactions = useCallback(async () => {
    if (!id || showAllLoading) return;
    setShowAllLoading(true);
    try {
      const data = await apiFetch<Transaction[]>(`${ENDPOINTS.transactions(id)}?limit=50&offset=${showAllRawOffset}`);
      const raw = data ?? [];

      setShowAllRawOffset((prev) => prev + raw.length);
      if (raw.length < 50) {
        setHasMoreTxs(false);
      }

      const keyToUse = accountKeyBase64;
      const newDecrypted: TransactionDisplay[] = await Promise.all(
        raw.map(async (tx) => {
          if (tx.encrypted_payload.startsWith("1|")) {
            if (privKeyBase64) {
              try {
                const payload = await decryptECIESPayload<TransactionPayload>(
                  tx.encrypted_payload,
                  privKeyBase64,
                );
                return { id: tx.id, time: tx.time, account_id: tx.account_id, payload };
              } catch { /* fall through */ }
            }
            return { id: tx.id, time: tx.time, account_id: tx.account_id, payload: null, decryptError: privKeyBase64 ? "Decryption failed" : "Key unavailable" };
          }
          if (keyToUse) {
            try {
              const payload = await decryptTransactionPayload(tx.encrypted_payload, keyToUse);
              return { id: tx.id, time: tx.time, account_id: tx.account_id, payload };
            } catch { /* fall through */ }
          }
          return { id: tx.id, time: tx.time, account_id: tx.account_id, payload: null, decryptError: keyToUse ? "Decryption failed" : "Key unavailable" };
        })
      );

      const filteredNew = newDecrypted.filter((tx) => {
        if (!tx.payload) return true;
        if (tx.payload.category === "Opening Balance") return false;
        const d = tx.time.slice(0, 10);
        return d >= dateRange.start && d <= dateRange.end;
      });

      setShowAllTxs((prev) => [...prev, ...filteredNew]);
    } catch {
      setHasMoreTxs(false);
    } finally {
      setShowAllLoading(false);
    }
  }, [id, showAllLoading, showAllRawOffset, accountKeyBase64, privKeyBase64, dateRange]);

  // Re-fetch window-only transactions when dateRange changes (checkpoint mode).
  useEffect(() => {
    if (accountKeyBase64) {
      const cpEntries = useCheckpointStore.getState().getEntries(id ?? "");
      if (cpEntries.length > 0 && id) {
        fetchTransactions(accountKeyBase64);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKeyBase64, id, dateRange.start, dateRange.end]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/accounts")} className="h-9 w-9 p-0 shrink-0">
            &larr;
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold truncate">{account.name || account.currency}</h1>
              <Button variant="outline" size="sm" onClick={openEdit} className="h-7 px-2 text-[10px] shrink-0">
                Edit
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-lg sm:text-xl font-semibold font-mono ${
                  totalBalance < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {getCurrencySymbol(account.currency)}
                {formatNumber(totalBalance)}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground capitalize">• {account.type} account</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 self-start sm:self-auto shrink-0">
          {/* Create Transaction — using shared TransactionForm */}
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Transaction" trigger={<Button>Add Transaction</Button>}>
            <TransactionForm
              accounts={accounts
                .map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))
                .sort((a, b) => a.label.localeCompare(b.label))}
              accountId={id}
              getCategories={getCategories}
              addCategory={addCategory}
              onSave={handleCreateTransaction}
              saving={txCreating}
              error={txCreateError}
            />
          </ResponsiveDialog>

          {/* Edit Transaction Dialog (shared TransactionForm) */}
          <ResponsiveDialog open={editTxOpen} onOpenChange={(open) => { setEditTxOpen(open); if (!open) { setEditTxId(null); setEditTxInitialValues(undefined); } }} title="Edit Transaction">
            {editTxInitialValues && (
              <TransactionForm
                accounts={accounts
                  .map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))
                  .sort((a, b) => a.label.localeCompare(b.label))}
                accountId={id}
                initialValues={editTxInitialValues}
                existingDocuments={editTxExistingDocs}
                getCategories={getCategories}
                addCategory={addCategory}
                onSave={handleUpdateTransaction}
                saving={editTxSaving}
                error={editTxError}
                submitLabel="Save"
              />
            )}
          </ResponsiveDialog>

          {/* Invite (for joint accounts) */}
          {account.type === "joint" && (
            <ResponsiveDialog open={inviteOpen} onOpenChange={setInviteOpen} title="Invite to Account" trigger={<Button variant="outline">Invite User</Button>}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">User Email</label>
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
                    <Button onClick={handleInvite} className="w-full" disabled={inviting}>
                      {inviting ? "Sending..." : "Send Invite"}
                    </Button>
                  </div>
            </ResponsiveDialog>
          )}
        </div>
      </div>

      {/* Edit Account Dialog */}
      <ResponsiveDialog open={editOpen} onOpenChange={setEditOpen} title="Edit Account">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Account name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <select
                value={editCurrency}
                onChange={(e) => setEditCurrency(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
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
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/50">
              <label className="text-sm font-medium">
                Opening Balance
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  (current: {formatCurrency(openingBalance, account?.currency ?? "EUR", true)})
                </span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none select-none">
                  +
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editOpeningBalance}
                  onChange={(e) => setEditOpeningBalance(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Adjusts the base balance of this account. Creates an adjustment transaction if changed.
              </p>
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
            <Button onClick={handleEdit} className="w-full" disabled={editing}>
              {editing ? "Saving..." : "Save"}
            </Button>
          </div>
      </ResponsiveDialog>

      {/* Transaction Detail Overlay */}
      {detailTx?.payload && (
        <TransactionDetailOverlay
          transaction={{ id: detailTx.id, time: detailTx.time, payload: detailTx.payload }}
          currency={account.currency}
          accountKeyBase64={accountKeyBase64}
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setDetailTx(null);
          }}
          onEdit={(txId) => {
            setDetailOpen(false);
            openEditTx(txId);
          }}
          onDelete={(txId) => {
            setDetailOpen(false);
            handleDeleteTransaction(txId);
          }}
        />
      )}

      {/* Summary cards (dashboard-style, no Total Accounts) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{displayAccountTxs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Income / Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {incomeCountAcc}
              <span className="text-sm font-normal text-muted-foreground"> / </span>
              {expenseCountAcc}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Money Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Income</span>
                <span className="font-semibold tabular-nums text-income">
                  {formatCurrency(incomeTotal, account.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Expenses</span>
                <span className="font-semibold tabular-nums text-expense">
                  -{formatCurrency(expenseTotal, account.currency)}
                </span>
              </div>
              <div className="border-t border-border pt-1 mt-1 flex items-center justify-between text-sm font-bold">
                <span>Net</span>
                <span className={`tabular-nums ${incomeTotal - expenseTotal >= 0 ? "text-income" : "text-expense"}`}>
                  {formatCurrency(incomeTotal - expenseTotal, account.currency, true)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Progress (scoped to this account) */}
      {id && (
        <BudgetProgressSection
          transactions={filteredTxs}
          accountId={id}
        />
      )}

      {/* Opening Balance Section */}
      {openingBalance !== 0 && (
        <Card
          className="cursor-pointer hover:bg-accent/40 transition-all duration-200"
          onClick={() => {
            setOpeningBalanceInput(formatNumber(Math.abs(openingBalance)));
            setOpeningBalanceError("");
            setOpeningBalanceEditOpen(true);
          }}
        >
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-full h-8 w-8 bg-income/10 text-income shrink-0 text-sm font-bold">
                ⊕
              </div>
              <div>
                <span className="font-semibold text-sm">Opening Balance</span>
                <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">Base capital — click to edit</span>
              </div>
            </div>
            <span className="text-base font-bold tabular-nums text-income">
              {formatCurrency(openingBalance, account?.currency ?? "EUR", true)}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Opening Balance Edit Dialog */}
      <ResponsiveDialog open={openingBalanceEditOpen} onOpenChange={setOpeningBalanceEditOpen} title="Edit Opening Balance">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the base opening balance for this account. This creates an adjustment transaction to move the balance from the current value to the new value.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Current: {formatCurrency(openingBalance, account?.currency ?? "EUR", true)}
            </label>
            <Input
              type="text"
              inputMode="decimal"
              value={openingBalanceInput}
              onChange={(e) => setOpeningBalanceInput(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          {openingBalanceError && (
            <p className="text-sm text-destructive">{openingBalanceError}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpeningBalanceEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleEditOpeningBalance}
              disabled={openingBalanceSaving}
            >
              {openingBalanceSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>

      {/* Main Grid: Balance chart + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-lg font-bold">Balance</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <BalanceChart
                data={accountChartData}
                currency={account.currency}
                gradientId="colorAccountBalance"
              />
            </CardContent>
          </Card>
        </div>
        <div>
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
                {displayAccountTxs.length > 0 && (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={openShowAll}>
                    Show All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              {txLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : recentAccountTxs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[260px] text-center">
                  <p className="text-sm text-muted-foreground">
                    {transactions.length === 0
                      ? `No transactions yet. Click "Add Transaction" to get started.`
                      : "No transactions in selected range."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentAccountTxs.map((tx) => (
                    <TransactionCard
                      key={tx.id}
                      transaction={tx}
                      currency={account.currency}
                      onClick={
                        tx.payload
                          ? () => {
                              setDetailTx(tx);
                              setDetailOpen(true);
                            }
                          : undefined
                      }
                      compact
                    />
                  ))}
                  {hasMoreCardTxs && (
                    <div className="flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setCardTxLimit((prev) => prev + 10)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                      >
                        Show more
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Members for joint accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* If joint: Members card */}
        {account.type === "joint" && (
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent>
              {accountUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members.</p>
              ) : (
                <div className="space-y-2">
                  {accountUsers.map((user) => (
                    <div
                      key={user.user_id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card text-card-foreground text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-medium capitalize">{user.role}</span>
                        <span className="text-muted-foreground ml-2 truncate block sm:inline">
                          {user.user_id === currentUser?.id
                            ? "(you)"
                            : `ID: ${user.user_id.slice(0, 8)}...`}
                        </span>
                      </div>
                      {user.role !== "owner" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => id && removeUser(id, user.user_id)}
                          className="h-7 px-2 text-[10px]"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pie charts side by side (for non-joint accounts) */}
      {account.type !== "joint" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Expenses by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryPieChart
                data={expenseChartData}
                total={expenseTotal}
                currency={account.currency}
                type="expense"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Income by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryPieChart
                data={incomeChartData}
                total={incomeTotal}
                currency={account.currency}
                type="income"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Show All Transactions overlay */}
      <ResponsiveDialog open={showAllOpen} onOpenChange={setShowAllOpen} title="All Transactions">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {showAllTxs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No transactions in the selected range.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Showing {showAllTxs.length} transaction{showAllTxs.length !== 1 ? "s" : ""}
                {hasMoreTxs ? " (load more below)" : ""}
              </p>
              {showAllTxs.map((tx) => (
                <TransactionCard
                  key={tx.id}
                  transaction={tx}
                  currency={account.currency}
                  onClick={
                    tx.payload
                      ? () => {
                          setShowAllOpen(false);
                          setDetailTx(tx);
                          setDetailOpen(true);
                        }
                      : undefined
                  }
                  compact
                />
              ))}
              {hasMoreTxs && (
                <div className="flex justify-center pt-3 pb-1 border-t border-border/50 mt-2">
                  <button
                    type="button"
                    onClick={loadMoreTransactions}
                    disabled={showAllLoading}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    {showAllLoading ? "Loading..." : "Load more transactions"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </ResponsiveDialog>

      </div>
  );
}
