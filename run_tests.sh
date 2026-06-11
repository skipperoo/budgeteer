#!/usr/bin/env bash
# =============================================================
# Budgeteer Test Runner
# Runs all unit and integration tests for both backend and frontend.
# Usage: ./run_tests.sh
# =============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

FAILURES=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════╗"
    echo "║           Budgeteer Test Runner              ║"
    echo "╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_cmd() {
    if ! command -v "$1" &>/dev/null; then
        echo -e "${RED}❌ Required command not found: $1${NC}"
        exit 1
    fi
}

run_step() {
    local name="$1"
    shift
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  ▶ ${name}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if "$@"; then
        echo -e "${GREEN}  ✓ ${name} passed${NC}"
    else
        echo -e "${RED}  ✗ ${name} FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi
}

print_summary() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
    if [ "$FAILURES" -eq 0 ]; then
        echo -e "${GREEN}  All test suites passed!${NC}"
    else
        echo -e "${RED}  ${FAILURES} test suite(s) failed.${NC}"
    fi
    echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
    exit "$FAILURES"
}

# ── Prerequisites ──────────────────────────────────────────
print_banner
echo -e "${YELLOW}Checking prerequisites...${NC}"
check_cmd go
check_cmd node
check_cmd npm

# Check if Docker is available (for testcontainers integration tests)
DOCKER_AVAILABLE=false
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    DOCKER_AVAILABLE=true
    echo -e "${GREEN}  ✓ Docker is available (integration tests will use testcontainers)${NC}"
else
    echo -e "${YELLOW}  ⚠ Docker not detected — integration tests will use"
    echo -e "    TEST_POSTGRES_DSN / TEST_REDIS_ADDR env vars if set."
    echo -e "    See backend/src/internal/testhelpers/integration.go for details.${NC}"
fi

# ── Backend ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Backend (Go)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"

BACKEND_DIR="$SCRIPT_DIR/backend/src"

run_step "Go build"    cd "$BACKEND_DIR" && go build ./...
run_step "Go vet"      cd "$BACKEND_DIR" && go vet ./...
run_step "Go tests (unit + integration)" \
    cd "$BACKEND_DIR" && go test ./internal/... -count=1 -timeout=600s

# ── Frontend ───────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Frontend (TypeScript/React)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════${NC}"

FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Install frontend dependencies first (needed for tsc and vitest)
run_step "npm ci"                            cd "$FRONTEND_DIR" && npm ci
run_step "TypeScript check (tsc --noEmit)"   cd "$FRONTEND_DIR" && npx tsc --noEmit
run_step "Vitest (unit + component tests)"   cd "$FRONTEND_DIR" && npx vitest run

# ── Summary ────────────────────────────────────────────────
print_summary
