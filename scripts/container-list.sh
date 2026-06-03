#!/bin/bash
set -e

if [ "${SHOW_ALL}" = "true" ]; then
  docker ps -a --format "{{.Names}}\t{{.Status}}\t{{.Image}}"
else
  docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}"
fi