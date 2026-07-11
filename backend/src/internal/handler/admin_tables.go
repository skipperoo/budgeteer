package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"budgeteer-backend/internal/database"
	"budgeteer-backend/internal/model"
)

// AdminListTables returns all public tables with their column metadata.
func AdminListTables(w http.ResponseWriter, r *http.Request) {
	tables, err := getTableInfos(r)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tables)
}

// AdminGetTable returns paginated data for a specific table.
func AdminGetTable(w http.ResponseWriter, r *http.Request) {
	tableName := r.PathValue("name")
	if tableName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "table name is required"})
		return
	}

	// Security: validate table name to prevent SQL injection
	if !isValidTableName(tableName) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid table name"})
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	search := r.URL.Query().Get("search")
	searchCol := r.URL.Query().Get("search_col")

	// Get columns first
	colQuery := `SELECT column_name, data_type, is_nullable,
	              COALESCE(column_default, '') as col_default,
	              (SELECT true FROM information_schema.key_column_usage kcu
	               WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name
	               AND kcu.constraint_name LIKE '%pk%') as is_pk
	           FROM information_schema.columns c
	           WHERE c.table_name = $1 AND c.table_schema = 'public'
	           ORDER BY c.ordinal_position`
	colRows, err := database.Pool.Query(r.Context(), colQuery, tableName)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}
	defer colRows.Close()

	var columns []model.ColumnInfo
	for colRows.Next() {
		ci := model.ColumnInfo{}
		var nullable string
		var colDefault string
		if err := colRows.Scan(&ci.Name, &ci.Type, &nullable, &colDefault, &ci.IsPrimaryKey); err != nil {
			continue
		}
		ci.Nullable = nullable == "YES"
		if colDefault != "" {
			ci.DefaultValue = &colDefault
		}
		columns = append(columns, ci)
	}

	if len(columns) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(model.Error{Error: "table not found"})
		return
	}

	// Count total rows
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM %s`, quoteIdent(tableName))
	if search != "" && searchCol != "" {
		// Validate searchCol to prevent injection
		if isValidColumnName(searchCol, columns) {
			countQuery += fmt.Sprintf(` WHERE %s ILIKE '%%' || $1 || '%%'`, quoteIdent(searchCol))
		}
	}
	var total int64
	if search != "" && searchCol != "" && isValidColumnName(searchCol, columns) {
		err = database.Pool.QueryRow(r.Context(), countQuery, search).Scan(&total)
	} else {
		err = database.Pool.QueryRow(r.Context(), countQuery).Scan(&total)
	}
	if err != nil {
		total = 0
	}

	// Fetch rows
	offset := (page - 1) * pageSize
	colNames := make([]string, len(columns))
	for i, c := range columns {
		colNames[i] = quoteIdent(c.Name)
	}
	dataQuery := fmt.Sprintf(`SELECT %s FROM %s`,
		strings.Join(colNames, ", "), quoteIdent(tableName))
	var dataArgs []any
	argIdx := 1
	if search != "" && searchCol != "" && isValidColumnName(searchCol, columns) {
		dataQuery += fmt.Sprintf(` WHERE %s ILIKE '%%' || $%d || '%%'`, quoteIdent(searchCol), argIdx)
		dataArgs = append(dataArgs, search)
		argIdx++
	}
	dataQuery += fmt.Sprintf(` ORDER BY 1 DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	dataArgs = append(dataArgs, pageSize, offset)

	rows, err := database.Pool.Query(r.Context(), dataQuery, dataArgs...)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}
	defer rows.Close()

	var resultRows []map[string]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			continue
		}
		row := make(map[string]any)
		for i, v := range vals {
			// Convert bytea and other types to strings
			switch val := v.(type) {
			case []byte:
				row[columns[i].Name] = string(val)
			default:
				row[columns[i].Name] = v
			}
		}
		resultRows = append(resultRows, row)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(model.TableDataResponse{
		Columns:  columns,
		Rows:     resultRows,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// AdminUpdateTableRow updates a single row in a table.
func AdminUpdateTableRow(w http.ResponseWriter, r *http.Request) {
	tableName := r.PathValue("name")
	rowID := r.PathValue("id")
	if tableName == "" || rowID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "table name and id are required"})
		return
	}
	if !isValidTableName(tableName) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid table name"})
		return
	}

	var updates map[string]any
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if len(updates) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "no fields to update"})
		return
	}

	setClauses := []string{}
	args := []any{}
	idx := 1
	for k, v := range updates {
		if !isSimpleIdentifier(k) {
			continue
		}
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", quoteIdent(k), idx))
		args = append(args, v)
		idx++
	}
	args = append(args, rowID)
	query := fmt.Sprintf(`UPDATE %s SET %s WHERE id = $%d`,
		quoteIdent(tableName), strings.Join(setClauses, ", "), idx)
	_, err := database.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// AdminDeleteTableRows deletes one or more rows from a table.
func AdminDeleteTableRows(w http.ResponseWriter, r *http.Request) {
	tableName := r.PathValue("name")
	if tableName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "table name is required"})
		return
	}
	if !isValidTableName(tableName) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid table name"})
		return
	}

	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "invalid request body"})
		return
	}
	defer r.Body.Close()

	if len(req.IDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(model.Error{Error: "ids array is empty"})
		return
	}

	// Build WHERE id IN (...)
	placeholders := make([]string, len(req.IDs))
	args := make([]any, len(req.IDs))
	for i, id := range req.IDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}
	query := fmt.Sprintf(`DELETE FROM %s WHERE id IN (%s)`,
		quoteIdent(tableName), strings.Join(placeholders, ", "))
	_, err := database.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(model.Error{Error: err.Error()})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── Helpers ──────────────────────────────────────────────────────────────

func getTableInfos(r *http.Request) ([]model.TableInfo, error) {
	query := `SELECT table_name FROM information_schema.tables
	          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
	          ORDER BY table_name`
	rows, err := database.Pool.Query(r.Context(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []model.TableInfo
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		// Skip internal tables
		if strings.HasPrefix(name, "_") || strings.HasPrefix(name, "pg_") {
			continue
		}

		// Get columns
		colQuery := `SELECT column_name, data_type, is_nullable,
		              COALESCE(column_default, '') as col_default,
		              (SELECT true FROM information_schema.key_column_usage kcu
		               WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name
		               AND kcu.constraint_name LIKE '%pk%') as is_pk
		           FROM information_schema.columns c
		           WHERE c.table_name = $1 AND c.table_schema = 'public'
		           ORDER BY c.ordinal_position`
		colRows, err := database.Pool.Query(r.Context(), colQuery, name)
		if err != nil {
			continue
		}
		var cols []model.ColumnInfo
		for colRows.Next() {
			ci := model.ColumnInfo{}
			var nullable string
			var colDefault string
			var isPK bool
			if err := colRows.Scan(&ci.Name, &ci.Type, &nullable, &colDefault, &isPK); err != nil {
				continue
			}
			ci.Nullable = nullable == "YES"
			ci.IsPrimaryKey = isPK
			if colDefault != "" {
				ci.DefaultValue = &colDefault
			}
			// Check foreign key
			ci.IsForeignKey, ci.FKRefTable, ci.FKRefColumn = checkForeignKey(r.Context(), name, ci.Name)
			cols = append(cols, ci)
		}
		colRows.Close()

		// Count rows
		var count int64
		database.Pool.QueryRow(r.Context(), fmt.Sprintf(`SELECT COUNT(*) FROM %s`, quoteIdent(name))).Scan(&count)

		tables = append(tables, model.TableInfo{
			Name:     name,
			Columns:  cols,
			RowCount: count,
		})
	}
	return tables, nil
}

func checkForeignKey(ctx context.Context, table, column string) (bool, *string, *string) {
	query := `SELECT
	            ccu.table_name AS ref_table,
	            ccu.column_name AS ref_column
	          FROM information_schema.key_column_usage kcu
	          JOIN information_schema.constraint_column_usage ccu
	            ON kcu.constraint_name = ccu.constraint_name
	          WHERE kcu.table_name = $1 AND kcu.column_name = $2
	            AND kcu.position_in_unique_constraint IS NOT NULL`
	var refTable, refColumn string
	err := database.Pool.QueryRow(ctx, query, table, column).Scan(&refTable, &refColumn)
	if err != nil {
		return false, nil, nil
	}
	return true, &refTable, &refColumn
}

func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

func isValidTableName(name string) bool {
	if name == "" || len(name) > 100 {
		return false
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return !strings.HasPrefix(name, "_") && !strings.HasPrefix(name, "pg_")
}

func isValidColumnName(name string, columns []model.ColumnInfo) bool {
	for _, c := range columns {
		if c.Name == name {
			return true
		}
	}
	return false
}

func isSimpleIdentifier(s string) bool {
	if s == "" || len(s) > 100 {
		return false
	}
	for _, c := range s {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_') {
			return false
		}
	}
	return true
}
