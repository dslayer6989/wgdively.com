#!/usr/bin/env bash
# backup-folder.sh: dated, compressed backups of a folder, keeping the newest few.
# From https://wgdively.com/projects/server-scripts/
# Good for a homelab folder (compose files, .env and data). Stops nothing, so for
# databases it's safest to run while those containers are stopped, or use their own export.
# Usage:  bash backup-folder.sh SOURCE DESTINATION [HOW_MANY_TO_KEEP]
#   e.g.  bash backup-folder.sh ~/homelab /mnt/usb/backups 7
set -euo pipefail
SRC=${1:-}; DEST=${2:-}; KEEP=${3:-7}
[ -n "$SRC" ] && [ -n "$DEST" ] || { sed -n '2,8p' "$0"; exit 1; }
[ -d "$SRC" ] || { echo "Source folder not found: $SRC"; exit 1; }
[[ "$KEEP" =~ ^[0-9]+$ ]] && [ "$KEEP" -ge 1 ] || { echo "HOW_MANY_TO_KEEP must be a number, 1 or more"; exit 1; }
mkdir -p "$DEST"

name=$(basename "$(realpath "$SRC")")
file="$DEST/$name-$(date +%Y-%m-%d_%H%M).tar.gz"
echo "Backing up $SRC to $file"
# --warning=no-file-changed: don't fail just because a log file changed mid-backup
tar --warning=no-file-changed -czf "$file.part" -C "$(dirname "$(realpath "$SRC")")" "$name" || [ $? -eq 1 ]
mv "$file.part" "$file"
tar -tzf "$file" >/dev/null && echo "Checked: the archive opens fine ($(du -h "$file" | cut -f1))."

# Keep only the newest $KEEP backups of this folder
mapfile -t old < <(ls -1t "$DEST/$name-"*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
for f in "${old[@]}"; do rm -f -- "$f" && echo "Removed old backup $(basename "$f")"; done
echo "Done. Backups kept: $(ls -1 "$DEST/$name-"*.tar.gz | wc -l)"
