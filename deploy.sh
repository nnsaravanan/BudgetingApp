#!/usr/bin/env bash
# deploy.sh — Full stack deploy from scratch.
# Run this after `sam delete` / teardown to bring everything back up.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Node.js 20+
#   - All stack parameters still in infra/samconfig.toml or passed via --parameter-overrides
#
# Usage: ./deploy.sh

set -euo pipefail

STACK_NAME="budgeting-app"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS_BUCKET="budgeting-app-artifacts-${ACCOUNT_ID}"
FRONTEND_BUCKET="budgeting-app-frontend-${ACCOUNT_ID}"
DIST_ID=""   # filled from stack outputs after deploy

echo "======================================================"
echo "  Budgeting App — Full Deploy"
echo "  Account: ${ACCOUNT_ID}"
echo "======================================================"

# ---- 1. Ensure artifacts bucket exists --------------------------------
echo ""
echo "[1/6] Ensuring artifacts bucket exists..."
aws s3api head-bucket --bucket "${ARTIFACTS_BUCKET}" 2>/dev/null || \
  aws s3 mb "s3://${ARTIFACTS_BUCKET}" --region us-east-1
echo "      s3://${ARTIFACTS_BUCKET} ✓"

# ---- 2. Build backend --------------------------------------------------
echo ""
echo "[2/6] Building backend..."
cd backend
npm ci --silent
npm run build
cd ..
echo "      Backend built ✓"

# ---- 3. Package + deploy CloudFormation --------------------------------
echo ""
echo "[3/6] Packaging CloudFormation template..."
aws cloudformation package \
  --template-file infra/template.yaml \
  --s3-bucket "${ARTIFACTS_BUCKET}" \
  --output-template-file infra/packaged.yaml

echo "      Deploying stack (this takes ~5 min on first run)..."
aws cloudformation deploy \
  --template-file infra/packaged.yaml \
  --stack-name "${STACK_NAME}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset
echo "      Stack deployed ✓"

# ---- 4. Run database migration -----------------------------------------
echo ""
echo "[4/6] Running database migration..."
aws lambda invoke \
  --function-name "${STACK_NAME}-migrate" \
  --payload '{}' \
  /tmp/migrate-output.json
cat /tmp/migrate-output.json
echo ""
echo "      Migration complete ✓"

# ---- 5. Build + deploy frontend ----------------------------------------
echo ""
echo "[5/6] Building and deploying frontend..."

# Pull Vite env vars from stack outputs
API_URL=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
COGNITO_DOMAIN=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='HostedUiUrl'].OutputValue" --output text | \
  sed 's|/login.*||')
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
CF_URL=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" --output text)
DIST_ID=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)

cd frontend
npm ci --silent
VITE_API_URL="${API_URL}" \
VITE_COGNITO_DOMAIN="${COGNITO_DOMAIN}" \
VITE_CLIENT_ID="${CLIENT_ID}" \
VITE_REDIRECT_URI="${CF_URL}/callback" \
npm run build

aws s3 sync dist/ "s3://${FRONTEND_BUCKET}" --delete
aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --paths "/*" \
  --query "Invalidation.Status" --output text
cd ..
echo "      Frontend deployed ✓"

# ---- 6. Print summary --------------------------------------------------
echo ""
echo "======================================================"
echo "  Deploy complete!"
echo ""
echo "  App URL:  ${CF_URL}"
echo "  API URL:  ${API_URL}"
echo ""
echo "  Next: open ${CF_URL} and sign up / log in."
echo "======================================================"
