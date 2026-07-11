import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "@/lib/api";
import { UserPlus, Trash2 } from "lucide-react";

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      setAdmins(await apiFetch<AdminUser[]>(`${API_BASE}/admin/auth/list`) ?? []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch(`${API_BASE}/admin/auth/create`, {
        method: "POST",
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      setShowCreate(false);
      setEmail("");
      setPassword("");
      setDisplayName("");
      await fetchAdmins();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this admin?")) return;
    try {
      await apiFetch(`${API_BASE}/admin/auth/${id}`, { method: "DELETE" });
      await fetchAdmins();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Admin Users</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          New Admin
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/50">
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Email</th>
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Display Name</th>
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Must Change Pwd</th>
                <th className="text-left py-2 px-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-b border-border/20 hover:bg-secondary/30">
                  <td className="py-2 px-4 font-medium">{a.email}</td>
                  <td className="py-2 px-4 text-muted-foreground">{a.display_name || "—"}</td>
                  <td className="py-2 px-4">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      a.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200"
                    }`}>
                      {a.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">
                    {a.must_change_password ? "Yes" : "No"}
                  </td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create admin modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="mx-4 w-full max-w-sm bg-card p-6 rounded-lg elevated" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4">Create Admin User</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                />
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-input hover:bg-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
