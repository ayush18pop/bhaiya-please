#!/usr/bin/env bash
# start-judging.sh — one command for the whole local backend, judged-ready.
#
# After ANY reboot / laptop shutdown:
#
#     ./start-judging.sh
#
# does everything:
#   1. starts the Arkiv Triggers worker  (pnpm triggers:worker, :8787)
#   2. starts the ngrok tunnel           https://<your static domain> -> :8787
#   3. health-checks both, auto-funds the worker wallet if it ran dry
#   4. prints the two env lines to paste into the Vercel project settings
#
# The public URL is the ngrok STATIC domain stored in .judging/ngrok.env, so it is
# the SAME URL on every run — rebuild the Vercel app against it once and you are
# done for the entire judging period.
#
# Commands: start (default) | stop | restart | status | url | logs [worker|tunnel] | awake
#   awake  — stops GNOME from sleeping while idle (lid-close needs one config, see below)
set -u
set -m   # background jobs get their own process group, so `stop` can kill the tree

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDIR="$ROOT/.judging"; LOGS="$JDIR/logs"; BIN="$JDIR/bin"
mkdir -p "$LOGS"
PORT="${TRIGGERS_PORT:-8787}"
HEALTH="http://localhost:$PORT/health"
NGROK="$BIN/ngrok"; if [ ! -x "$NGROK" ] && command -v ngrok >/dev/null 2>&1; then NGROK="$(command -v ngrok)"; fi

say() { printf '%s\n' "$*"; }
die() { printf 'start-judging: %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ optional overrides
[ -f "$JDIR/config.env" ] && . "$JDIR/config.env"
export TRIGGERS_ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-*}"
export TRIGGERS_POLL_MS TRIGGERS_REFRESH_MS

# ------------------------------------------------------------------ helpers
worker_up() { curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; }
health()    { curl -fsS --max-time 5 "$HEALTH" 2>/dev/null || true; }
public_up() { curl -fsS --max-time 5 "https://$NGROK_DOMAIN/health" >/dev/null 2>&1; }

wait_for_up() { # <checker-fn> <tries>
  for _ in $(seq "$2"); do "$1" && return 0; sleep 1; done; return 1;
}

# ------------------------------------------------------------------ ngrok setup (first run)
read_ngrok_env() {
  [ -s "$JDIR/ngrok.env" ] && . "$JDIR/ngrok.env"
  [ -n "${NGROK_DOMAIN:-}" ]   # true only when a domain is saved
}

# ------------------------------------------------------------------ worker
start_worker() {
  if worker_up; then say "✓ worker already up on :$PORT (reusing it)"; return 0; fi
  say "• starting the Arkiv Triggers worker (: $PORT) …"
  : > "$LOGS/worker.log"
  ( cd "$ROOT" && nohup pnpm --silent run triggers:worker >> "$LOGS/worker.log" 2>&1 & echo $! > "$JDIR/worker.pid" )
  if ! wait_for_up worker_up 90; then
    tail -n 30 "$LOGS/worker.log" >&2
    die "worker did not become healthy — see .judging/logs/worker.log"
  fi
  say "✓ worker healthy"
}

# If the worker wallet is empty, top it up from the seed wallet (DEPLOY.md: receipts cost gas).
maybe_fund() {
  local H BAL ADDR
  H="$(health)"; BAL="$(jq -r '.balance // ""' <<<"$H" 2>/dev/null)"; ADDR="$(jq -r '.worker // ""' <<<"$H" 2>/dev/null)"
  [ -n "$ADDR" ] || { say "! could not read the worker address from /health"; return 0; }
  if [ -n "$BAL" ] && [ "$BAL" != "0" ] && [ "$BAL" != "0.0" ]; then
    say "✓ worker wallet funded ($BAL GLM)"
    return 0
  fi
  if [ "${AUTO_FUND:-1}" != "1" ]; then
    say "! worker wallet is EMPTY — fund it:  pnpm fund $ADDR"
    return 0
  fi
  say "• worker wallet is empty — topping up from the seed wallet …"
  ( cd "$ROOT" && timeout 120 pnpm --silent run fund "$ADDR" </dev/null >> "$JDIR/logs/fund.log" 2>&1 ) \
    && say "✓ attempted auto-fund ($ADDR)" \
    || say "! auto-fund failed — run it yourself:  pnpm fund $ADDR  (see .judging/logs/fund.log)"
}

# ------------------------------------------------------------------ tunnel
# The public URL is SHARED with Floor and runs from ~/Projects/judging-tunnel:
# one ngrok domain, one slash router (judge-proxy). /v1*, /mcp, /healthz → Floor; rest → this worker.
start_tunnel() {
  if [ -n "${JUDGE_ROOT:-}" ]; then say "• tunnel managed by the caller (judging-tunnel)"; return 0; fi
  local TUN="$HOME/Documents/Projects/judging-tunnel/start-judging-url.sh"
  read_ngrok_env || true
  if [ -x "$TUN" ] && public_up; then
    say "✓ shared URL already live:  https://$NGROK_DOMAIN"
    return 0
  fi
  if [ ! -x "$TUN" ]; then
    say "! $TUN not found — the worker is up locally on :$PORT but has NO public URL"
    return 0
  fi
  say "• launching the shared URL router (slash proxy + tunnel; brings up Floor's server too) …"
  ( "$TUN" start ) & disown 2>/dev/null || true
  if wait_for_up public_up 120; then
    say "✓ shared URL live:  https://$NGROK_DOMAIN"
  else
    say "! tunnel not confirmed yet — check:  $TUN status"
  fi
}

summary() {
  local H ADDR
  H="$(health)"; ADDR="$(jq -r '.worker // ""' <<<"$H" 2>/dev/null)"
  cat <<EOF

────────────────────────────── what to paste into Vercel ──────────────────────────────
Project bhaiya-please → Settings → Environment Variables (set / replace, then redeploy):

  EXPO_PUBLIC_TRIGGERS_URL    https://$NGROK_DOMAIN
  EXPO_PUBLIC_TRIGGERS_WORKER $ADDR

(worker address from /health; same value every run, since the key comes from .env)
EOF
}

# ------------------------------------------------------------------ commands
cmd_start() {
  [ -d "$ROOT/node_modules" ] || { say "• installing dependencies (pnpm) …"; (cd "$ROOT" && pnpm install); }
  command -v node >/dev/null 2>&1 || die "node is missing (need Node >= 20)"
  command -v pnpm >/dev/null 2>&1 || die "pnpm is missing (corepack enable pnpm)"
  start_worker
  maybe_fund
  start_tunnel
  summary
}

cmd_stop() {
  local pid
  [ -f "$JDIR/worker.pid" ] && {
    pid="$(cat "$JDIR/worker.pid")"
    kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$JDIR/worker.pid"
  }
  pid="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
  if [ -n "$pid" ]; then kill -TERM "$pid" 2>/dev/null || true; fi
  pkill -TERM -f 'tsx src/main.ts' 2>/dev/null || true
  say "stopped (worker). The shared URL+tunnel keeps running: ~/Documents/Projects/judging-tunnel/start-judging-url.sh stop (or 'stop all')"
}

cmd_status() {
  local H UP
  H="$(health)"
  if worker_up; then
    UP="UP"
  else
    UP="DOWN"
  fi
  say "worker :$PORT  $UP"
  [ -n "$H" ] && jq -C '"         ok=\(.ok)  addr=\(.worker)  balance=\(.balance)  fired=\(.firedTotal)  triggers=\(.triggers)  pending=\(.pendingReceipts)"' <<<"$H" 2>/dev/null
  if [ -s "$JDIR/ngrok.env" ]; then
    read_ngrok_env
    if public_up; then say "tunnel https://$NGROK_DOMAIN  UP"
    else say "tunnel https://$NGROK_DOMAIN  DOWN (run: ~/Documents/Projects/judging-tunnel/start-judging-url.sh start)"; fi
  else
    say "tunnel  (shared domain not configured in .judging/ngrok.env)"
  fi
}

cmd_url() {
  read_ngrok_env || die "shared domain not configured — .judging/ngrok.env is missing (NGROK_DOMAIN=…)"
  local H ADDR
  H="$(health)"; ADDR="$(jq -r '.worker // ""' <<<"$H" 2>/dev/null)"
  say "EXPO_PUBLIC_TRIGGERS_URL=https://$NGROK_DOMAIN"
  say "EXPO_PUBLIC_TRIGGERS_WORKER=$ADDR"
}

cmd_logs() {
  case "${1:-worker}" in
    worker) tail -n 60 -f "$LOGS/worker.log" ;;
    tunnel) read_ngrok_env; [ -s "$LOGS/tunnel.log" ] && tail -n 60 -f "$LOGS/tunnel.log" || say "(tunnel logs are written on level warning+; try: curl https://$NGROK_DOMAIN/health)" ;;
    *) die "logs [worker|tunnel]" ;;
  esac
}

cmd_awake() {
  # GNOME: never auto-suspend on AC power while judging.
  if gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null; then
    say "✓ GNOME will not auto-suspend while on AC power"
  else
    say "! gsettings failed (not a GNOME session?)"
  fi
  cat <<'EOF'

NOTE — closing the lid still suspends, because that is handled by systemd-logind.
To make lid-close a no-op while judging (needs sudo, one line):

  echo -e "[HandleLidSwitch]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore" | \
    sudo tee /etc/systemd/logind.conf.d/lid.conf && sudo systemctl restart systemd-logind

EOF
}

case "${1:-start}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; sleep 1; cmd_start ;;
  status)  cmd_status ;;
  url)     cmd_url ;;
  logs)    shift; cmd_logs "$@" ;;
  awake)   shift || true; cmd_awake "$@" ;;
  *) die "usage: ./start-judging.sh [start|stop|restart|status|url|logs [worker|tunnel]|awake]" ;;
esac
