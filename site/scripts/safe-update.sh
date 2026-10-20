#!/usr/bin/env bash
# safe-update.sh: update Ubuntu packages (and Docker containers, if you want) with a log.
# From https://wgdively.com/projects/server-scripts/
# Usage:  sudo bash safe-update.sh            (system packages only)
#         sudo bash safe-update.sh ~/homelab  (also pull new images for that compose folder)
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run it with sudo:  sudo bash $0 $*"; exit 1; }

LOG=/var/log/safe-update.log
exec > >(tee -a "$LOG") 2>&1
echo "=== $(date '+%F %T') safe-update started"
export DEBIAN_FRONTEND=noninteractive

apt-get update
# Keep existing config files if a package asks.
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade
apt-get -y autoremove --purge
apt-get -y autoclean
command -v snap >/dev/null 2>&1 && snap refresh || true

if [ $# -ge 1 ]; then
  dir=$1
  if [ -f "$dir/docker-compose.yml" ] || [ -f "$dir/compose.yaml" ] || [ -f "$dir/compose.yml" ]; then
    echo "--- Updating containers in $dir"
    (cd "$dir" && docker compose pull && docker compose up -d --remove-orphans)
    docker image prune -f
  else
    echo "!!! No compose file in $dir, so containers were not updated"
  fi
fi

if [ -f /var/run/reboot-required ]; then
  echo "!!! A restart is needed to finish. Run:  sudo reboot"
else
  echo "No restart needed."
fi
echo "=== $(date '+%F %T') done. Full log: $LOG"
