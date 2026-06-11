package service

import (
	"os"
	"testing"
)

func TestGetenvOrDefault(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		def      string
		setup    func()
		expected string
	}{
		{
			name: "env var set",
			key:  "TEST_EXISTING_VAR",
			def:  "default",
			setup: func() {
				os.Setenv("TEST_EXISTING_VAR", "actual-value")
			},
			expected: "actual-value",
		},
		{
			name: "env var not set",
			key:  "TEST_NONEXISTENT_VAR",
			def:  "fallback",
			setup: func() {
				os.Unsetenv("TEST_NONEXISTENT_VAR")
			},
			expected: "fallback",
		},
		{
			name: "env var empty",
			key:  "TEST_EMPTY_VAR",
			def:  "default-on-empty",
			setup: func() {
				os.Setenv("TEST_EMPTY_VAR", "")
			},
			expected: "default-on-empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setup()
			result := GetenvOrDefault(tt.key, tt.def)
			if result != tt.expected {
				t.Fatalf("GetenvOrDefault(%q, %q) = %q, want %q", tt.key, tt.def, result, tt.expected)
			}
		})
	}
}

func TestReadFileOrEnv_EnvVar(t *testing.T) {
	os.Setenv("TEST_READFILE_ENV", "from-env")
	defer os.Unsetenv("TEST_READFILE_ENV")

	result := ReadFileOrEnv("/nonexistent/path", "TEST_READFILE_ENV")
	if result != "from-env" {
		t.Fatalf("ReadFileOrEnv should fall back to env var, got %q", result)
	}
}

func TestReadFileOrEnv_NeitherExists(t *testing.T) {
	os.Unsetenv("TEST_NEITHER_EXISTS")
	result := ReadFileOrEnv("/nonexistent/path/xyz", "TEST_NEITHER_EXISTS")
	if result != "" {
		t.Fatalf("ReadFileOrEnv should return empty when neither exists, got %q", result)
	}
}
