# E2B sandbox template for the Veda Claude Code tab.
# Build: e2b template build --name veda-claude-code   (run in this folder)
# NOT CHECKED: this file was not built in this repository. See docs/setup/claude-code-sandbox.md.
FROM e2bdev/base:latest

USER root
# Node.js 22 and ripgrep (Claude Code searches files with it).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg ripgrep git \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# The runner (runner.mjs) is written by the Veda server before each run. It imports the Agent SDK from here.
RUN mkdir -p /home/user/runner /home/user/projects /home/user/.veda \
 && cd /home/user/runner \
 && npm init -y \
 && npm install @anthropic-ai/claude-agent-sdk \
 && sed -i 's/"main": "index.js"/"type": "module"/' package.json \
 && chown -R user:user /home/user

USER user
WORKDIR /home/user
