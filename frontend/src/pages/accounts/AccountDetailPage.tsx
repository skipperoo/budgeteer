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
import { encryptTransactionPayload, decryptTransactionPayload, effectiveAmount, isTransferPayload } from "@/lib/crypto-transaction";
import type { TransactionPayload } from "@/lib/crypto-transaction";
import { encryptFile } from "@/lib/crypto-file";
import { getAccountKey } from "@/lib/decrypt-transactions";
import { useRuleStore } from "@/stores/rule-store";
import { TransactionCard, type TransactionDisplay } from "@/components/transactions/TransactionCard";
import { TransactionDetailOverlay } from "@/components/transactions/TransactionDetailOverlay";
import { TransactionForm, type TransactionFormData } from "@/components/transactions/TransactionForm";
import { CURRENCIES, getCurrencySymbol, formatCurrency } from "@/lib/format";
import type { Transaction, CreateTransactionRequest, DocumentMetadata } from "@/types";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as ChartTooltip,
} from "recharts";

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

  const fetchTransactions = async (key?: string) => {
    if (!id) return;
    const keyToUse = key ?? accountKeyBase64;
    setTxLoading(true);
    setTxError("");
    try {
      const data = await apiFetch<Transaction[]>(ENDPOINTS.transactions(id));
      const raw = data ?? [];

      const decrypted: TransactionDisplay[] = await Promise.all(
        raw.map(async (tx) => {
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
    setEditOpeningBalance(String(Math.abs(openingBalance)));
    setEditError("");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!id) return;
    setEditError("");
    setEditing(true);
    try {
      await updateAccount(id, editName, editCurrency, editType);

      // Handle opening balance change — edit the existing OB transaction or create one
      const rawOB = parseFloat(editOpeningBalance);
      if (!isNaN(rawOB) && rawOB >= 0) {
        const desiredOB = rawOB;
        const currentOB = openingBalance;
        if (Math.abs(desiredOB - currentOB) >= 0.001 || (currentOB === 0 && desiredOB > 0)) {
          const accountKeyBase64Val = accountKeyBase64;
          if (accountKeyBase64Val) {
            // Find existing Opening Balance transactions in this account
            const obTxs = transactions.filter(
              (tx) => tx.payload && tx.payload.category === "Opening Balance"
            );

            const obPayload = {
              amount: desiredOB,
              category: "Opening Balance",
              notes: obTxs.length > 0 ? "Opening balance" : "Initial balance",
              counterparty: "Opening Balance",
            };
            const encryptedPayload = await encryptTransactionPayload(obPayload, accountKeyBase64Val);

            if (obTxs.length > 0) {
              // Update the primary opening balance transaction with the new amount
              await apiFetch(ENDPOINTS.transaction(obTxs[0].id), {
                method: "PUT",
                body: JSON.stringify({
                  time: "1970-01-01T00:00:00.000Z",
                  encrypted_payload: encryptedPayload,
                } as CreateTransactionRequest),
              });
              // Delete any additional adjustment transactions
              for (let i = 1; i < obTxs.length; i++) {
                await apiFetch(ENDPOINTS.transaction(obTxs[i].id), { method: "DELETE" });
              }
            } else {
              // No existing opening balance — create a new one
              await apiFetch(ENDPOINTS.transactions(id), {
                method: "POST",
                body: JSON.stringify({
                  time: "1970-01-01T00:00:00.000Z",
                  encrypted_payload: encryptedPayload,
                } as CreateTransactionRequest),
              });
            }
          }
        }
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
      amount: String(Math.abs(tx.payload.amount)),
      commission: tx.payload.commission ? String(tx.payload.commission) : "",
      interest_amount: tx.payload.interest_amount ? String(tx.payload.interest_amount) : "",
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
      const rawAmount = parseFloat(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseFloat(data.commission) : 0;
      const interest = data.interest_amount ? parseFloat(data.interest_amount) : 0;
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
        addCategory(data.type as CategoryType, category);
        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
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
        addCategory(data.type as CategoryType, category);

        const encryptedPayload = await encryptTransactionPayload(
          { amount, category, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined, interest_amount: interest > 0 ? interest : undefined },
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
      const rawAmount = parseFloat(data.amount);
      if (isNaN(rawAmount)) throw new Error("Invalid amount");
      const absAmount = Math.abs(rawAmount);
      const commission = data.commission ? parseFloat(data.commission) : 0;
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
      addCategory(data.type as CategoryType, category);

      const encryptedPayload = await encryptTransactionPayload(
        { amount, category, notes: data.notes, counterparty: data.counterparty, commission: commission > 0 ? commission : undefined },
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
    } catch (err: any) {
      setTxCreateError(err.message);
    } finally {
      setTxCreating(false);
    }
  };

  const handleEditOpeningBalance = async () => {
    setOpeningBalanceError("");
    const raw = parseFloat(openingBalanceInput);
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
      if (!account) throw new Error("Account not found");

      // Find existing Opening Balance transactions
      const obTxs = transactions.filter(
        (tx) => tx.payload && tx.payload.category === "Opening Balance"
      );

      const obPayload = {
        amount: desiredOB,
        category: "Opening Balance",
        notes: obTxs.length > 0 ? "Opening balance" : "Initial balance",
        counterparty: "Opening Balance",
      };
      const encryptedPayload = await encryptTransactionPayload(obPayload, accountKeyBase64Val);

      if (obTxs.length > 0) {
        // Update the primary opening balance transaction
        await apiFetch(ENDPOINTS.transaction(obTxs[0].id), {
          method: "PUT",
          body: JSON.stringify({
            time: "1970-01-01T00:00:00.000Z",
            encrypted_payload: encryptedPayload,
          } as CreateTransactionRequest),
        });
        // Delete any additional adjustment transactions
        for (let i = 1; i < obTxs.length; i++) {
          await apiFetch(ENDPOINTS.transaction(obTxs[i].id), { method: "DELETE" });
        }
      } else {
        // No existing opening balance — create a new one
        await apiFetch(ENDPOINTS.transactions(account.id), {
          method: "POST",
          body: JSON.stringify({
            time: "1970-01-01T00:00:00.000Z",
            encrypted_payload: encryptedPayload,
          } as CreateTransactionRequest),
        });
      }

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
      await apiFetch(ENDPOINTS.transaction(txId), { method: "DELETE" });
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
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

  // Date range
  const dateRange = useDateRangeStore((s) => s.range);

  // All-time balance for this account
  const totalBalance = transactions
    .filter((tx) => tx.payload)
    .reduce((sum, tx) => sum + effectiveAmount(tx.payload!), 0);

  // Filter transactions to the date range for the chart and list
  const filteredTxs = transactions.filter((tx) => {
    const d = tx.time.slice(0, 10);
    return d >= dateRange.start && d <= dateRange.end;
  });

  // Pastel chart colors (matches dashboard)
  const CHART_COLORS = [
    "oklch(0.75 0.12 140)",
    "oklch(0.78 0.10 220)",
    "oklch(0.76 0.10 280)",
    "oklch(0.80 0.09 40)",
    "oklch(0.74 0.12 320)",
    "oklch(0.77 0.08 100)",
    "oklch(0.72 0.10 180)",
    "oklch(0.76 0.11 10)",
  ];

  // Expenses by category — excludes "Opening Balance" and transfers
  const expenseChartData = (() => {
    const categories: Record<string, number> = {};
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount < 0 && tx.payload.category !== "Opening Balance" && !isTransferPayload(tx.payload)) {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + Math.abs(effectiveAmount(tx.payload));
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Income by category — excludes "Opening Balance" and transfers
  const incomeChartData = (() => {
    const categories: Record<string, number> = {};
    filteredTxs.forEach((tx) => {
      if (tx.payload && tx.payload.amount > 0 && tx.payload.category !== "Opening Balance" && !isTransferPayload(tx.payload)) {
        const cat = tx.payload.category || "General";
        categories[cat] = (categories[cat] || 0) + effectiveAmount(tx.payload);
      }
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  })();

  // Totals for donut center labels
  const expenseTotal = expenseChartData.reduce((sum, d) => sum + d.value, 0);
  const incomeTotal = incomeChartData.reduce((sum, d) => sum + d.value, 0);

  // Balance chart data for this account, scoped to the date range
  const accountChartData = (() => {
    const startDate = new Date(dateRange.start + "T12:00:00");
    const endDate = new Date(dateRange.end + "T12:00:00");

    // Opening balance: sum of all transactions before the window
    let openingBalance = 0;
    const windowStartEpoch = startDate.getTime();
    for (const tx of transactions) {
      if (new Date(tx.time).getTime() < windowStartEpoch && tx.payload) {
        openingBalance += effectiveAmount(tx.payload);
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
    let cumulative = openingBalance;
    return sortedDates.map((date) => {
      cumulative += dayTotals[date];
      return {
        date,
        displayDate: new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        balance: Number(cumulative.toFixed(2)),
      };
    });
  })();

  // Opening balance: sum of all "Opening Balance" transactions
  const openingTxs = transactions.filter(
    (tx) => tx.payload && tx.payload.category === "Opening Balance"
  );
  const openingBalance = openingTxs.reduce(
    (sum, tx) => sum + effectiveAmount(tx.payload!), 0
  );

  // Regular transactions: exclude "Opening Balance" and transfers from stats
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
  // For display: show all non-Opening-Balance transactions (including transfers)
  const displayAccountTxs = filteredTxs.filter(
    (tx) => tx.payload && tx.payload.category !== "Opening Balance"
  );
  const recentAccountTxs = displayAccountTxs.slice(0, 10);

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
                {totalBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-xs sm:text-sm text-muted-foreground capitalize">• {account.type} account</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 self-start sm:self-auto shrink-0">
          {/* Create Transaction — using shared TransactionForm */}
          <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen} title="New Transaction" trigger={<Button>Add Transaction</Button>}>
            <TransactionForm
              accounts={accounts.map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))}
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
                accounts={accounts.map((a) => ({ id: a.id, label: `${a.name || a.currency} (${a.type})` }))}
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
                  type="number"
                  step="0.01"
                  min="0"
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
            setOpeningBalanceInput(String(Math.abs(openingBalance)));
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
              type="number"
              step="0.01"
              min="0"
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
              {expenseChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No expense data.
                </div>
              ) : (
                <div className="h-64 w-full flex flex-col justify-between font-mono text-[10px]">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={expenseChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {expenseChartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card text-card-foreground p-3 rounded-lg raised text-xs">
                                  <p className="font-semibold mb-1">{data.name}</p>
                                  <p className="font-mono text-destructive font-bold">
                                    {getCurrencySymbol(account.currency)}
                                    {data.value.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-destructive"
                          style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          {getCurrencySymbol(account.currency)}
                          {expenseTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </text>
                        <text
                          x="50%"
                          y="50%"
                          dy={16}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-muted-foreground"
                          style={{ fontSize: 9, fontWeight: 500, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          expenses
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {expenseChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {expenseChartData.length > 5 && (
                      <span className="text-muted-foreground italic text-[11px] self-center">+{expenseChartData.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-bold">Income by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {incomeChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No income data.
                </div>
              ) : (
                <div className="h-64 w-full flex flex-col justify-between font-mono text-[10px]">
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={incomeChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {incomeChartData.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-card text-card-foreground p-3 rounded-lg raised text-xs">
                                  <p className="font-semibold mb-1">{data.name}</p>
                                  <p className="font-mono text-income font-bold">
                                    {getCurrencySymbol(account.currency)}
                                    {data.value.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <text
                          x="50%"
                          y="50%"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-income"
                          style={{ fontSize: 14, fontWeight: 700, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          {getCurrencySymbol(account.currency)}
                          {incomeTotal.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </text>
                        <text
                          x="50%"
                          y="50%"
                          dy={16}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-muted-foreground"
                          style={{ fontSize: 9, fontWeight: 500, fontFamily: "DM Sans, system-ui, sans-serif" }}
                        >
                          income
                        </text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2 text-xs font-sans text-muted-foreground font-medium">
                    {incomeChartData.slice(0, 5).map((entry, index) => (
                      <div key={entry.name} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate max-w-[80px]">{entry.name}</span>
                      </div>
                    ))}
                    {incomeChartData.length > 5 && (
                      <span className="text-muted-foreground italic text-[11px] self-center">+{incomeChartData.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
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
