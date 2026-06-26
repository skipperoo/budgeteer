import React, { useRef, useState, useCallback } from "react";
import { useDataManagementStore } from "../../stores/data-management-store";
import { useAuthStore } from "../../stores/auth-store";

export const DataManagementSection: React.FC = () => {
  const {
    downloading,
    restoring,
    deleting,
    error,
    success,
    downloadDump,
    restoreFromZip,
    deleteAccount,
    clearMessages,
  } = useDataManagementStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore confirmation state
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Handle file selection for restore
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setRestoreFile(file);
      setRestoreConfirmOpen(true);
      setRestoreConfirmText("");
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    []
  );

  // Confirm and execute restore
  const handleConfirmRestore = useCallback(async () => {
    if (restoreConfirmText.trim() !== "Guacamole" || !restoreFile) return;
    setRestoreConfirmOpen(false);
    setRestoreConfirmText("");
    await restoreFromZip(restoreFile);
    setRestoreFile(null);
  }, [restoreConfirmText, restoreFile, restoreFromZip]);

  // Confirm and execute account deletion
  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmText.trim() !== "DELETE") return;
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
    await deleteAccount("DELETE");
  }, [deleteConfirmText, deleteAccount]);

  // Handle logout after deletion
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Data Management</h2>

      {/* Success/Error messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearMessages}
              className="ml-2 text-red-500 hover:text-red-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
          <div className="flex items-center justify-between">
            <span>{success}</span>
            <button
              onClick={clearMessages}
              className="ml-2 text-green-500 hover:text-green-700"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Download Section */}
      <div className="rounded-lg bg-card raised p-4">
        <h3 className="mb-1 font-medium">Download Data</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Export all your data as a zip archive. The archive contains your
          accounts, transactions, budgets, rules, and more in JSON format.
        </p>
        <button
          onClick={downloadDump}
          disabled={downloading}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {downloading ? "Downloading..." : "Download Data"}
        </button>
      </div>

      {/* Restore Section */}
      <div className="rounded-lg bg-card raised p-4">
        <h3 className="mb-1 font-medium">Restore Data</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload a previously downloaded archive to restore your data.
          <span className="block mt-1 font-semibold text-destructive">
            This will replace ALL your current data. This action cannot be undone.
          </span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
        {restoring && (
          <p className="mt-2 text-sm text-muted-foreground">
            Restoring data, please wait...
          </p>
        )}
      </div>

      {/* Delete Account Section */}
      <div className="rounded-lg bg-destructive/5 raised p-4">
        <h3 className="mb-1 font-medium text-destructive">Delete Account</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Permanently delete your account and all associated data. Transactions
          sent to other users will be preserved in their accounts.
          <span className="block mt-1 font-semibold text-destructive">
            This action cannot be undone.
          </span>
        </p>
        <button
          onClick={() => {
            setDeleteConfirmOpen(true);
            setDeleteConfirmText("");
          }}
          className="inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          {deleting ? "Deleting..." : "Delete Account"}
        </button>
        {deleting && (
          <p className="mt-2 text-sm text-muted-foreground">
            Deleting account, please wait...
          </p>
        )}
      </div>

      {/* Restore Confirmation Dialog */}
      {restoreConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 elevated">
            <h3 className="mb-2 text-lg font-semibold">Restore Data</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              This will replace ALL your current data with the data from the
              archive. This action is <strong>destructive</strong> and cannot be
              undone.
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              To confirm, please type{" "}
              <strong className="text-destructive">Guacamole</strong> below:
            </p>
            <input
              type="text"
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              placeholder='Type "Guacamole" to confirm'
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRestoreConfirmOpen(false);
                  setRestoreFile(null);
                }}
                className="rounded-md bg-card px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                disabled={restoreConfirmText.trim() !== "Guacamole"}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Restore Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-card p-6 elevated">
            <h3 className="mb-2 text-lg font-semibold text-destructive">
              Delete Account
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              This will permanently delete your account and all associated data.
              You will be logged out and your account cannot be recovered.
              Transactions you sent to other users will be preserved.
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              To confirm, please type{" "}
              <strong className="text-destructive">DELETE</strong> below:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-md bg-card px-4 py-2 text-sm font-medium border border-input bg-card hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteConfirmText.trim() !== "DELETE"}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
