#!/bin/bash
# PaperGraph AI — start both servers
# Usage: ./start.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔══════════════════════════════╗"
echo "  ║     PaperGraph AI  🔬        ║"
echo "  ╚══════════════════════════════╝"
echo ""

# ── Backend ──────────────────────────────────────────────────────────────────
cd "$PROJECT_DIR"

if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
  echo "  ✓ Python venv activated"
fi

echo "  → Starting FastAPI backend on http://localhost:8000"
uvicorn api:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
cd "$PROJECT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "  → Installing frontend packages (first run)..."
  npm install
fi

echo "  → Starting React frontend on http://localhost:5173"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  ┌─────────────────────────────────────┐"
echo "  │  App:  http://localhost:5173         │"
echo "  │  API:  http://localhost:8000/docs    │"
echo "  │                                     │"
echo "  │  Press Ctrl+C to stop both          │"
echo "  └─────────────────────────────────────┘"
echo ""

# Stop both on Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '  Stopped.'; exit 0" INT TERM
wait
