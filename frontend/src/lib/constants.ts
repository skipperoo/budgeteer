export const API_BASE = "/api/v1";

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
} as const;
