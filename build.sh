#!/bin/bash
set -e

echo "Building application..."
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"

# Ensure we're in the right directory
if [ ! -f "package.json" ]; then
  echo "Error: package.json not found in current directory"
  exit 1
fi

# Try to use npm, but if it fails, try alternative approaches
if ! command -v npm &> /dev/null; then
  echo "NPM not found, trying to use node directly..."
  exit 1
fi

# Check npm version
NPM_VERSION=$(npm --version 2>&1 || echo "error")
if [[ "$NPM_VERSION" == *"error"* ]] || [[ "$NPM_VERSION" == *"Cannot find"* ]]; then
  echo "NPM appears to be broken, trying to reinstall..."
  # Try to fix npm by reinstalling it
  curl -L https://www.npmjs.com/install.sh | sh || true
fi

# Install root dependencies first
echo "Installing root dependencies..."
npm install --legacy-peer-deps 2>&1 || npm install 2>&1 || {
  echo "NPM install failed, trying with corepack..."
  corepack enable 2>&1 || true
  npm install --legacy-peer-deps 2>&1 || npm install 2>&1
}

# Install workspace dependencies
echo "Installing shared dependencies..."
cd shared && npm install --legacy-peer-deps 2>&1 || npm install 2>&1 && cd ..

echo "Installing backend dependencies..."
cd backend && npm install --legacy-peer-deps 2>&1 || npm install 2>&1 && cd ..

echo "Installing frontend dependencies..."
cd frontend && npm install --legacy-peer-deps 2>&1 || npm install 2>&1 && cd ..

# Build
echo "Building shared..."
npm run build:shared

echo "Building backend..."
npm run build:backend

echo "Building frontend..."
npm run build:frontend

echo "Build complete!"

