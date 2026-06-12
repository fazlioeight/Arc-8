#!/usr/bin/env bash
# Entrypoint for the Nexora self-hosted GitHub Actions runner container.
#
# Registration tokens have a 1-hour TTL, so we don't bake one in. Instead
# the container is given a long-lived PAT via $GH_PAT (sourced from Key
# Vault by the Container App), and it mints a fresh registration token
# on every start. On graceful shutdown we trade the PAT for a removal
# token and de-register, so dead runners don't accumulate in GitHub.
#
# Required env vars (set by the Container App):
#   RUNNER_REPO_URL   e.g. https://github.com/Nexora-Lab-Co/nexora-platform
#   RUNNER_NAME       runner name shown in GitHub (max 64 chars)
#   RUNNER_LABELS     comma-separated, e.g. self-hosted,linux,nexora-vnet
#   GH_PAT            classic or fine-grained PAT with `repo` + `workflow` scopes
#
# Optional:
#   RUNNER_GROUP      defaults to Default
#   RUNNER_WORKDIR    defaults to _work

set -euo pipefail

: "${RUNNER_REPO_URL:?must be set}"
: "${RUNNER_NAME:?must be set}"
: "${RUNNER_LABELS:?must be set}"
: "${GH_PAT:?must be set}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-_work}"

# https://github.com/owner/repo -> owner/repo
OWNER_REPO="${RUNNER_REPO_URL#https://github.com/}"
OWNER_REPO="${OWNER_REPO%/}"

mint_token() {
  local endpoint="$1"   # registration-token | remove-token
  curl -fsS \
    -X POST \
    -H "Authorization: Bearer $GH_PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/${OWNER_REPO}/actions/runners/${endpoint}" \
    | jq -r .token
}

cd "$HOME"

cleanup() {
  echo "Caught signal; de-registering runner..."
  local rem_token
  if rem_token="$(mint_token remove-token 2>/dev/null)" && [ -n "$rem_token" ]; then
    ./config.sh remove --token "$rem_token" || true
  else
    echo "Could not mint removal token; runner may linger in GitHub until it expires."
  fi
  exit 0
}
trap 'cleanup' SIGTERM SIGINT

# Configure (or re-configure) the runner. --replace handles the case where
# a previous container of the same name didn't get to de-register.
if [ ! -f .runner ] || [ "${RUNNER_FORCE_RECONFIGURE:-false}" = "true" ]; then
  echo "Minting registration token for ${OWNER_REPO}..."
  REG_TOKEN="$(mint_token registration-token)"
  if [ -z "$REG_TOKEN" ]; then
    echo "Failed to mint registration token. Check GH_PAT scopes (repo, workflow)." >&2
    exit 1
  fi

  ./config.sh \
    --url "$RUNNER_REPO_URL" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --runnergroup "$RUNNER_GROUP" \
    --work "$RUNNER_WORKDIR" \
    --unattended \
    --replace
fi

echo "Starting runner ${RUNNER_NAME}..."
# run.sh is exec'd in the foreground; the trap above handles SIGTERM/SIGINT
# from the orchestrator (Container Apps sends SIGTERM on shutdown).
./run.sh &
RUN_PID=$!
wait "$RUN_PID"
