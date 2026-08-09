#!/usr/bin/env bash
set -euo pipefail

province="${1:?Usage: refresh.sh <configured-province-or-territory>}"
python_bin="${PYTHON_BIN:-python3}"

"$python_bin" scripts/canada-mining/download_public_records.py "$province"
if [ "$province" = "new-brunswick" ]; then
  "$python_bin" scripts/canada-mining/download_nbeclaims_holders.py
elif [ "$province" = "nova-scotia" ]; then
  "$python_bin" scripts/canada-mining/download_novaroc_holders.py
fi
"$python_bin" scripts/canada-mining/build_database.py "$province"
"$python_bin" scripts/canada-mining/build_public_dataset.py "$province"
