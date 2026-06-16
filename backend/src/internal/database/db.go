package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Connect(ctx context.Context, dsn string) error {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("unable to parse database URL: %w", err)
	}

	config.MaxConns = 20
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return fmt.Errorf("unable to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("unable to ping database: %w", err)
	}

	Pool = pool
	return nil
}

func Close() {
	if Pool != nil {
		Pool.Close()
	}
}

// TxKey is the context key for storing a transaction.
type TxKey struct{}

// WithTx runs the given function within a database transaction.
// If the context already contains a transaction, it reuses it (nested
// transactions use savepoints via pgx).
// Returns the error from fn, rolling back on error or committing on success.
func WithTx(ctx context.Context, fn func(context.Context) error) error {
	// Check if already in a transaction
	if _, ok := ctx.Value(TxKey{}).(pgx.Tx); ok {
		// Already in a transaction — run fn directly (caller manages commit)
		return fn(ctx)
	}

	tx, err := Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	txCtx := context.WithValue(ctx, TxKey{}, tx)
	if err := fn(txCtx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("rollback failed (orig: %w): %v", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}

// Querier is the minimal interface for database operations.
type Querier interface {
	Exec(ctx context.Context, sql string, arguments ...any) (int64, error)
	Query(ctx context.Context, sql string, arguments ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row
}

// commandTagQuerier wraps a pgx-compatible querier that returns pgconn.CommandTag.
type commandTagQuerier interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, arguments ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, arguments ...any) pgx.Row
}

// querierAdapter adapts a commandTagQuerier to our Querier interface.
type querierAdapter struct {
	q commandTagQuerier
}

func (a *querierAdapter) Exec(ctx context.Context, sql string, args ...any) (int64, error) {
	tag, err := a.q.Exec(ctx, sql, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (a *querierAdapter) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return a.q.Query(ctx, sql, args...)
}

func (a *querierAdapter) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return a.q.QueryRow(ctx, sql, args...)
}

// GetQuerier returns a Querier. If the context has a transaction,
// it returns the transaction; otherwise returns the pool.
func GetQuerier(ctx context.Context) Querier {
	if tx, ok := ctx.Value(TxKey{}).(pgx.Tx); ok {
		return &querierAdapter{q: tx}
	}
	return &querierAdapter{q: Pool}
}
