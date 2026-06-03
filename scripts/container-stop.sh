#!/bin/bash
set -e

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: CONTAINER_NAME is not set" >&2
  exit 1
fi

docker stop "$CONTAINER_NAME"
echo "Stopped $CONTAINER_NAME"