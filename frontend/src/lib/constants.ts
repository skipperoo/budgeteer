// Allow overriding the API base URL via VITE_API_BASE env variable.
// In production / same-origin setups, it defaults to "/api/v1".
// In development, set VITE_API_BASE=http://localhost:8080/api/v1 in .env
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

export const ENDPOINTS = {
  register: `${API_BASE}/auth/register`,
  verifyOTP: `${API_BASE}/auth/verify-otp`,
  login: `${API_BASE}/auth/login`,
  loginVerifyOTP: `${API_BASE}/auth/login-verify-otp`,
  logout: `${API_BASE}/auth/logout`,
  keys: `${API_BASE}/auth/keys`,
  me: `${API_BASE}/auth/me`,
  changePassword: `${API_BASE}/auth/password`,
  userLookup: `${API_BASE}/users/lookup`,
  preferences: `${API_BASE}/auth/preferences`,
  syncPull: `${API_BASE}/sync/pull`,
  syncPush: `${API_BASE}/sync/push`,
  accounts: `${API_BASE}/accounts`,
  account: (id: string) => `${API_BASE}/accounts/${id}`,
  accountInvite: (id: string) => `${API_BASE}/accounts/${id}/invite`,
  accountKey: (id: string) => `${API_BASE}/accounts/${id}/key`,
  accountUsers: (id: string) => `${API_BASE}/accounts/${id}/users`,
  accountUser: (aid: string, uid: string) =>
    `${API_BASE}/accounts/${aid}/users/${uid}`,
  transactions: (accountId: string) => `${API_BASE}/accounts/${accountId}/transactions`,
  transaction: (id: string) => `${API_BASE}/transactions/${id}`,
  categories: `${API_BASE}/categories`,
  category: (id: string) => `${API_BASE}/categories/${id}`,
  transactionDocuments: (id: string) => `${API_BASE}/transactions/${id}/documents`,
  transactionDocumentData: (id: string, docId: string) =>
    `${API_BASE}/transactions/${id}/documents/${docId}/data`,
  transactionDocument: (id: string, docId: string) =>
    `${API_BASE}/transactions/${id}/documents/${docId}`,
  rulePublicKey: `${API_BASE}/rules/public-key`,
  rules: `${API_BASE}/rules`,
  rule: (id: string) => `${API_BASE}/rules/${id}`,
  notifications: `${API_BASE}/notifications`,
  notificationCount: `${API_BASE}/notifications/count`,
  notification: (id: string) => `${API_BASE}/notifications/${id}`,
  notificationRead: (id: string) => `${API_BASE}/notifications/${id}/read`,
  invitations: `${API_BASE}/invitations`,
  invitationAccept: (id: string) => `${API_BASE}/invitations/${id}/accept`,
  invitationDecline: (id: string) => `${API_BASE}/invitations/${id}/decline`,
  budgets: `${API_BASE}/budgets`,
  budget: (id: string) => `${API_BASE}/budgets/${id}`,
  budgetNotify: (id: string) => `${API_BASE}/budgets/${id}/notify`,
} as const;
