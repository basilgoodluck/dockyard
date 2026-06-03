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

if [ ! -f "$STACK_PATH/docker-compose.yml" ] && [ ! -f "$STACK_PATH/compose.yml" ]; then
  echo "Error: no docker-compose.yml found in $STACK_PATH" >&2
  exit 1
fi

cd "$STACK_PATH"
docker compose down
docker compose up -d
echo "Stack restarted at $STACK_PATH"