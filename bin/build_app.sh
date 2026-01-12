#!/bin/bash
set -e

APP_NAME="loyalty-api"
NODE_HEAP_MB=4096 # increase Node heap limit to 4GB

echo "🔄 Cleaning previous build..."
rm -rf dist

echo "📦 Installing dependencies..."
npm ci --legacy-peer-deps

echo "🔧 Building for development..."
dotenv -e .env -- npm run build

echo "🚀 Restarting PM2 process with increased heap..."
# Delete old process if exists
pm2 delete "$APP_NAME" || true

# Start with larger Node heap and name the app
# dotenv -e .env -- pm2 start npm \
#   --name "$APP_NAME" \
#   -- run start:prod \
#   --node-args="--max-old-space-size=${NODE_HEAP_MB}"

NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}" \
# dotenv -e .env -- pm2 start npm --name "$APP_NAME" -- run start:prod
dotenv -e .env -- pm2 start dist/main.js --name "$APP_NAME"  -i 3  --max-memory-restart 2G  --node-args="-r newrelic --max-old-space-size=2048"


# # Optionally save PM2 process list so it autostarts on reboot
# pm2 save

# echo "✅ Deployment complete. Running PM2 list:"
# pm2 list
