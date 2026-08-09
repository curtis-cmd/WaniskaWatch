#!/bin/sh
set -eu

PYTHON_BIN="${PYTHON_BIN:-python3}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
VENDOR_DIR="$SCRIPT_DIR/vendor"

if ! PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" -c 'import lxml, pandas, pyproj, shapely, shapefile, xlrd' 2>/dev/null; then
  "$PYTHON_BIN" -m pip install --target "$VENDOR_DIR" -r "$SCRIPT_DIR/requirements.txt"
fi

cd "$PROJECT_DIR"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/download_manitoba_mining.py"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/download_imaqs_ownership.py" \
  --statuses GOOD_STAND ON_HOLD APPL_EXEMP APPL_EXTEN APPL_LEASE APPL_RFF
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/normalize_ownership.py" \
  data/manitoba-mining/raw/ownership/*_holders_*.xls \
  --output data/manitoba-mining/processed/disposition_holders_current.csv
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/build_database.py"
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/build_portal_dataset.py" \
  --ownership data/manitoba-mining/processed/disposition_holders_current.csv
PYTHONPATH="$VENDOR_DIR" "$PYTHON_BIN" "$SCRIPT_DIR/build_watch_layers.py"
