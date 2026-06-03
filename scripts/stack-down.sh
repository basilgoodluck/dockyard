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

cd "$STACK_PATH"
docker compose down
echo "Stack stopped at $STACK_PATH"