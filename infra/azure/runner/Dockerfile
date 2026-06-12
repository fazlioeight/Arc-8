# Self-hosted GitHub Actions runner image for the Nexora chat workload.
# Runs inside the nexora-chat-env Container Apps environment so the
# deploy-backend.yml workflow can reach nexora-chat-kv through its
# private endpoint. See docs/RUNBOOK_SELF_HOSTED_RUNNER.md.
#
# The image bundles every tool deploy-to-azure.ps1 invokes from the
# runner: Azure CLI (+ containerapp extension), PowerShell 7, gh, jq,
# git, curl. Build it with `az acr build`; do not try to build locally.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    RUNNER_HOME=/home/runner \
    RUNNER_USER=runner

# Pinning the runner agent keeps the image reproducible. The agent self-
# updates at job start if the repo declares a newer minimum version, so
# this is only the *starting* point. Bump when convenient.
ARG RUNNER_VERSION=2.335.1
# The runner release artifacts name Linux x86_64 as "x64", not "amd64".
ARG RUNNER_ARCH=x64

# Keep this list minimal. `software-properties-common` pulls in polkit /
# packagekit / dbus (a 100+ package transitive tree) and consistently
# crashed the ACR builder mid-install. `apt-transport-https` is a no-op on
# jammy. Debug tools (iputils-ping, dnsutils) are out for the same reason.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg jq git sudo unzip lsb-release \
 && rm -rf /var/lib/apt/lists/*

# --- Azure CLI -------------------------------------------------------------
RUN curl -fsSL https://aka.ms/InstallAzureCLIDeb | bash \
 && az extension add --name containerapp --upgrade --only-show-errors

# --- PowerShell 7 (workflow steps declare `shell: pwsh`) -------------------
RUN curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -o /tmp/ms.deb \
 && dpkg -i /tmp/ms.deb \
 && rm -f /tmp/ms.deb \
 && apt-get update \
 && apt-get install -y --no-install-recommends powershell \
 && rm -rf /var/lib/apt/lists/*

# --- GitHub CLI ------------------------------------------------------------
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# --- Runner agent ----------------------------------------------------------
# The runner agent expects a non-root user. We give it passwordless sudo so
# install scripts that need root (apt installs in actions, etc.) can run.
RUN useradd -m -s /bin/bash $RUNNER_USER \
 && echo "$RUNNER_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$RUNNER_USER

WORKDIR $RUNNER_HOME

RUN curl -fsSL -o actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz" \
 && tar xzf actions-runner.tar.gz \
 && rm actions-runner.tar.gz \
 && ./bin/installdependencies.sh \
 && chown -R $RUNNER_USER:$RUNNER_USER $RUNNER_HOME

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER $RUNNER_USER

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
