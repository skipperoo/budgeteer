import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "@/lib/api";
import { Send, Search } from "lucide-react";

interface UserEntry {
  id: string;
  email: string;
}

export default function NotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("admin");
  const [sendEmail, setSendEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendToAll, setSendToAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<UserEntry[]>(`${API_BASE}/users`).then(setUsers).catch(console.error);
  }, []);

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult("");
    setSending(true);
    try {
      const targetEmails = sendToAll
        ? []
        : users.filter((u) => selected.has(u.id)).map((u) => u.email);

      if (!sendToAll && targetEmails.length === 0) {
        throw new Error("Select at least one user or enable 'All users'");
      }

      const resp = await apiFetch<{ status: string; notifications_created: number }>(
        `${API_BASE}/dispatch`,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            body,
            type,
            send_email: sendEmail,
            email_subject: emailSubject || title,
            email_body: emailBody || body,
            target_emails: targetEmails,
          }),
        }
      );
      setResult(`Dispatched to ${resp.notifications_created} user(s)`);
      setTitle("");
      setBody("");
      setEmailSubject("");
      setEmailBody("");
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Dispatch Notifications & Emails</h1>

      <form onSubmit={handleDispatch} className="bg-card border border-border/50 rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Body *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Type</label>
          <p className="text-xs text-muted-foreground mb-2">
            Categorises the notification. "Admin" for system-wide announcements,
            "System" for technical notices, "Info" for general information.
          </p>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="admin">Admin — system-wide announcements</option>
            <option value="system">System — technical notices</option>
            <option value="info">Info — general information</option>
          </select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Target Users</label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendToAll}
                onChange={(e) => setSendToAll(e.target.checked)}
              />
              All users
            </label>
          </div>

          {!sendToAll && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full h-8 pl-8 rounded-md border border-input bg-background text-xs"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border border-border/50 rounded-lg divide-y divide-border/20">
                {filtered.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                    />
                    {u.email}
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground italic">No users found</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {selected.size} user{selected.size !== 1 ? "s" : ""} selected
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="sendEmail"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          <label htmlFor="sendEmail" className="text-sm font-medium">Also send as email</label>
        </div>

        {sendEmail && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Subject</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder={title}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Body</label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder={body}
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && <p className="text-sm text-green-600 dark:text-green-400">{result}</p>}

        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending..." : "Dispatch"}
        </button>
      </form>
    </div>
  );
}
