#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_PID_FILE="$SCRIPT_DIR/.backend.pid"
FRONTEND_PID_FILE="$SCRIPT_DIR/.frontend.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[localmind]${NC} $1"; }
warn() { echo -e "${YELLOW}[localmind]${NC} $1"; }
err()  { echo -e "${RED}[localmind]${NC} $1"; }

start_backend() {
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        warn "Backend already running (PID $(cat "$BACKEND_PID_FILE"))"
        return 0
    fi

    log "Starting backend on http://localhost:8000 ..."
    cd "$BACKEND_DIR"
    uvicorn main:app --host 0.0.0.0 --port 8000 &>/dev/null &
    echo $! > "$BACKEND_PID_FILE"
    cd "$SCRIPT_DIR"
    sleep 3

    if kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        log "Backend started (PID $(cat "$BACKEND_PID_FILE"))"
    else
        err "Backend failed to start. Check logs: cd backend && uvicorn main:app --port 8000"
        rm -f "$BACKEND_PID_FILE"
        return 1
    fi
}

start_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        warn "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))"
        return 0
    fi

    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        log "Installing frontend dependencies ..."
        cd "$FRONTEND_DIR" && npm install &>/dev/null && cd "$SCRIPT_DIR"
    fi

    log "Starting frontend on http://localhost:5173 ..."
    cd "$FRONTEND_DIR"
    npm run dev &>/dev/null &
    echo $! > "$FRONTEND_PID_FILE"
    cd "$SCRIPT_DIR"
    sleep 3

    if kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        log "Frontend started (PID $(cat "$FRONTEND_PID_FILE"))"
    else
        err "Frontend failed to start. Check logs: cd frontend && npm run dev"
        rm -f "$FRONTEND_PID_FILE"
        return 1
    fi
}

stop_backend() {
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid
        pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && log "Backend stopped (PID $pid)" || warn "Could not stop backend"
        else
            warn "Backend not running (stale PID $pid)"
        fi
        rm -f "$BACKEND_PID_FILE"
    else
        warn "Backend not running"
    fi
}

stop_frontend() {
    if [ -f "$FRONTEND_PID_FILE" ]; then
        local pid
        pid=$(cat "$FRONTEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && log "Frontend stopped (PID $pid)" || warn "Could not stop frontend"
        else
            warn "Frontend not running (stale PID $pid)"
        fi
        rm -f "$FRONTEND_PID_FILE"
    else
        warn "Frontend not running"
    fi
}

do_start() {
    log "Starting LocalMind ..."
    start_backend
    start_frontend
    echo ""
    log "Ready!"
    echo -e "  ${CYAN}Frontend${NC}  http://localhost:5173"
    echo -e "  ${CYAN}Backend${NC}   http://localhost:8000"
    echo -e "  ${CYAN}API Docs${NC}  http://localhost:8000/docs"
}

do_stop() {
    log "Stopping LocalMind ..."
    stop_frontend
    stop_backend
    log "Stopped."
}

do_restart() {
    do_stop
    echo ""
    do_start
}

do_status() {
    echo -e "${CYAN}LocalMind Status${NC}"
    echo "───────────────────────────"

    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        echo -e "  Backend:   ${GREEN}running${NC} (PID $(cat "$BACKEND_PID_FILE")) — http://localhost:8000"
    else
        echo -e "  Backend:   ${RED}stopped${NC}"
    fi

    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        echo -e "  Frontend:  ${GREEN}running${NC} (PID $(cat "$FRONTEND_PID_FILE")) — http://localhost:5173"
    else
        echo -e "  Frontend:  ${RED}stopped${NC}"
    fi
}

do_logs() {
    echo -e "${CYAN}Backend logs (Ctrl+C to exit):${NC}"
    cd "$BACKEND_DIR" && uvicorn main:app --host 0.0.0.0 --port 8000
}

do_clean() {
    log "Cleaning build artifacts ..."
    rm -rf "$BACKEND_DIR/chroma_db"
    rm -rf "$BACKEND_DIR/__pycache__"
    rm -rf "$FRONTEND_DIR/dist"
    rm -rf "$FRONTEND_DIR/node_modules"
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
    log "Cleaned."
}

do_health() {
    local resp
    resp=$(curl -s http://localhost:8000/health 2>/dev/null) || {
        err "Backend not reachable"
        return 1
    }
    echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
}

usage() {
    echo "LocalMind — RAG Knowledge Base"
    echo ""
    echo "Usage: ./localmind.sh <command>"
    echo ""
    echo "Commands:"
    echo "  start     Start backend + frontend"
    echo "  stop      Stop all services"
    echo "  restart   Stop and start all services"
    echo "  status    Show running services"
    echo "  logs      Run backend in foreground with logs"
    echo "  health    Check backend health endpoint"
    echo "  clean     Remove chroma_db, node_modules, build artifacts"
    echo "  docker    Start via docker-compose"
    echo "  help      Show this message"
}

case "${1:-help}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_restart ;;
    status)  do_status ;;
    logs)    do_logs ;;
    health)  do_health ;;
    clean)   do_clean ;;
    docker)  docker-compose -f "$SCRIPT_DIR/docker-compose.yml" up --build ;;
    help|*)  usage ;;
esac
