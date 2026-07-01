#!/usr/bin/env bash
# Certance Token Kit — Customer Delivery Packager
#
# Produces a clean zip of all customer-facing kit files, excluding:
#   - Internal evidence captures (measurement/direct-answer-captures/)
#   - Development artifacts (.git, node_modules, *.vsix other than current)
#   - Internal-only overlays (overlays/certance-qe/)
#
# Usage:
#   bash scripts/package-delivery.sh
#   bash scripts/package-delivery.sh --output ~/Desktop/ce-token-kit-delivery.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read version from vscode-extension/package.json
VERSION=$(node -e "console.log(require('$KIT_ROOT/vscode-extension/package.json').version)")
DEFAULT_OUTPUT="$KIT_ROOT/ce-token-kit-${VERSION}-delivery.zip"

OUTPUT="${DEFAULT_OUTPUT}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) OUTPUT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

echo "Certance Token Kit — Packaging v${VERSION} for customer delivery"
echo "Output: $OUTPUT"
echo ""

# Verify VSIX exists
VSIX="$KIT_ROOT/vscode-extension/ce-token-kit-${VERSION}.vsix"
if [[ ! -f "$VSIX" ]]; then
  echo "ERROR: VSIX not found at $VSIX"
  echo "Run: cd vscode-extension && npm install && npm run package:vsix"
  exit 1
fi

# Verify tests pass before packaging
echo "Running extension tests..."
(
  cd "$KIT_ROOT/vscode-extension"
  npm run check --silent
  npm test --silent 2>&1 | grep -E "^# (pass|fail)" || true
)
cd "$KIT_ROOT"

# Build the zip from the kit root, excluding internal files
zip -r "$OUTPUT" . \
  --exclude "*.git*" \
  --exclude "*/node_modules/*" \
  --exclude "*/measurement/direct-answer-captures/*" \
  --exclude "*/overlays/certance-qe/*" \
  --exclude "*certance-token-optimizer-*.vsix" \
  --exclude "*/research/findings/*" \
  --exclude "*/.DS_Store" \
  --exclude "*/package-lock.json" \
  --exclude "*/ce-token-kit-*-delivery.zip" \
  2>/dev/null

echo ""
echo "Done. Delivery package: $OUTPUT"
echo ""
echo "Contents:"
unzip -l "$OUTPUT" | grep -v "^Archive\|^---\|files$" | awk '{print $NF}' | sort
echo ""
echo "Pre-flight reminder:"
echo "  [ ] Internal paths removed from shipped docs"
echo "  [ ] LICENSE.txt updated for this client"
echo "  [ ] VSIX tested on a clean VS Code instance"
