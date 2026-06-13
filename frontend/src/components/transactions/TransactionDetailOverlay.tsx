/**
 * TransactionDetailOverlay — a read-only dialog that displays a transaction's
 * decrypted payload in a nicely formatted layout, along with any attached
 * document (image preview or download link).
 *
 * An "Edit" button opens the parent's edit dialog, and a "Delete" button
 * triggers the delete flow.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { decryptFile } from "@/lib/crypto-file";
import { formatDate, formatCurrency } from "@/lib/format";
import {
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  ImageIcon,
  Download,
  Pencil,
  Trash2,
  X,
  Loader2,
  FileIcon,
} from "lucide-react";
import type { TransactionPayload } from "@/lib/crypto-transaction";
import type { DocumentMetadata, DocumentDataResponse } from "@/types";

export interface TransactionDetailDisplay {
  id: string;
  time: string;
  payload: TransactionPayload;
}

interface TransactionDetailOverlayProps {
  transaction: TransactionDetailDisplay;
  currency: string;
  accountKeyBase64: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function TransactionDetailOverlay({
  transaction,
  currency,
  accountKeyBase64,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: TransactionDetailOverlayProps) {
  const { id, time, payload } = transaction;
  const isIncome = payload.amount >= 0;

  // Document state
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState("");

  // Decrypted document URLs (for preview)
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});
  const [decryptingDocs, setDecryptingDocs] = useState<Record<string, boolean>>({});

  // Fetch document metadata when overlay opens
  useEffect(() => {
    if (!open) {
      setDocuments([]);
      setDocUrls({});
      setDocError("");
      return;
    }

    const fetchDocs = async () => {
      setDocLoading(true);
      setDocError("");
      try {
        const data = await apiFetch<DocumentMetadata[]>(
          ENDPOINTS.transactionDocuments(id),
        );
        setDocuments(data ?? []);
      } catch (err: any) {
        setDocError(err.message);
      } finally {
        setDocLoading(false);
      }
    };
    fetchDocs();
  }, [open, id]);

  // Decrypt a document to a blob URL for preview
  const decryptAndPreview = async (doc: DocumentMetadata) => {
    if (docUrls[doc.id]) return; // already decrypted
    if (!accountKeyBase64) return;

    setDecryptingDocs((prev) => ({ ...prev, [doc.id]: true }));
    try {
      const data = await apiFetch<DocumentDataResponse>(
        ENDPOINTS.transactionDocumentData(id, doc.id),
      );
      if (!data) throw new Error("Failed to fetch document data");

      const blob = await decryptFile(
        data.encrypted_data,
        accountKeyBase64,
        doc.mime_type,
      );
      const url = URL.createObjectURL(blob);
      setDocUrls((prev) => ({ ...prev, [doc.id]: url }));
    } catch (err: any) {
      console.error("Failed to decrypt document:", err);
    } finally {
      setDecryptingDocs((prev) => ({ ...prev, [doc.id]: false }));
    }
  };

  // Download a decrypted document
  const downloadDocument = async (doc: DocumentMetadata) => {
    if (!accountKeyBase64) return;

    try {
      const data = await apiFetch<DocumentDataResponse>(
        ENDPOINTS.transactionDocumentData(id, doc.id),
      );
      if (!data) throw new Error("Failed to fetch document data");

      const blob = await decryptFile(
        data.encrypted_data,
        accountKeyBase64,
        doc.mime_type,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to download document:", err);
    }
  };

    // Delete a document
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const deleteDocument = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    setDeletingDocId(docId);
    try {
      await apiFetch(ENDPOINTS.transactionDocument(id, docId), {
        method: "DELETE",
      });
      // Remove from local state
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (docUrls[docId]) {
        URL.revokeObjectURL(docUrls[docId]);
        setDocUrls((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
      }
    } catch (err: any) {
      console.error("Failed to delete document:", err);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(docUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [docUrls]);

  const isImage = (mime: string) => mime.startsWith("image/");

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Transaction Details">
        <div className="space-y-6">
          {/* Type icon + Amount */}
          <div className="flex items-center gap-4">
            <div
              className={`flex items-center justify-center rounded-full h-12 w-12 shrink-0 ${
                isIncome
                  ? "bg-income/10 text-income"
                  : "bg-expense/10 text-expense"
              }`}
            >
              {isIncome ? (
                <ArrowUpRight className="h-6 w-6" />
              ) : (
                <ArrowDownLeft className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  isIncome ? "text-income" : "text-foreground"
                }`}
              >
                {formatCurrency(payload.amount, currency, true)}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {isIncome ? "Income" : "Expense"}
              </span>
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                Date
              </span>
              <span className="font-medium">
                {formatDate(time, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            <div>
              <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                Category
              </span>
              {payload.category ? (
                <span className="text-[11px] uppercase font-bold tracking-wider bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                  {payload.category}
                </span>
              ) : (
                <span className="text-muted-foreground italic">None</span>
              )}
            </div>
            <div className="col-span-2">
              <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                Counterparty
              </span>
              <span className="font-medium">
                {payload.counterparty || (
                  <span className="text-muted-foreground italic">None</span>
                )}
              </span>
            </div>
            <div className="col-span-2">
              <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                Notes
              </span>
              <span className="text-sm whitespace-pre-wrap">
                {payload.notes || (
                  <span className="text-muted-foreground italic">No notes</span>
                )}
              </span>
            </div>
          </div>

          {/* Document section */}
          <div>
            <span className="block text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
              Attached Document
            </span>

            {docLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading documents...
              </div>
            ) : docError ? (
              <p className="text-sm text-destructive">{docError}</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No document attached
              </p>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-border bg-muted/30 p-3"
                  >
                    {/* File info row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isImage(doc.mime_type) ? (
                          <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <FileIcon className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <span className="text-sm font-medium truncate">
                          {doc.file_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Download button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => downloadDocument(doc)}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => deleteDocument(doc.id)}
                          disabled={deletingDocId === doc.id}
                          title="Delete document"
                        >
                          {deletingDocId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Image preview (click to expand) */}
                    {isImage(doc.mime_type) && (
                      <div className="relative">
                        {decryptingDocs[doc.id] ? (
                          <div className="flex items-center justify-center h-40 bg-muted rounded-md">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : docUrls[doc.id] ? (
                          <div className="relative group">
                            <img
                              src={docUrls[doc.id]}
                              alt={doc.file_name}
                              className="w-full max-h-64 object-contain rounded-md border border-border bg-white dark:bg-black"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 text-[10px] bg-background/80 backdrop-blur-sm"
                              onClick={() => window.open(docUrls[doc.id], "_blank")}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decryptAndPreview(doc)}
                            className="w-full h-9 text-xs"
                            disabled={!accountKeyBase64}
                          >
                            {accountKeyBase64
                              ? "Decrypt & Preview"
                              : "Key unavailable"}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Non-image: show file size + download button */}
                    {!isImage(doc.mime_type) && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {(doc.file_size / 1024).toFixed(1)} KB
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => downloadDocument(doc)}
                          disabled={!accountKeyBase64}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-border">
            {onEdit && (
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(transaction.id);
                }}
              >
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(transaction.id);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
    </ResponsiveDialog>
  );
}
