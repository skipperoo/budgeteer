#!/usr/bin/env bash
# =============================================================
# Budgeteer Dev Certificate Generator
#
# Generates a self-signed CA + server certificate for local
# HTTPS development. This enables secure contexts for
# crypto.subtle (Web Crypto API) in the Vite dev server.
#
# Usage:
#   ./gen_certs.sh                      # generate (skips if exists)
#   ./gen_certs.sh --force              # regenerate (overwrites)
#   ./gen_certs.sh --trust              # trust the CA on this system
#   ./gen_certs.sh --force 10.0.0.1     # include extra IP in SAN
#   ./gen_certs.sh --force myhost.local # include extra DNS in SAN
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTS_DIR="$SCRIPT_DIR/certs"
CA_KEY="$CERTS_DIR/ca-key.pem"
CA_CERT="$CERTS_DIR/ca-cert.pem"
SERVER_KEY="$CERTS_DIR/dev-key.pem"
SERVER_CERT="$CERTS_DIR/dev-cert.pem"
SERVER_CSR="$CERTS_DIR/dev-csr.pem"
DAYS=3650          # 10 years for dev certs
RSA_BITS=2048

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Parse args ────────────────────────────────────────────
FORCE=false
TRUST=false
EXTRA_NAMES=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
    --trust) TRUST=true ;;
    --*)     echo -e "${RED}Unknown option: $arg${NC}"; exit 1 ;;
    *)       EXTRA_NAMES+=("$arg") ;;
  esac
done

# ── Pre-checks ────────────────────────────────────────────
if ! command -v openssl &>/dev/null; then
  echo -e "${RED}❌ openssl is required but not found.${NC}"
  exit 1
fi

mkdir -p "$CERTS_DIR"

# ── Trust the CA (if requested) ─────────────────────────
if [ "$TRUST" = true ]; then
  if [ ! -f "$CA_CERT" ]; then
    echo -e "${YELLOW}⚠  CA certificate not found — run without --trust first.${NC}"
    exit 1
  fi
  case "$(uname -s)" in
    Linux)
      if [ -d /usr/local/share/ca-certificates ]; then
        sudo cp "$CA_CERT" /usr/local/share/ca-certificates/budgeteer-dev-ca.crt
        sudo update-ca-certificates
      elif [ -d /usr/share/ca-certificates ]; then
        # Debian/Ubuntu
        sudo cp "$CA_CERT" /usr/local/share/ca-certificates/budgeteer-dev-ca.crt 2>/dev/null ||
          sudo cp "$CA_CERT" /usr/share/ca-certificates/budgeteer-dev-ca.crt
        sudo dpkg-reconfigure ca-certificates 2>/dev/null || sudo update-ca-certificates
      fi
      echo -e "${GREEN}✓ CA trusted (system-wide). You may need to restart your browser.${NC}"
      ;;
    Darwin)
      sudo security add-trusted-cert -d -r trustRoot \
        -k /Library/Keychains/System.keychain "$CA_CERT"
      echo -e "${GREEN}✓ CA trusted (system keychain).${NC}"
      ;;
    *)
      echo -e "${YELLOW}⚠  Unknown OS — trust the CA manually:${NC}"
      echo "   $CA_CERT"
      ;;
  esac
  exit 0
fi

# ── Check existing ──────────────────────────────────────
if [ "$FORCE" = false ] && [ -f "$SERVER_CERT" ] && [ -f "$SERVER_KEY" ]; then
  echo -e "${YELLOW}ℹ  Certificates already exist. Use --force to regenerate.${NC}"
  exit 0
fi

# ── Generate CA ──────────────────────────────────────────
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Generating dev CA key and certificate...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

openssl genrsa -out "$CA_KEY" "$RSA_BITS"
openssl req -x509 -new -nodes \
  -key "$CA_KEY" \
  -sha256 \
  -days "$DAYS" \
  -out "$CA_CERT" \
  -subj "/C=XX/ST=Development/L=Dev/O=Budgeteer/OU=Development/CN=Budgeteer Dev CA"

echo -e "${GREEN}✓ CA created: ${CA_CERT}${NC}"

# ── Generate server key and CSR ─────────────────────────
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  Generating server key and certificate...${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

openssl genrsa -out "$SERVER_KEY" "$RSA_BITS"

# ── Build SAN entries ─────────────────────────────────────
# Default SANs (always included)
DNS_NAMES=(localhost)
IP_NAMES=(127.0.0.1 "::1")

# Sort extra names into DNS vs IP
for name in "${EXTRA_NAMES[@]}"; do
  if [[ "$name" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ "$name" =~ ^:: ]]; then
    IP_NAMES+=("$name")
  else
    DNS_NAMES+=("$name")
  fi
done

# Generate alt_names section for config files
build_alt_names() {
  local idx=1
  for dns in "${DNS_NAMES[@]}"; do
    echo "DNS.$idx = $dns"
    idx=$((idx + 1))
  done
  for ip in "${IP_NAMES[@]}"; do
    echo "IP.$idx = $ip"
    idx=$((idx + 1))
  done
}

ALT_NAMES=$(build_alt_names)

# Create CSR config with SANs
cat > "$CERTS_DIR/csr.conf" <<EOF
[req]
default_bits       = $RSA_BITS
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[dn]
C  = XX
ST = Development
L  = Dev
O  = Budgeteer
OU = Development
CN = ${DNS_NAMES[0]}

[req_ext]
subjectAltName = @alt_names

[alt_names]
${ALT_NAMES}
EOF

openssl req -new \
  -key "$SERVER_KEY" \
  -out "$SERVER_CSR" \
  -config "$CERTS_DIR/csr.conf"

# ── Sign with CA ─────────────────────────────────────────
cat > "$CERTS_DIR/v3.ext" <<EOF
authorityKeyIdentifier = keyid,issuer
basicConstraints       = CA:FALSE
keyUsage               = digitalSignature, keyEncipherment
extendedKeyUsage       = serverAuth
subjectAltName         = @alt_names

[alt_names]
${ALT_NAMES}
EOF

openssl x509 -req \
  -in "$SERVER_CSR" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -CAcreateserial \
  -out "$SERVER_CERT" \
  -days "$DAYS" \
  -sha256 \
  -extfile "$CERTS_DIR/v3.ext"

# Clean up temp files
rm -f "$CERTS_DIR/csr.conf" "$CERTS_DIR/v3.ext" "$CERTS_DIR/ca-cert.srl" "$SERVER_CSR"

echo -e "${GREEN}✓ Server certificate created: ${SERVER_CERT}${NC}"
echo -e "${GREEN}✓ Server key created:           ${SERVER_KEY}${NC}"

# ── Summary ──────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Certificates generated successfully!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  CA certificate:       ${YELLOW}$CA_CERT${NC}"
echo -e "  Server certificate:   ${YELLOW}$SERVER_CERT${NC}"
echo -e "  Server key:           ${YELLOW}$SERVER_KEY${NC}"
echo ""
echo -e "  ${YELLOW}Optional: Trust the CA to avoid browser warnings:${NC}"
echo -e "    ${GREEN}sudo ./gen_certs.sh --trust${NC}"
echo ""
echo -e "  ${YELLOW}Regenerate:${NC}"
echo -e "    ${GREEN}./gen_certs.sh --force${NC}"
echo ""
