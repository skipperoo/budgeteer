package database

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

var Redis *redis.Client

func ConnectRedis(ctx context.Context, host, port, password string) error {
	addr := fmt.Sprintf("%s:%s", host, port)

	rdb := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	})

	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("unable to connect to redis: %w", err)
	}

	Redis = rdb
	return nil
}

func CloseRedis() {
	if Redis != nil {
		Redis.Close()
	}
}
