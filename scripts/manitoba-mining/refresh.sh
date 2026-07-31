#!/bin/sh
set -eu

PYTHON_BIN="${PYTHON_BIN:-python3}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
VENDOR_DIR="$SCRIPT_DIR/vendor"

if [ ! -d "$VENDOR_DIR/shapely" ]; then
  "$PYTHON_BIN" -m pip install --target "$VENDOR_DIR" -r "$SCRIPT_DIR/requirements.txt"
fi

cd "$PROJECT_DIR"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/download_manitoba_mining.py"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/build_database.py"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/build_portal_dataset.py"
