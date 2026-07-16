#!/bin/bash
set -e

cd /home/opc/prj/TNS

# Kill any existing processes
pkill -f "llama-server.*5001" 2>/dev/null || true
pkill -f "bun run dev" 2>/dev/null || true
sleep 1

# Start llama-server
echo "Starting llama-server..."
./llama-server \
  --model "local-models/Gemma 3 1B (Q4_K_M).gguf" \
  --host 127.0.0.1 \
  --port 5001 \
  --ctx-size 8192 \
  --threads 4 \
  --parallel 2 \
  > /tmp/llama.log 2>&1 &
LLAMA_PID=$!

# Wait for llama
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5001/health &>/dev/null; then
    echo "llama-server ready"
    break
  fi
  sleep 1
done

# Start TNS server
echo "Starting TNS server..."
bun run dev > /tmp/tns.log 2>&1 &
TNS_PID=$!

# Wait for TNS
for i in $(seq 1 30); do
  if curl -sf http://localhost:8000/health &>/dev/null; then
    echo "TNS server ready"
    break
  fi
  sleep 1
done

# Verify both are running
echo "Verifying servers..."
curl -sf http://127.0.0.1:5001/health && echo " - llama OK" || echo " - llama FAILED"
curl -sf http://localhost:8000/health && echo " - TNS OK" || echo " - TNS FAILED"

# Run simulation
echo ""
echo "Running simulation..."
bun run simulate.ts
SIM_EXIT=$?

# Cleanup
echo ""
echo "Cleaning up..."
kill $TNS_PID 2>/dev/null || true
kill $LLAMA_PID 2>/dev/null || true
wait $TNS_PID 2>/dev/null || true
wait $LLAMA_PID 2>/dev/null || true
echo "Done. (exit: $SIM_EXIT)"
