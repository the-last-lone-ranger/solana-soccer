#!/bin/bash
set -e

echo "Building application..."

# Use the existing install:all script
npm run install:all

# Build
npm run build:shared
npm run build:backend
npm run build:frontend

echo "Build complete!"

