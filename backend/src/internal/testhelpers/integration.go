package testhelpers

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"
)

type PostgresResult struct {
	DSN     string
	Cleanup func()
}

type RedisResult struct {
	Host     string
	Port     string
	Password string
	Cleanup  func()
}

const (
	postgresImage    = "timescale/timescaledb:latest-pg18"
	postgresUser     = "budgeteer"
	postgresPassword = "budgeteer_test"
	postgresDB       = "budgeteer"
)

func migrationSQL() (string, error) {
	candidates := []string{
		"migrations/0001_initial.sql",
		"../migrations/0001_initial.sql",
		"../../migrations/0001_initial.sql",
	}
	var data []byte
	var err error
	for _, path := range candidates {
		data, err = os.ReadFile(path)
		if err == nil {
			break
		}
	}
	if err != nil {
		return "", fmt.Errorf("read migration file: %w", err)
	}

	lines := strings.Split(string(data), "\n")
	var filtered []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		lower := strings.ToLower(trimmed)
		if lower == "create extension if not exists timescaledb;" {
			continue
		}
		if strings.HasPrefix(lower, "select create_hypertable") {
			continue
		}
		filtered = append(filtered, line)
	}
	return strings.Join(filtered, "\n"), nil
}

func SetupPostgres(ctx context.Context) (*PostgresResult, error) {
	if dsn := os.Getenv("TEST_POSTGRES_DSN"); dsn != "" {
		return &PostgresResult{DSN: dsn, Cleanup: func() {}}, nil
	}

	ctr, err := postgres.RunContainer(ctx,
		testcontainers.WithImage(postgresImage),
		postgres.WithDatabase(postgresDB),
		postgres.WithUsername(postgresUser),
		postgres.WithPassword(postgresPassword),
		testcontainers.WithWaitStrategyAndDeadline(3*time.Minute,
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(2*time.Minute)),
	)
	if err != nil {
		return nil, fmt.Errorf("start postgres container: %w", err)
	}

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("get connection string: %w", err)
	}

	migration, err := migrationSQL()
	if err != nil {
		ctr.Terminate(ctx)
		return nil, err
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, migration); err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("run migration: %w", err)
	}

	return &PostgresResult{
		DSN: dsn,
		Cleanup: func() {
			ctr.Terminate(ctx)
		},
	}, nil
}

func SetupRedis(ctx context.Context) (*RedisResult, error) {
	if addr := os.Getenv("TEST_REDIS_ADDR"); addr != "" {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("parse TEST_REDIS_ADDR %q: %w", addr, err)
		}
		return &RedisResult{
			Host:     host,
			Port:     port,
			Password: os.Getenv("TEST_REDIS_PASSWORD"),
			Cleanup:  func() {},
		}, nil
	}

	ctr, err := redis.RunContainer(ctx,
		testcontainers.WithWaitStrategyAndDeadline(2*time.Minute,
			wait.ForLog("* Ready to accept connections").
				WithStartupTimeout(1*time.Minute)),
	)
	if err != nil {
		return nil, fmt.Errorf("start redis container: %w", err)
	}

	uri, err := ctr.ConnectionString(ctx)
	if err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("get redis connection string: %w", err)
	}

	u, err := url.Parse(uri)
	if err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("parse redis uri %q: %w", uri, err)
	}

	host, port, err := net.SplitHostPort(u.Host)
	if err != nil {
		ctr.Terminate(ctx)
		return nil, fmt.Errorf("parse redis hostport %q: %w", u.Host, err)
	}

	password, _ := u.User.Password()

	return &RedisResult{
		Host:     host,
		Port:     port,
		Password: password,
		Cleanup: func() {
			ctr.Terminate(ctx)
		},
	}, nil
}

var (
	pgShared     *PostgresResult
	pgSharedErr  error
	pgSharedOnce sync.Once
)

func SetupPostgresOnce(ctx context.Context) (*PostgresResult, error) {
	pgSharedOnce.Do(func() {
		pgShared, pgSharedErr = SetupPostgres(ctx)
	})
	if pgSharedErr != nil {
		return nil, pgSharedErr
	}
	return &PostgresResult{
		DSN: pgShared.DSN,
		Cleanup: func() {}, // container lifecycle managed globally
	}, nil
}
