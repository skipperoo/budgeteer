import { useState } from "react";
import { apiFetch, API_BASE } from "@/lib/api";
import { Send } from "lucide-react";

export default function NotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("admin");
  const [sendEmail, setSendEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [targetEmails, setTargetEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult("");
    setSending(true);
    try {
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
            target_emails: targetEmails
              ? targetEmails.split("\n").map((e) => e.trim()).filter(Boolean)
              : [],
          }),
        }
      );
      setResult(`Dispatched to ${resp.notifications_created} user(s)`);
      setTitle("");
      setBody("");
      setEmailSubject("");
      setEmailBody("");
      setTargetEmails("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

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
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="system">System</option>
            <option value="info">Info</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Target Users</label>
          <p className="text-xs text-muted-foreground">
            Leave empty to send to all users. Enter one email per line for specific users.
          </p>
          <textarea
            value={targetEmails}
            onChange={(e) => setTargetEmails(e.target.value)}
            placeholder="user1@example.com&#10;user2@example.com"
            className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="sendEmail"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="rounded border-input"
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
