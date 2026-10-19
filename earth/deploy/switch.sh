#!/bin/sh
# Atomic, reversible activation of a staged release. Existing release retained.
set -eu
root=/srv/finalverse-earth
release=${1:?Usage: switch.sh release-id}
case "$release" in *[!a-zA-Z0-9._-]*|''|.|..) echo 'Invalid release ID' >&2; exit 1;; esac
candidate="$root/releases/$release"
[ -d "$candidate" ] && [ ! -L "$candidate" ] && [ -f "$candidate/FILES.sha256" ]
(cd "$candidate" && sha256sum -c FILES.sha256 >/dev/null)
previous=$(readlink "$root/current" || true)
[ -n "$previous" ] || { echo 'First installation needs an explicit reviewed service setup.' >&2; exit 1; }
case "$previous" in "$root/releases/"*) ;; *) echo 'Unexpected current target' >&2; exit 1;; esac
[ "$previous" != "$candidate" ] || { echo 'Release already current'; exit 0; }
[ -d "$previous" ]
restore() { ln -s "$previous" "$root/current.rollback"; mv -Tf "$root/current.rollback" "$root/current"; systemctl restart finalverse-earth; }
ln -s "$candidate" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
if ! systemctl restart finalverse-earth; then restore; exit 1; fi
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:18640/readyz >/dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then restore; echo 'Readiness failed; previous release restored' >&2; exit 1; fi
printf '%s\n' "$previous" > "$root/previous"
printf 'Activated %s. Roll back by running switch.sh %s\n' "$release" "${previous##*/}"
