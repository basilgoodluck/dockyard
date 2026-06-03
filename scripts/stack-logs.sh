#!/bin/bash
set -e

if [ -z "$STACK_PATH" ]; then
  echo "Error: STACK_PATH is not set" >&2
  exit 1
fi

if [ ! -d "$STACK_PATH" ]; then
  echo "Error: directory $STACK_PATH does not exist" >&2
  exit 1
fi

LINES=${LOG_LINES:-50}

if ! [[ "$LINES" =~ ^[0-9]+$ ]]; then
  echo "Error: LOG_LINES must be a number" >&2
  exit 1
fi

if [ "$LINES" -gt 200 ]; then
  LINES=200
fi

cd "$STACK_PATH"
docker compose logs --tail "$LINES" 2>&1