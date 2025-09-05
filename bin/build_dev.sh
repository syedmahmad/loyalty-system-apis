#!/bin/bash

# We can take pull in the same file but once jenkins setup, we don't need to do this
set -e

echo "🔄 Cleaning previous build..."
rm -rf dist

echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

# echo "Run migrations:"
# npx ts-node ./node_modules/.bin/sequelize-cli db:migrate --config sequelize.config.js --migrations-path src/core/database/migrations

echo "🔧 Building for development..."
# npx dotenv -e .env -- nest build
dotenv -e .env -- npm run build

echo "🚀 Restarting PM2 process..."
pm2 delete loyalty-api || true
dotenv -e .env -- pm2 start npm --name "loyalty-api" -- run start:dev
