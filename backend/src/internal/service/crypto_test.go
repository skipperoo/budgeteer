package service

import (
	"testing"
)

func TestHashPasswordAndCheck(t *testing.T) {
	password := "MySecureP@ss123!"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("HashPassword returned empty hash")
	}
	if !CheckPasswordHash(password, hash) {
		t.Fatal("CheckPasswordHash should return true for correct password")
	}
}

func TestCheckPasswordHash_WrongPassword(t *testing.T) {
	hash, _ := HashPassword("correct-password")
	if CheckPasswordHash("wrong-password", hash) {
		t.Fatal("CheckPasswordHash should return false for wrong password")
	}
}

func TestCheckPasswordHash_EmptyHash(t *testing.T) {
	if CheckPasswordHash("password", "") {
		t.Fatal("CheckPasswordHash should return false for empty hash")
	}
}

func TestHashPassword_EmptyString(t *testing.T) {
	hash, err := HashPassword("")
	if err != nil {
		t.Fatalf("HashPassword failed for empty string: %v", err)
	}
	if hash == "" {
		t.Fatal("HashPassword returned empty hash for empty password")
	}
}

func TestHashPassword_ProducesDifferentHashes(t *testing.T) {
	hash1, _ := HashPassword("same-password")
	hash2, _ := HashPassword("same-password")
	if hash1 == hash2 {
		t.Fatal("HashPassword should produce different hashes due to random salt")
	}
}

func TestHashPassword_VerifyRoundTrip(t *testing.T) {
	passwords := []string{"a", "password", "very-long-password-123!@#$%^&*()", "   spaces   ", "unicode-pässwörd"}
	for _, pw := range passwords {
		hash, err := HashPassword(pw)
		if err != nil {
			t.Errorf("HashPassword(%q) failed: %v", pw, err)
			continue
		}
		if !CheckPasswordHash(pw, hash) {
			t.Errorf("CheckPasswordHash failed round-trip for password %q", pw)
		}
	}
}
