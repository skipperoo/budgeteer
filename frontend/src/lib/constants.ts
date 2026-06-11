export const API_BASE = "/api/v1";

export const ENDPOINTS = {
  register: `${API_BASE}/auth/register`,
  verifyOTP: `${API_BASE}/auth/verify-otp`,
  login: `${API_BASE}/auth/login`,
  logout: `${API_BASE}/auth/logout`,
  keys: `${API_BASE}/auth/keys`,
  me: `${API_BASE}/auth/me`,
  changePassword: `${API_BASE}/auth/password`,
  userLookup: `${API_BASE}/users/lookup`,
  syncPull: `${API_BASE}/sync/pull`,
  syncPush: `${API_BASE}/sync/push`,
  accounts: `${API_BASE}/accounts`,
  account: (id: string) => `${API_BASE}/accounts/${id}`,
  accountInvite: (id: string) => `${API_BASE}/accounts/${id}/invite`,
  accountUsers: (id: string) => `${API_BASE}/accounts/${id}/users`,
  accountUser: (aid: string, uid: string) =>
    `${API_BASE}/accounts/${aid}/users/${uid}`,
} as const;
