#!/usr/bin/env bash
# Deploy the signalling relay (server/signal.js) to a Hugging Face Space.
# Requires: HF PRO on the account (Docker Spaces are PRO-only since 2026),
# a token in ~/.cache/huggingface/token, git. Idempotent: re-run to update.
# After the first successful deploy, set SIGNAL_URL in client/transport.js to
# the printed wss:// URL and push the game.
set -euo pipefail

OWNER="RemiFabre"
SPACE="openwarlock-signal"
TOKEN="$(cat ~/.cache/huggingface/token)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# create (409/exists is fine)
curl -s -X POST https://huggingface.co/api/repos/create \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$SPACE\",\"type\":\"space\",\"sdk\":\"docker\",\"private\":false}" \
  | grep -qv '"error"' || true

git clone --quiet "https://user:${TOKEN}@huggingface.co/spaces/${OWNER}/${SPACE}" "$WORK/space"
cp "$ROOT/server/signal.js" "$WORK/space/signal.js"

cat > "$WORK/space/README.md" <<'EOF'
---
title: OpenWarlock Signal
emoji: 📡
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---
WebRTC signalling relay for OpenWarlock browser-hosted games.
No game traffic passes through here: hosts register a room code, guests
join by code, SDP/ICE blobs are relayed verbatim, then peers talk directly.
It also counts anonymous usage beacons (POST /beacon: visits, games started,
player counts — no names, no ids, no IPs) and serves the aggregate at
GET /stats. With an HF_TOKEN secret set, counters persist to the private
dataset RemiFabre/openwarlock-stats so restarts don't wipe history.
Game: https://remifabre.github.io/OpenWarlock/client/
EOF

cat > "$WORK/space/package.json" <<'EOF'
{ "name": "openwarlock-signal", "type": "module",
  "dependencies": { "ws": "^8.21.1" } }
EOF

cat > "$WORK/space/Dockerfile" <<'EOF'
FROM node:22-slim
WORKDIR /app
COPY package.json signal.js ./
RUN npm install --omit=dev
ENV PORT=7860
EXPOSE 7860
CMD ["node", "signal.js"]
EOF

cd "$WORK/space"
git add -A
git -c user.name="deploy" -c user.email="deploy@openwarlock" \
  commit --quiet -m "deploy signal relay from $(git -C "$ROOT" rev-parse --short HEAD)" || true
git push --quiet
echo "pushed. Space: https://huggingface.co/spaces/${OWNER}/${SPACE}"
echo "relay URL once built: wss://$(echo ${OWNER} | tr 'A-Z' 'a-z')-${SPACE}.hf.space"
echo "health check:        https://$(echo ${OWNER} | tr 'A-Z' 'a-z')-${SPACE}.hf.space/health"
