#!/usr/bin/env bash
set -euo pipefail

province="${1:?Usage: refresh.sh <configured-province-or-territory>}"
python_bin="${PYTHON_BIN:-python3}"

"$python_bin" scripts/canada-mining/download_public_records.py "$province"
"$python_bin" scripts/canada-mining/build_database.py "$province"
"$python_bin" scripts/canada-mining/build_public_dataset.py "$province"
