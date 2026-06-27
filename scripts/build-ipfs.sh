#!/usr/bin/env bash
#
# build-ipfs.sh — stage the CashX static site into ./dist for a clean IPFS upload.
#
# This site has NO compile step, so "building" just means copying the real site
# files into ./dist while dropping dev-only junk (git history, CI config, editor
# settings, and the recovered/backup HTML copies) so none of it lands on IPFS.
#
# GitHub Pages is NOT affected — it keeps serving from the repo root. This only
# produces a tidy folder you can drag into Pinata/Fleek or `ipfs add`.
#
# Usage:  bash scripts/build-ipfs.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="dist"
rm -rf "$OUT"
mkdir -p "$OUT"

# Copy everything except the excluded paths. tar is used (instead of cp/rsync)
# because it is available identically on Windows Git Bash and Linux CI runners.
tar \
  --exclude='./.git' \
  --exclude='./.github' \
  --exclude='./.agents' \
  --exclude='./.claude' \
  --exclude='./.vscode' \
  --exclude='./.gitignore' \
  --exclude='./dist' \
  --exclude='./scripts' \
  --exclude='./node_modules' \
  --exclude='./public' \
  --exclude='./README.md' \
  --exclude='./index.recovered-candidate.html' \
  --exclude='./*.backup.html' \
  -cf - . | tar -xf - -C "$OUT"

echo "Staged site into ./$OUT"
echo "Top-level contents:"
find "$OUT" -maxdepth 1 -mindepth 1 | sort
