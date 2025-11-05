#!/bin/bash

# ScyllaDB Local Setup Script
# This script sets up ScyllaDB with Alternator interface for local testing

echo "🚀 Setting up ScyllaDB with Alternator interface..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop and remove existing container if it exists
echo "🧹 Cleaning up existing ScyllaDB container..."
docker stop scylla-alternator 2>/dev/null || true
docker rm scylla-alternator 2>/dev/null || true

# Start ScyllaDB with Alternator
echo "🌟 Starting ScyllaDB with Alternator interface..."
docker run -d \
  --name scylla-alternator \
  -p 8000:8000 \
  -p 9042:9042 \
  --memory=2g \
  scylladb/scylla \
  --alternator-port=8000 \
  --alternator-write-isolation=always \
  --alternator-streams-time-window-s=5 \
  --developer-mode=1

# Wait for ScyllaDB to be ready
echo "⏳ Waiting for ScyllaDB to start..."
sleep 10

# Check if Alternator is responding
echo "🔍 Checking Alternator interface..."
for i in {1..30}; do
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo "✅ ScyllaDB Alternator is ready on port 8000!"
        break
    fi
    echo "⏳ Waiting for Alternator... ($i/30)"
    sleep 2
done

# Test the connection
echo "🧪 Testing Alternator interface..."
curl -X POST http://localhost:8000/ \
  -H "Content-Type: application/x-amz-json-1.0" \
  -H "X-Amz-Target: DynamoDB_20120810.ListTables" \
  -d '{}' 2>/dev/null || echo "Connection test completed"

echo ""
echo "🎉 ScyllaDB Setup Complete!"
echo "📋 Connection Details:"
echo "   Alternator Endpoint: http://localhost:8000/"
echo "   CQL Port: 9042"
echo "   Status: docker ps | grep scylla-alternator"
echo ""
echo "🔧 To stop: docker stop scylla-alternator"
echo "🗑️  To remove: docker rm scylla-alternator"