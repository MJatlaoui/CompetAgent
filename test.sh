#!/usr/bin/env bash
set -e

# Load .env for local development if present
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "=== Unit Tests ==="
pytest

echo ""
echo "=== Dry-Run Pipeline (10 sources, fresh DB) ==="
python -m src.main --limit 10 --fresh --dry-run
