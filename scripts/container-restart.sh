#!/bin/bash
set -e

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: CONTAINER_NAME is not set" >&2
  exit 1
fi

docker restart "$CONTAINER_NAME"
echo "Restarted $CONTAINER_NAME"