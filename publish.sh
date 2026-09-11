#!/bin/bash
set -e

echo "📚 Rebuilding corpus.json from your vault..."
node build-corpus.js

git add corpus.json

if git diff --cached --quiet; then
  echo "Nothing new since your last publish — corpus.json is unchanged."
else
  git commit -m "Publish: $(date +'%Y-%m-%d %H:%M')"
  git push origin main
  echo "✅ Published. Live on thealvearium.xyz in about 30 seconds."
fi
