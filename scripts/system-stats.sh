#!/bin/bash
set -e

echo "=== CPU ==="
top -bn1 | grep "Cpu(s)"

echo ""
echo "=== Memory ==="
free -h

echo ""
echo "=== Disk ==="
df -h /

echo ""
echo "=== Uptime ==="
uptime