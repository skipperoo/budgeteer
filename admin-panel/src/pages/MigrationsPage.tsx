import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "@/lib/api";
import { RefreshCw, RotateCcw } from "lucide-react";

interface ClientMigration {
  id: string;
  user_id: string;
  user_email: string;
  migration_key: string;
  status: string;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export default function MigrationsPage() {
  const [migrations, setMigrations] = useState<ClientMigration[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleKey, setRescheduleKey] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const fetchMigrations = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ClientMigration[]>(`${API_BASE}/admin/client-migrations`);
      setMigrations(data ?? []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMigrations();
  }, []);

  const handleBulkReschedule = async () => {
    if (!rescheduleKey.trim()) return;
    setStatusMsg(`Rescheduling "${rescheduleKey.trim()}"...`);
    try {
      await apiFetch(`${API_BASE}/admin/client-migrations/reschedule`, {
        method: "POST",
        body: JSON.stringify({ migration_key: rescheduleKey.trim() }),
      });
      setStatusMsg("Rescheduled — refreshing...");
      setRescheduleKey("");
      await fetchMigrations();
      setStatusMsg("");
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
  };

  const handleEditStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`${API_BASE}/admin/client-migrations/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      await fetchMigrations();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Group by user
  const grouped: Record<string, ClientMigration[]> = {};
  for (const m of migrations) {
    const key = `${m.user_email} (${m.user_id.slice(0, 8)}...)`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Client-Side Migrations</h1>
        <button
          onClick={fetchMigrations}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-input text-sm font-medium hover:bg-secondary transition-colors cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Bulk reschedule */}
      <div className="bg-card border border-border/50 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2">Bulk Reschedule Migration</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rescheduleKey}
            onChange={(e) => setRescheduleKey(e.target.value)}
            placeholder="e.g. add_category_id"
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button
            onClick={handleBulkReschedule}
            disabled={!rescheduleKey.trim()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            Reschedule for All
          </button>
        </div>
        {statusMsg && <p className="text-xs text-muted-foreground mt-2">{statusMsg}</p>}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-muted-foreground italic">No migrations found.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([user, records]) => (
            <div key={user} className="bg-card border border-border/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">{user}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Migration Key</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Error</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Created</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((m) => (
                      <tr key={m.id} className="border-b border-border/20">
                        <td className="py-1.5 px-2 font-mono">{m.migration_key}</td>
                        <td className="py-1.5 px-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            m.status === "completed"
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                              : m.status === "failed"
                              ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                          }`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-muted-foreground max-w-[200px] truncate">
                          {m.error_message ?? "—"}
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditStatus(m.id, "pending")}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-secondary hover:bg-secondary/80 cursor-pointer"
                            >
                              Re-queue
                            </button>
                            <button
                              onClick={() => handleEditStatus(m.id, "completed")}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 cursor-pointer"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => handleEditStatus(m.id, "failed")}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 cursor-pointer"
                            >
                              Fail
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
