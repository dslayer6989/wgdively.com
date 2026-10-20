#!/usr/bin/env bash
# docker-cleanup.sh: free disk space Docker no longer needs.
# From https://wgdively.com/projects/server-scripts/
# Removes stopped containers, unused networks, dangling images and build cache.
# It never touches volumes (your data) or images that running containers use.
# Usage:  bash docker-cleanup.sh          (shows what would go, then asks)
#         bash docker-cleanup.sh --yes    (no question, for a timer)
set -euo pipefail
command -v docker >/dev/null || { echo "Docker isn't installed."; exit 1; }

echo "Before:"; docker system df
echo
echo "Stopped containers that would be removed:"
docker ps -a --filter status=exited --filter status=created --filter status=dead --format '  {{.Names}} ({{.Image}}, {{.Status}})' || true
echo

if [ "${1:-}" != "--yes" ]; then
  read -rp "Clean up now? [y/N] " a
  [[ "$a" =~ ^[Yy]$ ]] || { echo "Nothing changed."; exit 0; }
fi

docker container prune -f
docker network prune -f
docker image prune -f
docker builder prune -f
echo; echo "After:"; docker system df
