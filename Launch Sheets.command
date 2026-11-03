#!/bin/bash
set -euo pipefail
app_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$app_dir"
exec node scripts/start-local.mjs
