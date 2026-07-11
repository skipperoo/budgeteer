const API_BASE = "/api/v1";

function getToken(): string | null {
  try {
    return localStorage.getItem("budgeteer_admin_token");
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem("budgeteer_admin_token", token);
  } catch { /* ignore */ }
}

function removeToken(): void {
  try {
    localStorage.removeItem("budgeteer_admin_token");
  } catch { /* ignore */ }
}

export { getToken, setToken, removeToken, API_BASE };

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    // Token expired or invalid — redirect to login
    removeToken();
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}
