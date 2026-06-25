import { create } from "zustand";
import {
  downloadDumpZip,
  parseRestoreZip,
  restoreFromDump,
  deleteAccount as apiDeleteAccount,
  type UserDataDump,
} from "../lib/data-management";
import { useAuthStore } from "./auth-store";

export interface DataManagementState {
  /** Download is in progress */
  downloading: boolean;
  /** Restore is in progress */
  restoring: boolean;
  /** Account deletion is in progress */
  deleting: boolean;
  /** Most recent error message */
  error: string | null;
  /** Most recent success message */
  success: string | null;

  // Actions
  downloadDump: () => Promise<void>;
  restoreFromZip: (file: File) => Promise<void>;
  deleteAccount: (confirmation: string) => Promise<void>;
  clearMessages: () => void;
}

export const useDataManagementStore = create<DataManagementState>(
  (set) => ({
    downloading: false,
    restoring: false,
    deleting: false,
    error: null,
    success: null,

    downloadDump: async () => {
      set({ downloading: true, error: null, success: null });
      try {
        await downloadDumpZip();
        set({
          downloading: false,
          success: "Data downloaded successfully. Check your downloads folder.",
        });
      } catch (err) {
        set({
          downloading: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to download data",
        });
      }
    },

    restoreFromZip: async (file: File) => {
      set({ restoring: true, error: null, success: null });
      try {
        // Parse the zip file (reads plaintext JSON from dump)
        const dump: UserDataDump = await parseRestoreZip(file);

        // Re-encrypt and restore via individual creation endpoints
        await restoreFromDump(dump);

        set({
          restoring: false,
          success: "Data restored successfully. Please refresh the page.",
        });
      } catch (err) {
        set({
          restoring: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to restore data",
        });
      }
    },

    deleteAccount: async (confirmation: string) => {
      set({ deleting: true, error: null, success: null });
      try {
        await apiDeleteAccount(confirmation);
        // On successful deletion, clear auth and redirect to login.
        // The backend also adds the current JWT to the Redis blocklist.
        useAuthStore.getState().logout();
        set({
          deleting: false,
          success: "Account deleted. Redirecting to login...",
        });
        // Redirect to login after a brief pause so the user sees the message
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } catch (err) {
        set({
          deleting: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to delete account",
        });
      }
    },

    clearMessages: () => {
      set({ error: null, success: null });
    },
  })
);
