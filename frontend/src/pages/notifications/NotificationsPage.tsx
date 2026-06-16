import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotificationStore, type NotificationData } from "@/stores/notification-store";
import { useInvitationStore, type Invitation } from "@/stores/invitation-store";
import { useAccountStore } from "@/stores/account-store";
import { encryptForRecipient } from "@/lib/crypto-rules";
import { useRuleStore } from "@/stores/rule-store";
import { formatDate } from "@/lib/format";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Bell,
  ArrowRight,
} from "lucide-react";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    loading: notifLoading,
  } = useNotificationStore();

  const {
    invitations,
    fetchInvitations,
    acceptInvitation,
    declineInvitation,
    loading: invLoading,
    error: invError,
  } = useInvitationStore();

  const { accounts, fetchAccounts } = useAccountStore();
  const { serverPublicKey, fetchServerPublicKey } = useRuleStore();

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [accountDialogInvitation, setAccountDialogInvitation] =
    useState<Invitation | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotifications();
    fetchInvitations();
    fetchUnreadCount();
    fetchAccounts();
  }, []);

  const handleAcceptInvitation = useCallback(
    async (inv: Invitation) => {
      setActionError(null);

      // For rule invitations, require account selection first
      if (inv.entity_type === "rule") {
        setAccountDialogInvitation(inv);
        setSelectedAccountId("");
        return;
      }

      // For account invitations, accept directly
      setAcceptingId(inv.id);
      try {
        await acceptInvitation(inv.id);
        fetchUnreadCount();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to accept invitation",
        );
      } finally {
        setAcceptingId(null);
      }
    },
    [acceptInvitation, fetchUnreadCount],
  );

  const handleAcceptRuleWithAccount = async () => {
    if (!accountDialogInvitation || !selectedAccountId) return;

    setSaving(true);
    setActionError(null);
    try {
      // Encrypt the chosen account ID with the server's public key
      let pubKey = serverPublicKey;
      if (!pubKey) {
        pubKey = await fetchServerPublicKey();
      }
      if (!pubKey) {
        setActionError("Server public key not available");
        setSaving(false);
        return;
      }

      const encryptedAccount = await encryptForRecipient(
        { account_id: selectedAccountId },
        pubKey,
      );

      const id = accountDialogInvitation.id;
      setAccountDialogInvitation(null);
      setAcceptingId(id);
      await acceptInvitation(id, encryptedAccount);
      fetchUnreadCount();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to accept invitation",
      );
    } finally {
      setSaving(false);
      setAcceptingId(null);
    }
  };

  const handleDeclineInvitation = async (inv: Invitation) => {
    setAcceptingId(inv.id);
    setActionError(null);
    try {
      await declineInvitation(inv.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to decline invitation",
      );
    } finally {
      setAcceptingId(null);
    }
  };

  const handleMarkRead = async (id: string) => {
    await markRead(id);
  };

  const loading = notifLoading || invLoading;
  const hasItems =
    notifications.length > 0 || invitations.length > 0;

  const selectStyles =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm">
            Pending invitations and updates
          </p>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {actionError}
        </div>
      )}

      {loading && !hasItems ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !hasItems ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications.</p>
            <p className="text-sm mt-1">
              You'll see invitations and updates here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">
                Pending Invitations
              </h2>
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <Card key={inv.id} className="border-l-4 border-l-primary">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium capitalize">
                            {inv.entity_type === "rule"
                              ? "Rule Invitation"
                              : "Account Invitation"}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            From: {inv.invited_email}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Expires: {formatDate(inv.expires_at)}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handleAcceptInvitation(inv)}
                            disabled={acceptingId === inv.id}
                          >
                            {acceptingId === inv.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                            )}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeclineInvitation(inv)}
                            disabled={acceptingId === inv.id}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          {notifications.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">
                Recent Activity
              </h2>
              <div className="space-y-2">
                {notifications.map((notif) => (
                  <Card
                    key={notif.id}
                    className={`cursor-pointer transition-colors ${
                      !notif.is_read
                        ? "border-l-4 border-l-primary bg-primary/5"
                        : "opacity-70"
                    }`}
                    onClick={() => {
                      if (!notif.is_read) handleMarkRead(notif.id);
                    }}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{notif.title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {notif.body}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(notif.created_at)}
                          </p>
                        </div>
                        {!notif.is_read && (
                          <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account selection dialog for rule invitations */}
      <ResponsiveDialog
        open={!!accountDialogInvitation}
        onOpenChange={(open) => {
          if (!open) setAccountDialogInvitation(null);
        }}
        title="Accept Rule Invitation"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose the account where you want to receive the money.
            The sender will NOT see your account details.
          </p>

          <div className="space-y-1">
            <Label htmlFor="target-account">Target Account</Label>
            <select
              id="target-account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className={selectStyles}
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.currency} ({a.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setAccountDialogInvitation(null)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAcceptRuleWithAccount}
              disabled={!selectedAccountId || saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Accept
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
