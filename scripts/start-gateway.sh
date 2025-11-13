#!/bin/bash
# Start Gateway service for local development

set -e

cd "$(dirname "$0")/.."

echo "Starting Gateway Service..."
echo ""

# Check if PostgreSQL is running
if ! docker-compose -f docker-compose.dev.yml ps postgres 2>/dev/null | grep -q "Up"; then
    echo "ERROR: PostgreSQL is not running. Start it first with:"
    echo "   npm run backend:start"
    exit 1
fi

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "ERROR: Go is not installed. Please install Go first."
    exit 1
fi

# Set environment variables
export PG_URL="postgresql://attendance_user:dev_password_123@localhost:5432/attendance?sslmode=disable"
export PORT="8080"
export DEVICE_TOKEN_SECRET="dev-secret-key-change-in-production"
export BUFFER_DB_PATH="/tmp/gateway-buffer.db"

echo "Environment:"
echo "   PG_URL: $PG_URL"
echo "   PORT: $PORT"
echo ""

cd gateway

# Check if dependencies are installed
if [ ! -f "go.sum" ]; then
    echo "Installing Go dependencies..."
    go mod download
fi

echo "Starting Gateway on http://localhost:8080"
echo "Press Ctrl+C to stop"
echo ""

go run main.go retry.go

