#!/usr/bin/env bash
# Start Graphify in watch mode. Rebuilds the graph on code changes (no LLM needed).
# Usage: npm run graphify:watch
set -e
exec graphify watch .
