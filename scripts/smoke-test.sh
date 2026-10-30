#!/bin/bash
# Smoke test: run after `npm start` on port 5000.
set -e
curl -sf http://localhost:5000/api/health
curl -sf "http://localhost:5000/api/studios?limit=6" > /dev/null
echo "Server smoke test passed."
