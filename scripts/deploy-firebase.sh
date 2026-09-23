#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project="${FIREBASE_PROJECT:-gen-lang-client-0444960702}"
region="${FIREBASE_REGION:-us-central1}"
service="${FIREBASE_GATEWAY_SERVICE:-groundproof-api}"
service_account="${FIREBASE_GATEWAY_ACCOUNT:-groundproof-gateway@${project}.iam.gserviceaccount.com}"
secret_version="${FIREBASE_GATEWAY_SECRET_VERSION:-1}"

# Infrastructure and matching Worker secret must already exist. This script does
# not create billing links, broad IAM grants, or alter another Hosting site.
npm run build
node --test deploy/firebase/proxy/server.test.mjs
gcloud run deploy "$service" \
  --source=deploy/firebase/proxy --project="$project" --region="$region" \
  --platform=managed --allow-unauthenticated --service-account="$service_account" \
  --execution-environment=gen1 --cpu=1 --memory=128Mi \
  --min-instances=0 --max-instances=1 --concurrency=40 --timeout=60 \
  --set-secrets="GATEWAY_SECRET=groundproof-gateway-key:${secret_version}" \
  --set-env-vars='^|^UPSTREAM_ORIGIN=https://groundproof.groundproof.workers.dev|PUBLIC_ORIGINS=https://groundproof-flight.web.app,https://groundproof-flight.firebaseapp.com' \
  --quiet
npm exec --yes --package=firebase-tools@15.30.2 -- firebase deploy \
  --only hosting --project="$project" --config=firebase.json --non-interactive
node scripts/smoke-worker.mjs https://groundproof-flight.web.app --registration
