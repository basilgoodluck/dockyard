#!/bin/bash
set -e

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: CONTAINER_NAME is not set" >&2
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

docker logs --tail "$LINES" "$CONTAINER_NAME" 2>&1