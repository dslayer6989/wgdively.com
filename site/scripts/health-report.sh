#!/usr/bin/env bash
# health-report.sh: a one-screen health check for an Ubuntu home server.
# From https://wgdively.com/projects/server-scripts/
# Safe to run any time. It only reads; it changes nothing.
# Usage:  bash health-report.sh
set -u

bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true); reset=$(tput sgr0 2>/dev/null || true)
ok()   { printf '  \e[32m✔\e[0m %s\n' "$*"; }
warn() { printf '  \e[33m!\e[0m %s\n' "$*"; }
section() { printf '\n%s%s%s\n' "$bold" "$*" "$reset"; }

section "System"
echo "  $(hostname) · $(. /etc/os-release && echo "$PRETTY_NAME") · kernel $(uname -r)"
echo "  Up $(uptime -p | sed 's/^up //') · load $(cut -d' ' -f1-3 /proc/loadavg) on $(nproc) CPU threads"

section "Memory"
free -h | awk 'NR==2{printf "  RAM  %s used of %s (%s available)\n",$3,$2,$7} NR==3 && $2!="0B"{printf "  Swap %s used of %s\n",$3,$2}'

section "Disks"
df -h -x tmpfs -x devtmpfs -x squashfs -x overlay -x efivarfs --output=pcent,used,size,target | tail -n +2 | while read -r pct used size target; do
  n=${pct%\%}
  if [ "$n" -ge 90 ]; then warn "$target is $pct full ($used of $size)"; else ok "$target $pct ($used of $size)"; fi
done

section "Temperature"
if ls /sys/class/thermal/thermal_zone*/temp >/dev/null 2>&1; then
  max=0; for f in /sys/class/thermal/thermal_zone*/temp; do t=$(( $(cat "$f") / 1000 )); [ "$t" -gt "$max" ] && max=$t; done
  if [ "$max" -ge 85 ]; then warn "Hottest sensor: ${max}°C (hot)"; else ok "Hottest sensor: ${max}°C"; fi
else echo "  ${dim}No temperature sensors found${reset}"; fi

section "Updates"
if [ -x /usr/lib/update-notifier/apt-check ]; then
  IFS=';' read -r all sec < <(/usr/lib/update-notifier/apt-check 2>&1)
  if [ "${all:-0}" -gt 0 ]; then warn "$all updates waiting ($sec security). Run safe-update.sh"; else ok "Up to date"; fi
else
  n=$(apt list --upgradable 2>/dev/null | grep -c upgradable); [ "$n" -gt 0 ] && warn "$n updates waiting" || ok "Up to date"
fi
[ -f /var/run/reboot-required ] && warn "A restart is needed to finish updates" || ok "No restart needed"

section "Services"
failed=$(systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}')
if [ -n "$failed" ]; then warn "Failed: $(echo "$failed" | tr '\n' ' ')"; else ok "No failed system services"; fi

if command -v docker >/dev/null 2>&1; then
  section "Docker"
  if docker info >/dev/null 2>&1; then
    total=$(docker ps -q | wc -l); unhealthy=$(docker ps --filter health=unhealthy --format '{{.Names}}')
    stopped=$(docker ps -a --filter status=exited --filter status=dead --format '{{.Names}}')
    ok "$total containers running"
    [ -n "$unhealthy" ] && warn "Unhealthy: $(echo "$unhealthy" | tr '\n' ' ')"
    [ -n "$stopped" ] && warn "Stopped: $(echo "$stopped" | tr '\n' ' ')"
    echo "  ${dim}Disk used by Docker: $(docker system df --format '{{.Type}} {{.Size}}' | tr '\n' ' ')${reset}"
  else warn "Docker is installed but you can't reach it (try with sudo, or add yourself to the docker group)"; fi
fi

section "Network"
echo "  LAN address: $(hostname -I | awk '{print $1}')"
if ping -c1 -W2 1.1.1.1 >/dev/null 2>&1; then ok "Internet reachable"; else warn "No internet (ping 1.1.1.1 failed)"; fi
if getent hosts cloudflare.com >/dev/null 2>&1; then ok "DNS working"; else warn "DNS lookups failing"; fi
echo
