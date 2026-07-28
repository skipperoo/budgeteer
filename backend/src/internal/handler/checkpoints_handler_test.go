package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
	"budgeteer-backend/internal/service"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestListCheckpointsHandler_Happy(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-cp-list@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	now := time.Now().UTC()
	// Insert two checkpoint rows directly.
	months := []string{"2025-07-31", "2025-08-31"}
	for _, m := range months {
		_, err := database.Pool.Exec(context.Background(),
			`INSERT INTO transactions_checkpoints (account_id, checkpoint_month, encrypted_balance, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			account.ID, m, "encrypted-data", now, now)
		if err != nil {
			t.Fatalf("Failed to seed checkpoint %s: %v", m, err)
		}
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/accounts/"+account.ID+"/checkpoints", nil)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListCheckpoints(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string][]*model.Checkpoint
	json.NewDecoder(w.Body).Decode(&resp)
	cps := resp["checkpoints"]
	if len(cps) != 2 {
		t.Fatalf("Expected 2 checkpoints, got %d", len(cps))
	}
	if cps[0].CheckpointMonth != "2025-07-31" {
		t.Fatalf("Expected first CP month 2025-07-31, got %s", cps[0].CheckpointMonth)
	}
	if cps[1].CheckpointMonth != "2025-08-31" {
		t.Fatalf("Expected second CP month 2025-08-31, got %s", cps[1].CheckpointMonth)
	}
}

func TestListCheckpointsHandler_AccessDenied(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	owner, _, _ := createHandlerTestUser(t, "handler-cp-owner@test.com")
	other, _, _ := createHandlerTestUser(t, "handler-cp-other@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	// Insert one checkpoint.
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO transactions_checkpoints (account_id, checkpoint_month, encrypted_balance, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		account.ID, "2025-07-31", "enc", time.Now().UTC(), time.Now().UTC())
	if err != nil {
		t.Fatalf("Failed to seed checkpoint: %v", err)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/accounts/"+account.ID+"/checkpoints", nil)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, other.ID, other.Email))
	ListCheckpoints(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden, got %d", w.Code)
	}
}

func TestUpsertCheckpointsHandler_InsertThenUpdate(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-cp-upsert@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	// Insert.
	body1 := model.UpsertCheckpointsRequest{
		Checkpoints: []model.CheckpointInput{
			{CheckpointMonth: "2025-07-31", EncryptedBalance: "v1"},
		},
	}
	w := httptest.NewRecorder()
	req := request("PUT", "/v1/accounts/"+account.ID+"/checkpoints", body1)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	UpsertCheckpoints(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on insert, got %d: %s", w.Code, w.Body.String())
	}

	// Update same month with a new encrypted_balance.
	body2 := model.UpsertCheckpointsRequest{
		Checkpoints: []model.CheckpointInput{
			{CheckpointMonth: "2025-07-31", EncryptedBalance: "v2"},
		},
	}
	w2 := httptest.NewRecorder()
	req2 := request("PUT", "/v1/accounts/"+account.ID+"/checkpoints", body2)
	req2.SetPathValue("id", account.ID)
	req2 = req2.WithContext(authenticatedContext(t, user.ID, user.Email))
	UpsertCheckpoints(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 on update, got %d: %s", w2.Code, w2.Body.String())
	}

	// GET and verify the value is the new one.
	w3 := httptest.NewRecorder()
	req3 := httptest.NewRequest("GET", "/v1/accounts/"+account.ID+"/checkpoints", nil)
	req3.SetPathValue("id", account.ID)
	req3 = req3.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListCheckpoints(w3, req3)

	var resp map[string][]*model.Checkpoint
	json.NewDecoder(w3.Body).Decode(&resp)
	cps := resp["checkpoints"]
	if len(cps) != 1 {
		t.Fatalf("Expected 1 checkpoint, got %d", len(cps))
	}
	if cps[0].EncryptedBalance != "v2" {
		t.Fatalf("Expected encrypted_balance 'v2', got %q", cps[0].EncryptedBalance)
	}
}

func TestUpsertCheckpointsHandler_MaxRows(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-cp-max@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	// Try 401 rows.
	items := make([]model.CheckpointInput, 401)
	for i := 0; i < 401; i++ {
		month := time.Date(2020, 1, 31, 0, 0, 0, 0, time.UTC).AddDate(0, i, 0)
		items[i] = model.CheckpointInput{CheckpointMonth: month.Format("2006-01-02"), EncryptedBalance: "x"}
	}

	w := httptest.NewRecorder()
	req := request("PUT", "/v1/accounts/"+account.ID+"/checkpoints", model.UpsertCheckpointsRequest{Checkpoints: items})
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	UpsertCheckpoints(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for >400 rows, got %d: %s", w.Code, w.Body.String())
	}
}

func TestVerifyCheckpointsHandler_Counts(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-cp-verify@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	// Insert 3 transactions across 3 different months (Feb, Mar, Apr 2025).
	times := []string{
		"2025-02-15T10:00:00Z",
		"2025-03-10T12:00:00Z",
		"2025-04-20T08:00:00Z",
	}
	for _, tms := range times {
		pt, _ := time.Parse(time.RFC3339, tms)
		uid := uuid.New().String()
		_, err := database.Pool.Exec(context.Background(),
			`INSERT INTO transactions (id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())`,
			uid, pt, account.ID, user.ID, "enc")
		if err != nil {
			t.Fatalf("Failed to seed transaction at %s: %v", tms, err)
		}
	}

	// Verify counts going into April should show 3 cumulative.
	body := model.VerifyCheckpointsRequest{
		Months: []string{"2025-04-30"},
	}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/accounts/"+account.ID+"/checkpoints/verify", body)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	VerifyCheckpoints(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.VerifyCheckpointsResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp.Counts) != 1 {
		t.Fatalf("Expected 1 count result, got %d", len(resp.Counts))
	}
	if resp.Counts[0].TxCount != 3 {
		t.Fatalf("Expected tx_count 3 through 2025-04-30, got %d", resp.Counts[0].TxCount)
	}

	// Also verify February alone (month boundary: only Feb tx).
	body2 := model.VerifyCheckpointsRequest{
		Months: []string{"2025-02-28"},
	}
	w2 := httptest.NewRecorder()
	req2 := request("POST", "/v1/accounts/"+account.ID+"/checkpoints/verify", body2)
	req2.SetPathValue("id", account.ID)
	req2 = req2.WithContext(authenticatedContext(t, user.ID, user.Email))
	VerifyCheckpoints(w2, req2)

	var resp2 model.VerifyCheckpointsResponse
	json.NewDecoder(w2.Body).Decode(&resp2)
	if resp2.Counts[0].TxCount != 1 {
		t.Fatalf("Expected tx_count 1 through 2025-02-28, got %d", resp2.Counts[0].TxCount)
	}
}

func TestVerifyCheckpointsHandler_AccessDenied(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	owner, _, _ := createHandlerTestUser(t, "handler-cp-verify-own@test.com")
	other, _, _ := createHandlerTestUser(t, "handler-cp-verify-oth@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	body := model.VerifyCheckpointsRequest{Months: []string{"2025-07-31"}}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/accounts/"+account.ID+"/checkpoints/verify", body)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, other.ID, other.Email))
	VerifyCheckpoints(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden, got %d", w.Code)
	}
}

func TestListTransactionsHandler_FromToFilter(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	user, _, _ := createHandlerTestUser(t, "handler-tx-fromto@test.com")
	service.InitAccountService()
	account, _ := service.Accounts.Create(context.Background(), user.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "personal"})

	// Insert 3 transactions in Jan, Feb, Mar 2025.
	dates := map[string]string{
		"2025-01-15T00:00:00Z": "Jan-tx",
		"2025-02-10T00:00:00Z": "Feb-tx",
		"2025-03-20T00:00:00Z": "Mar-tx",
	}
	for tms, payload := range dates {
		pt, _ := time.Parse(time.RFC3339, tms)
		_, err := database.Pool.Exec(context.Background(),
			`INSERT INTO transactions (id, time, account_id, created_by, encrypted_payload, version, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW())`,
			uuid.New().String(), pt, account.ID, user.ID, payload)
		if err != nil {
			t.Fatalf("Failed to seed tx at %s: %v", tms, err)
		}
	}

	// Fetch only February.
	url := "/v1/accounts/" + account.ID + "/transactions?from=2025-02-01T00:00:00Z&to=2025-02-28T23:59:59Z"
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", url, nil)
	req.SetPathValue("id", account.ID)
	req = req.WithContext(authenticatedContext(t, user.ID, user.Email))
	ListTransactions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var txs []*model.Transaction
	json.NewDecoder(w.Body).Decode(&txs)
	if len(txs) != 1 {
		t.Fatalf("Expected 1 tx in Feb, got %d", len(txs))
	}
	if txs[0].EncryptedPayload != "Feb-tx" {
		t.Fatalf("Expected 'Feb-tx', got %q", txs[0].EncryptedPayload)
	}
}

func TestSyncPushHandler_CheckpointFanOut(t *testing.T) {
	cleanup := handlerSetupTest(t)
	defer cleanup()

	service.InitAccountService()
	service.InitSyncService()

	owner, _, _ := createHandlerTestUser(t, "handler-cp-sync-owner@test.com")
	member, _, _ := createHandlerTestUser(t, "handler-cp-sync-member@test.com")

	// Create a joint account.
	account, _ := service.Accounts.Create(context.Background(), owner.ID, &model.CreateAccountRequest{Currency: "EUR", Type: "joint"})

	// Add member via direct account_users insert (same pattern as InviteToAccount).
	_, err := database.Pool.Exec(context.Background(),
		`INSERT INTO account_users (account_id, user_id, encrypted_account_key, role, status, joined_at)
		 VALUES ($1, $2, $3, 'member', 'active', NOW())`,
		account.ID, member.ID, "enc-key:value")
	if err != nil {
		t.Fatalf("Failed to add member: %v", err)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	ops := model.SyncPushRequest{
		Operations: []model.SyncOperation{
			{
				Action:           "UPDATE",
				EntityType:       "checkpoint",
				EntityID:         account.ID + "-2025-07",
				AccountID:        account.ID,
				CheckpointMonth:  "2025-07-31",
				EncryptedPayload: "enc-checkpoint-balance",
				Timestamp:        now,
			},
		},
	}
	w := httptest.NewRecorder()
	req := request("POST", "/v1/sync/push", ops)
	req = req.WithContext(authenticatedContext(t, owner.ID, owner.Email))
	SyncPush(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Member should now have a sync_queue item for checkpoint entity_type.
	var sq []*model.SyncQueueItem
	err = database.Pool.QueryRow(context.Background(),
		`SELECT id, target_user_id, entity_type, checkpoint_month, encrypted_payload, source_updated_at
		 FROM sync_queue WHERE target_user_id = $1 AND entity_type = 'checkpoint' LIMIT 1`,
		member.ID,
	).Scan(&sq, &sq, &sq, &sq, &sq, &sq) // dummy — use a proper scan below

	// Proper scan loop:
	rows, err := database.Pool.Query(context.Background(),
		`SELECT id, target_user_id, entity_type, checkpoint_month, encrypted_payload, source_updated_at
		 FROM sync_queue WHERE target_user_id = $1 AND entity_type = 'checkpoint'`,
		member.ID)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("Expected at least one sync_queue item for the member, got none")
	}
	var itemID, targetID, etype, encPayload string
	var cpMonth pgtype.Date
	var srcUpdatedAt *time.Time
	if err := rows.Scan(&itemID, &targetID, &etype, &cpMonth, &encPayload, &srcUpdatedAt); err != nil {
		t.Fatalf("Scan failed: %v", err)
	}
	if etype != "checkpoint" {
		t.Fatalf("Expected entity_type 'checkpoint', got %q", etype)
	}
	if !cpMonth.Valid || cpMonth.Time.Format("2006-01-02") != "2025-07-31" {
		t.Fatalf("Expected checkpoint_month '2025-07-31', got %v", cpMonth.Time.Format("2006-01-02"))
	}
	if encPayload != "enc-checkpoint-balance" {
		t.Fatalf("Expected encrypted_payload 'enc-checkpoint-balance', got %q", encPayload)
	}
	if srcUpdatedAt == nil {
		t.Fatal("Expected source_updated_at to be non-nil")
	}
	if rows.Next() {
		t.Fatal("Expected exactly one sync item for the member, got more")
	}
}