export type AccountType = "personal" | "joint" | "savings";

export interface UserPreferences {
  accent_color: string;
  default_commission?: number;
  default_currency?: string;
  locale?: string;
  theme?: "light" | "dark";
}

export interface User {
  id: string;
  email: string;
  public_key: string;
  encrypted_private_key: string;
  is_verified: boolean;
  preferences: UserPreferences;
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  type: AccountType;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface AccountUser {
  account_id: string;
  user_id: string;
  encrypted_account_key: string;
  role: string;
  status: string;
  joined_at: string;
}

export interface Transaction {
  id: string;
  time: string;
  account_id: string;
  created_by: string;
  encrypted_payload: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface SyncQueueItem {
  id: string;
  target_user_id: string;
  account_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  encrypted_payload?: string;
  created_at: string;
  consumed_at?: string;
}

export interface SyncOperation {
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string;
  encrypted_payload: string;
  timestamp: string;
}

export interface LoginResponse {
  token: string;
}

export interface LoginInitResponse {
  session_id: string;
}

export interface KeysResponse {
  encrypted_private_key: string;
}

export interface UserCategory {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  color?: string | null;
  icon?: string | null;
  is_disabled: boolean;
  created_at: string;
}

export interface CreateAccountRequest {
  name: string;
  currency: string;
  type: string;
  encrypted_account_key: string;
}

export interface CreateTransactionRequest {
  time: string;
  encrypted_payload: string;
}

export interface SyncPullResponse {
  items: SyncQueueItem[];
  next_cursor?: string;
  has_more: boolean;
}

export interface DocumentMetadata {
  id: string;
  transaction_id: string;
  mime_type: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface DocumentDataResponse {
  id: string;
  encrypted_data: string;
  mime_type: string;
  file_name: string;
}

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  account_id?: string;
  encrypted_payload: string;
  period: "monthly" | "yearly";
  start_date: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetPayload {
  amount: number;
  category?: string;
}

export interface CreateBudgetRequest {
  name: string;
  account_id?: string;
  encrypted_payload: string;
  period: "monthly" | "yearly";
  start_date: string;
  end_date?: string;
}

export interface UpdateBudgetRequest {
  name?: string;
  account_id?: string;
  encrypted_payload?: string;
  period?: "monthly" | "yearly";
  start_date?: string;
  end_date?: string;
}
