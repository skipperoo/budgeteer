#!/usr/bin/env bash
# ===========================================================================
# scripts/restore.sh — Budgeteer Production Restore
#
# Restores Docker named volumes and the secrets/ directory from a backup
# created by scripts/backup.sh.
#
# ⚠  DESTRUCTIVE: This will OVERWRITE current data with the backup contents.
#
# Usage:
#   ./scripts/restore.sh                        # restore from latest backup in ./backups/
#   ./scripts/restore.sh -s /path/to/backup     # restore a specific backup dir
#   ./scripts/restore.sh -l                     # list available backups
#
# Environment:
#   COMPOSE_FILE  — alternate compose file (default: docker-compose.yml)
#   COMPOSE_PROJECT_NAME — Docker Compose project name (default: budgeteer)
# ===========================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────
BACKUPS_DIR="${PROJECT_DIR}/backups"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-budgeteer}"
SOURCE_DIR=""
SKIP_RESTART=""

# ── Parse arguments ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
  -s | --source)
    SOURCE_DIR="$2"
    shift 2
    ;;
  -l | --list)
    echo "Available backups in ${BACKUPS_DIR}:"
    if [[ -d "$BACKUPS_DIR" ]]; then
      for d in "$BACKUPS_DIR"/*/; do
        if [[ -f "${d}/MANIFEST.txt" ]]; then
          echo "  $(basename "$d")  — $(head -1 "${d}/MANIFEST.txt" | sed 's/.*— //')"
        elif [[ -d "$d" ]]; then
          echo "  $(basename "$d")  (no manifest)"
        fi
      done
    else
      echo "  (no backups directory found)"
    fi
    exit 0
    ;;
  -h | --help)
    echo "Usage: $0 [-s <dir>] [-l]"
    echo ""
    echo "  -s, --source <dir>  Restore from this backup directory"
    echo "  -l, --list          List available backups and exit"
    echo "  -h, --help          Show this help"
    echo ""
    echo "If -s is omitted, the latest backup in ${BACKUPS_DIR}/ is used."
    exit 0
    ;;
  --skip-restart)
    SKIP_RESTART=1
    shift
    ;;
  *)
    echo "Unknown option: $1"
    echo "Usage: $0 [-s <dir>] [-l]"
    exit 1
    ;;
  esac
done

# ── Determine source backup ──────────────────────────────────────────────
if [[ -z "$SOURCE_DIR" ]]; then
  # Find the latest backup by timestamp
  if [[ -d "$BACKUPS_DIR" ]]; then
    LATEST=$(ls -1t "$BACKUPS_DIR" | head -1)
    if [[ -n "$LATEST" ]]; then
      SOURCE_DIR="${BACKUPS_DIR}/${LATEST}"
    fi
  fi
fi

if [[ -z "$SOURCE_DIR" ]]; then
  echo "❌ No backup found. Use -s <dir> to specify a backup directory."
  echo "   Run '$0 -l' to list available backups."
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "❌ Backup directory does not exist: ${SOURCE_DIR}"
  exit 1
fi

if [[ ! -f "${SOURCE_DIR}/pg_data.tar.gz" && ! -f "${SOURCE_DIR}/redis_data.tar.gz" ]]; then
  echo "⚠  Warning: ${SOURCE_DIR} does not look like a Budgeteer backup"
  echo "   (no pg_data.tar.gz or redis_data.tar.gz found)."
  echo ""
  echo -n "Continue anyway? [y/N] "
  read -r CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# ── Confirmation ──────────────────────────────────────────────────────────
echo "==========================================="
echo " Budgeteer Restore"
echo "==========================================="
echo "  Source: ${SOURCE_DIR}"
echo "  Compose file: ${COMPOSE_FILE}"
echo ""
echo "⚠  ⚠  ⚠  WARNING  ⚠  ⚠  ⚠"
echo "  This will OVERWRITE ALL current data:"
echo "  - PostgreSQL database"
echo "  - Redis data"
echo "  - secrets/ (if present in backup)"
echo ""
echo "  The stack will be STOPPED during restore."
echo ""

if [[ ! -f "${SOURCE_DIR}/MANIFEST.txt" ]]; then
  echo "  (no manifest — backup may be incomplete)"
fi

echo -n "Type 'RESTORE' to confirm: "
read -r CONFIRM
if [[ "$CONFIRM" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

# ── Stop the stack ────────────────────────────────────────────────────────
echo ""
echo "► Stopping Docker Compose stack..."
(cd "$PROJECT_DIR" && docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" down) || {
  echo "⚠  Warning: Failed to stop stack. Proceeding..."
}

# ── Restore Docker named volumes ──────────────────────────────────────────
echo "► Restoring Docker named volumes..."

restore_volume() {
  local vol_name="$1" # friendly name (pg_data, redis_data)
  local tar_file="$2" # path to tar.gz
  local compose_vol="${COMPOSE_PROJECT}_${vol_name}"

  if [[ ! -f "$tar_file" ]]; then
    echo "   ⚠  ${tar_file} not found — skipping ${vol_name}"
    return
  fi

  # Try the namespaced volume name first, then legacy
  local target_vol=""
  if docker volume ls -q | grep -q "^${compose_vol}$"; then
    target_vol="$compose_vol"
  elif docker volume ls -q | grep -q "^${vol_name}$"; then
    target_vol="$vol_name"
  else
    echo "   → Creating volume ${compose_vol} ..."
    docker volume create "$compose_vol" >/dev/null
    target_vol="$compose_vol"
  fi

  echo "   → ${target_vol}  ←  $(basename "$tar_file")"

  # Clear existing data and extract backup
  docker run --rm \
    -v "${target_vol}:/target" \
    alpine:latest \
    sh -c "rm -rf /target/* /target/..?* /target/.[!.]* 2>/dev/null; true" || true

  docker run --rm \
    -v "${target_vol}:/target" \
    -v "$(dirname "$tar_file"):/source:ro" \
    alpine:latest \
    tar xzf "/source/$(basename "$tar_file")" -C /target || {
    echo "⚠  Warning: Failed to restore ${vol_name}"
  }
}

restore_volume "pg_data" "${SOURCE_DIR}/pg_data.tar.gz"
restore_volume "redis_data" "${SOURCE_DIR}/redis_data.tar.gz"

# ── Restore secrets ───────────────────────────────────────────────────────
if [[ -f "${SOURCE_DIR}/secrets.tar.gz" ]]; then
  echo "► Restoring secrets/ ..."
  # Backup current secrets just in case
  if [[ -d "${PROJECT_DIR}/secrets" ]]; then
    mv "${PROJECT_DIR}/secrets" "${PROJECT_DIR}/secrets.bak.$(date +%s)"
    echo "   → Current secrets moved to secrets.bak.*"
  fi
  tar xzf "${SOURCE_DIR}/secrets.tar.gz" -C "$PROJECT_DIR"
  echo "   → secrets/ restored"
else
  echo "► No secrets.tar.gz in backup — skipping secrets/ restore"
fi

# ── Ensure correct permissions on secrets ────────────────────────────────
if [[ -d "${PROJECT_DIR}/secrets" ]]; then
  chmod 600 "${PROJECT_DIR}/secrets"/*.txt 2>/dev/null || true
fi

if [[ -n "$SKIP_RESTART" ]]; then
  exit 0
fi

# ── Restart the stack ─────────────────────────────────────────────────────
echo ""
echo "► Starting Docker Compose stack..."
(cd "$PROJECT_DIR" && docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" up -d) || {
  echo "❌ Failed to start the stack. Start it manually:"
  echo "   docker compose -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} up -d"
  exit 1
}

echo ""
echo "✅ Restore complete from: ${SOURCE_DIR}"
echo ""
echo "   Verify with:"
echo "     docker compose -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} ps"
echo "     docker compose -f ${COMPOSE_FILE} -p ${COMPOSE_PROJECT} logs --tail=50"
