// Package crypto provides ECIES (X25519 + AES-256-GCM) encryption helpers
// for the rules system and rule-generated transactions.
//
// Encryption output format:
//
//	"1|" + base64( ephemeral_public_key(32) || iv(12) || ciphertext )
//
// The "1|" prefix distinguishes ECIES payloads from legacy account-key AES-GCM
// (which has no prefix and stores base64( iv(12) || ciphertext )).
// Future versions can use "2|", "3|", etc. for algorithm upgrades.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

const (
	// ECIESPrefixV1 is the string prefix for ECIES v1 encrypted payloads.
	ECIESPrefixV1 = "1|"
	// Ephemeral key size for X25519.
	x25519KeySize = 32
	// AES-GCM nonce size.
	gcmNonceSize = 12
	// AES-GCM tag size.
	gcmTagSize = 16
)

// DeriveKeyFromSharedSecret derives an AES-256-GCM key from an X25519 shared
// secret using HKDF-SHA256, matching the frontend implementation.
func DeriveKeyFromSharedSecret(sharedSecret []byte) ([]byte, error) {
	key, err := hkdf.Key(sha256.New, sharedSecret, nil, "budgeteer-ecies-v1", 32)
	if err != nil {
		return nil, fmt.Errorf("hkdf-derive: %w", err)
	}
	return key, nil
}

// EncryptWithPublicKey encrypts a plaintext using ECIES (X25519 + AES-256-GCM)
// for a recipient identified by their X25519 public key.
//
// Returns a string in the format: "1|" + base64( ephemeral_pub || iv || ciphertext )
func EncryptWithPublicKey(plaintext []byte, recipientPublicKey []byte) (string, error) {
	if len(recipientPublicKey) != x25519KeySize {
		return "", errors.New("invalid recipient public key length")
	}

	curve := ecdh.X25519()
	pubKey, err := curve.NewPublicKey(recipientPublicKey)
	if err != nil {
		return "", fmt.Errorf("import recipient pubkey: %w", err)
	}

	// Generate ephemeral keypair
	ephemeralPriv, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return "", fmt.Errorf("generate ephemeral key: %w", err)
	}
	ephemeralPub := ephemeralPriv.PublicKey()
	ephemeralPubBytes := ephemeralPub.Bytes()

	// ECDH shared secret
	sharedSecret, err := ephemeralPriv.ECDH(pubKey)
	if err != nil {
		return "", fmt.Errorf("ecdh: %w", err)
	}

	// Derive AES key from shared secret
	aesKeyBytes, err := DeriveKeyFromSharedSecret(sharedSecret)
	if err != nil {
		return "", fmt.Errorf("derive key: %w", err)
	}

	// AES-256-GCM encrypt
	block, err := aes.NewCipher(aesKeyBytes)
	if err != nil {
		return "", fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("new gcm: %w", err)
	}

	iv := make([]byte, gcmNonceSize)
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("rand iv: %w", err)
	}

	ciphertext := gcm.Seal(nil, iv, plaintext, nil)

	// Combine: ephemeralPub(32) || iv(12) || ciphertext
	out := make([]byte, 0, x25519KeySize+gcmNonceSize+len(ciphertext))
	out = append(out, ephemeralPubBytes...)
	out = append(out, iv...)
	out = append(out, ciphertext...)

	return ECIESPrefixV1 + base64.StdEncoding.EncodeToString(out), nil
}

// DecryptWithPrivateKey decrypts an ECIES-encrypted payload using the
// recipient's X25519 private key.
//
// Input must be in the format produced by EncryptWithPublicKey ("1|"+base64).
func DecryptWithPrivateKey(ciphertextB64 string, privateKey []byte) ([]byte, error) {
	if len(privateKey) != x25519KeySize {
		return nil, errors.New("invalid private key length")
	}

	// Strip prefix
	raw := ciphertextB64
	if strings.HasPrefix(raw, ECIESPrefixV1) {
		raw = raw[len(ECIESPrefixV1):]
	}

	encrypted, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}

	minLen := x25519KeySize + gcmNonceSize + gcmTagSize
	if len(encrypted) < minLen {
		return nil, errors.New("ciphertext too short")
	}

	offset := 0
	ephemeralPubBytes := encrypted[offset : offset+x25519KeySize]
	offset += x25519KeySize
	iv := encrypted[offset : offset+gcmNonceSize]
	offset += gcmNonceSize
	ciphertext := encrypted[offset:]

	// Import keys
	curve := ecdh.X25519()
	privKey, err := curve.NewPrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("import private key: %w", err)
	}

	ephemeralPub, err := curve.NewPublicKey(ephemeralPubBytes)
	if err != nil {
		return nil, fmt.Errorf("import ephemeral pubkey: %w", err)
	}

	// ECDH shared secret
	sharedSecret, err := privKey.ECDH(ephemeralPub)
	if err != nil {
		return nil, fmt.Errorf("ecdh: %w", err)
	}

	// Derive AES key
	aesKeyBytes, err := DeriveKeyFromSharedSecret(sharedSecret)
	if err != nil {
		return nil, fmt.Errorf("derive key: %w", err)
	}

	// AES-256-GCM decrypt
	block, err := aes.NewCipher(aesKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt: %w", err)
	}

	return plaintext, nil
}

// GenerateServerKeypair generates an X25519 keypair for the rules system.
// Returns (privateKey, publicKey) as raw bytes.
func GenerateServerKeypair() (priv []byte, pub []byte, err error) {
	curve := ecdh.X25519()
	privKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("generate keypair: %w", err)
	}
	return privKey.Bytes(), privKey.PublicKey().Bytes(), nil
}

// PublicKeyFromPrivate derives the X25519 public key from a private key.
func PublicKeyFromPrivate(privateKey []byte) ([]byte, error) {
	if len(privateKey) != x25519KeySize {
		return nil, errors.New("invalid private key length")
	}
	curve := ecdh.X25519()
	privKey, err := curve.NewPrivateKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("import private key: %w", err)
	}
	return privKey.PublicKey().Bytes(), nil
}

// IsECIESPayload checks whether a string is an ECIES-encrypted payload
// (vs legacy account-key AES-GCM).
func IsECIESPayload(payload string) bool {
	return strings.HasPrefix(payload, ECIESPrefixV1)
}
