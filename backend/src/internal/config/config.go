package config

import (
	"os"
)

type Config struct {
	LogLevel      string
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	RedisHost     string
	RedisPort     string
	RedisPassword string
	SMTPHost      string
	SMTPPort      string
	SMTPUser      string
	SMTPPassword  string
	SMTPFrom      string
	SMTPUseSSL    bool
	JWTSecret     string
	JWTSecretPath string
}

var Cfg *Config

func LoadConfig() {
	Cfg = &Config{
		LogLevel:      getenvOrDefault("LOG_LEVEL", "INFO"),
		DBHost:        getenvOrDefault("DB_HOST", "localhost"),
		DBPort:        getenvOrDefault("DB_PORT", "5432"),
		DBUser:        getenvOrDefault("DB_USER", "budgeteer"),
		DBPassword:    readSecret("db_password"),
		DBName:        getenvOrDefault("DB_NAME", "budgeteer"),
		RedisHost:     getenvOrDefault("REDIS_HOST", "localhost"),
		RedisPort:     getenvOrDefault("REDIS_PORT", "6379"),
		RedisPassword: readSecret("redis_password"),
		SMTPHost:      getenvOrDefault("SMTP_HOST", ""),
		SMTPPort:      getenvOrDefault("SMTP_PORT", "587"),
		SMTPUser:      getenvOrDefault("SMTP_USER", ""),
		SMTPPassword:  readSecret("smtp_password"),
		SMTPFrom:      getenvOrDefault("SMTP_FROM", "noreply@budgeteer.app"),
		SMTPUseSSL:    getenvOrDefault("SMTP_SSL", "false") == "true" || getenvOrDefault("SMTP_PORT", "587") == "465",
		JWTSecret:     readSecret("jwt_secret"),
		JWTSecretPath: "/run/secrets/jwt_secret",
	}
}

func getenvOrDefault(key, def string) string {
	val := os.Getenv(key)
	if val == "" {
		return def
	}
	return val
}

func readSecret(name string) string {
	val := readFileOrEnv("/run/secrets/"+name, name)
	if val != "" {
		return val
	}
	return ""
}

func readFileOrEnv(path, envKey string) string {
	data, err := os.ReadFile(path)
	if err == nil && len(data) > 0 {
		return string(data)
	}
	return os.Getenv(envKey)
}
