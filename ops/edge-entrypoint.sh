#!/bin/sh
set -eu
umask 077
fail() { echo 'Edge secret preflight failed' >&2; exit 1; }
[ -z "${BROS_PROXY_AUTH_TOKEN:-}${BROS_ADMIN_PASSWORD_HASH:-}" ] || fail
for path in /run/secrets/caddy_auth /run/secrets/caddy_proxy; do
  [ -f "$path" ] && [ ! -L "$path" ] && [ -r "$path" ] || fail
  [ "$(stat -c %u "$path")" = "$(id -u)" ] || fail
  case "$(stat -c %a "$path")" in 400|600) ;; *) fail ;; esac
done
exec "$@"
