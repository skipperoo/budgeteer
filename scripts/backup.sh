#!/usr/bin/env bash
# ===========================================================================
# scripts/backup.sh — Budgeteer Production Backup
#
# Creates a timestamped archive of all Docker named volumes and the secrets/
# directory. Stops the stack before backing up to ensure consistency, then
# restarts it.
#
# Usage:
#   ./scripts/backup.sh                        # saves to ./backups/
#   ./scripts/backup.sh -d /path/to/backups    # saves to custom dir
#   ./scripts/backup.sh --no-stop              # live backup (risk of inconsistency)
#
# Environment:
#   COMPOSE_FILE  — alternate compose file (default: docker-compose.yml)
#   COMPOSE_PROJECT_NAME — Docker Compose project name (default: budgeteer)
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────
DEST_DIR="${DEST_DIR:-${PROJECT_DIR}/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-budgeteer}"
NO_STOP=false

# ── Parse arguments ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dest)
      DEST_DIR="$2"
      shift 2
      ;;
    --no-stop)
      NO_STOP=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [-d <dir>] [--no-stop]"
      echo ""
      echo "  -d, --dest <dir>   Backup destination directory (default: ./backups/)"
      echo "  --no-stop          Skip stopping containers (live backup — risky)"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [-d <dir>] [--no-stop]"
      exit 1
      ;;
  esac
done

# ── Setup ──────────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${DEST_DIR}/${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

echo "==========================================="
echo " Budgeteer Backup"
echo "==========================================="
echo "  Timestamp:   ${TIMESTAMP}"
echo "  Destination: ${BACKUP_DIR}"
echo "  Compose file: ${COMPOSE_FILE}"
echo "  No-stop:     ${NO_STOP}"
echo ""

# ── Stop the stack ────────────────────────────────────────────────────────
if [[ "$NO_STOP" == "false" ]]; then
  echo "► Stopping Docker Compose stack..."
  (cd "$PROJECT_DIR" && docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down) || {
    echo "⚠  Warning: Failed to stop stack. Proceeding with caution..."
  }
else
  echo "► Skipping container stop (--no-stop). Data may be inconsistent."
fi

# ── Backup Docker named volumes ────────────────────────────────────────────
echo "► Backing up Docker named volumes..."

VOLUMES=("pg_data" "redis_data")
for vol in "${VOLUMES[@]}"; do
  # Check if the volume exists
  if docker volume ls -q | grep -q "^${COMPOSE_PROJECT}_${vol}$"; then
    echo "   → ${COMPOSE_PROJECT}_${vol} ..."
    docker run --rm \
      -v "${COMPOSE_PROJECT}_${vol}:/source:ro" \
      -v "${BACKUP_DIR}:/dest" \
      alpine:latest \
      tar czf "/dest/${vol}.tar.gz" -C /source . || {
        echo "⚠  Warning: Failed to back up volume ${vol}"
      }
  elif docker volume ls -q | grep -q "^${vol}$"; then
    echo "   → ${vol} (legacy name) ..."
    docker run --rm \
      -v "${vol}:/source:ro" \
      -v "${BACKUP_DIR}:/dest" \
      alpine:latest \
      tar czf "/dest/${vol}.tar.gz" -C /source . || {
        echo "⚠  Warning: Failed to back up volume ${vol}"
      }
  else
    echo "   ⚠  Volume ${COMPOSE_PROJECT}_${vol} not found — skipping"
  fi
done

# ── Backup secrets ─────────────────────────────────────────────────────────
if [[ -d "${PROJECT_DIR}/secrets" ]]; then
  echo "► Backing up secrets/ ..."
  tar czf "${BACKUP_DIR}/secrets.tar.gz" -C "$PROJECT_DIR" secrets/
else
  echo "⚠  secrets/ directory not found — skipping"
fi

# ── Backup compose file (for reference during restore) ────────────────────
if [[ -f "${PROJECT_DIR}/${COMPOSE_FILE}" ]]; then
  cp "${PROJECT_DIR}/${COMPOSE_FILE}" "${BACKUP_DIR}/docker-compose.yml"
fi

# ── Backup migration files (for reference) ─────────────────────────────────
if [[ -d "${PROJECT_DIR}/backend/src/migrations" ]]; then
  tar czf "${BACKUP_DIR}/migrations.tar.gz" \
    -C "$PROJECT_DIR" \
    backend/src/migrations/
fi

# ── Create a manifest ──────────────────────────────────────────────────────
cat > "${BACKUP_DIR}/MANIFEST.txt" <<EOF
Budgeteer Backup — ${TIMESTAMP}
================================
Created by: scripts/backup.sh
Docker Compose project: ${COMPOSE_PROJECT}
Compose file: ${COMPOSE_FILE}

Contents:
$(for f in "${BACKUP_DIR}"/*.tar.gz; do
  echo "  $(basename "$f")  ($(du -h "$f" | cut -f1))"
done)
  docker-compose.yml

Restore with: scripts/restore.sh -s ${BACKUP_DIR}
EOF

echo ""
echo "► Manifest:"
cat "${BACKUP_DIR}/MANIFEST.txt"

# ── Restart the stack ─────────────────────────────────────────────────────
if [[ "$NO_STOP" == "false" ]]; then
  echo ""
  echo "► Restarting Docker Compose stack..."
  (cd "$PROJECT_DIR" && docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d) || {
    echo "⚠  Warning: Failed to restart stack. Start it manually:"
    echo "   docker compose -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} up -d"
  }
fi

echo ""
echo "✅ Backup complete: ${BACKUP_DIR}"
