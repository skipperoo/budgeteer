import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccountStore } from "@/stores/account-store";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { ENDPOINTS } from "@/lib/constants";
import { generateAccountKey, encryptAccountKeyForRecipient } from "@/lib/crypto";

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accounts, accountUsers, fetchAccountUsers, inviteUser, removeUser } = useAccountStore();
  const account = accounts.find((a) => a.id === id);
  const currentUser = useAuthStore((s) => s.user);
  const [inviteEmail, setInviteEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (id) fetchAccountUsers(id);
  }, [id, fetchAccountUsers]);

  const handleInvite = async () => {
    if (!id) return;
    setError("");
    setInviting(true);

    try {
      // 1. Fetch the invitee's public key
      const { public_key } = await apiFetch<{ public_key: string }>(
        `${ENDPOINTS.userLookup}?email=${encodeURIComponent(inviteEmail)}`
      );

      // 2. Generate a fresh AES-256 Account Key for this account (if it doesn't exist
      //    we generate one; the owner creates it on first invite).
      //    In a full implementation the Account Key would be stored and reused.
      const accountKey = generateAccountKey();

      // 3. Encrypt the Account Key via ECIES (X25519 + AES-GCM) using the invitee's public key
      const encrypted = await encryptAccountKeyForRecipient(accountKey, public_key);

      // 4. Send the ephemeral public key + ciphertext to the backend
      //    Format: base64(ephemeralPublicKey) + ":" + base64(ciphertext)
      const encryptedAccountKey = `${encrypted.ephemeralPublicKey}:${encrypted.ciphertext}`;

      await inviteUser(id, inviteEmail, encryptedAccountKey);
      setOpen(false);
      setInviteEmail("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviting(false);
    }
  };

  if (!account) {
    return <p className="text-muted-foreground">Account not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{account.currency}</h1>
          <p className="text-sm text-muted-foreground capitalize">{account.type} account</p>
        </div>
        {account.type === "joint" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Invite User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite to Account</DialogTitle>
              </DialogHeader>
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
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button onClick={handleInvite} className="w-full" disabled={inviting}>
                  {inviting ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

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
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div>
                    <span className="text-sm font-medium capitalize">{user.role}</span>
                    <span className="text-xs text-muted-foreground ml-2">
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
    </div>
  );
}
