package service

import (
	"os"
)

func GetenvOrDefault(key, def string) string {
	val := os.Getenv(key)
	if val == "" {
		return def
	}
	return val
}

func ReadFileOrEnv(path, envKey string) string {
	data, err := os.ReadFile(path)
	if err == nil && len(data) > 0 {
		return string(data)
	}
	return os.Getenv(envKey)
}
