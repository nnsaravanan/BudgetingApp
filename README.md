# Budgeting App

A personal multi-user budgeting web app. Track accounts, categorize transactions, set budgets, and view monthly summaries. Built as both a real tool and a portfolio project demonstrating clean AWS-native architecture.

**Live demo:** https://d3aor71902ktwu.cloudfront.net

---

## Architecture

```
Browser → CloudFront (HTTPS, serves React from private S3)
       → Cognito Hosted UI (sign-up / login → JWT)
       → API Gateway HTTP API (JWT authorizer)
       → App Lambda (Node.js 20, TypeScript)
       → Aurora Serverless v2 PostgreSQL (private subnet, auto-pause at 0 ACU)
            ↑ credentials via Secrets Manager (VPC interface endpoint)
```

Key cost decisions:
- Aurora min capacity **0 ACU** with auto-pause — drops to ~$0 when idle
- No NAT Gateway — Lambda reaches AWS services via VPC endpoints (free for S3 gateway, low-cost for Secrets Manager / CloudWatch)
- No RDS Proxy — unnecessary at demo concurrency; saves ~$30/mo
- Billing alarm at $10 via SNS email

See `DECISIONS.md` for the full rationale behind each design choice.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js 20 Lambda, TypeScript, esbuild |
| API | API Gateway HTTP API |
| Auth | Amazon Cognito User Pool + hosted UI |
| Database | Aurora Serverless v2 (PostgreSQL 16) |
| IaC | Native CloudFormation (no SAM transform) |
| Secrets | AWS Secrets Manager (RDS-managed password) |
| CDN | CloudFront + S3 (Origin Access Control) |

---

## Local development

### Prerequisites

- Node.js 20+
- AWS CLI v2 configured with a profile that has deploy permissions
- `esbuild` installed globally: `npm install -g esbuild`

### Frontend

```bash
cd frontend
cp .env.example .env.local   # values are already filled in for this deployment
npm install
npm run dev                  # http://localhost:5173
```

The Cognito client accepts `http://localhost:5173/callback` as a redirect URI, so local dev works against the deployed backend.

### Backend (type-check only — runs on Lambda, not locally)

```bash
cd backend
npm install
npm run typecheck
```

---

## Deploy

### First deploy

```bash
# 1. Create the artifact bucket (one-time)
aws s3 mb s3://budgeting-app-artifacts-<ACCOUNT_ID> --region us-east-1 --profile <profile>

# 2. Build backend
cd backend && npm run build && cd ..

# 3. Package + deploy infrastructure
cd infra
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket budgeting-app-artifacts-<ACCOUNT_ID> \
  --output-template-file packaged.yaml \
  --profile <profile>

aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name budgeting-app \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CognitoDomainPrefix=<unique-prefix> \
  --profile <profile>

# 4. Run the schema migration (one-time)
aws lambda invoke \
  --function-name budgeting-app-migrate \
  /dev/stdout \
  --profile <profile>

# 5. Get the CloudFront URL from stack outputs
aws cloudformation describe-stacks \
  --stack-name budgeting-app \
  --query "Stacks[0].Outputs" \
  --output table \
  --profile <profile>

# 6. Build frontend with production URLs
cd ../frontend
VITE_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com \
VITE_COGNITO_DOMAIN=https://<domain>.auth.us-east-1.amazoncognito.com \
VITE_COGNITO_CLIENT_ID=<client-id> \
VITE_REDIRECT_URI=https://<cloudfront-domain>/callback \
npm run build

# 7. Upload frontend + redeploy stack with CloudFront URL
aws s3 sync dist/ s3://budgeting-app-frontend-<ACCOUNT_ID> --delete --profile <profile>
aws cloudfront create-invalidation \
  --distribution-id <dist-id> --paths "/*" --profile <profile>

cd ../infra
aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name budgeting-app \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CognitoDomainPrefix=<unique-prefix> \
    FrontendUrl=https://<cloudfront-domain> \
  --profile <profile>
```

### Subsequent deploys (backend change)

```bash
cd backend && npm run build && cd ../infra
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket budgeting-app-artifacts-<ACCOUNT_ID> \
  --output-template-file packaged.yaml \
  --profile <profile>
aws cloudformation deploy \
  --template-file packaged.yaml \
  --stack-name budgeting-app \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CognitoDomainPrefix=<unique-prefix> \
    FrontendUrl=https://<cloudfront-domain> \
  --profile <profile>
```

### Subsequent deploys (frontend change)

```bash
cd frontend
VITE_API_URL=... VITE_COGNITO_DOMAIN=... VITE_COGNITO_CLIENT_ID=... VITE_REDIRECT_URI=... npm run build
aws s3 sync dist/ s3://budgeting-app-frontend-<ACCOUNT_ID> --delete --profile <profile>
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/*" --profile <profile>
```

---

## Teardown

```bash
# Empty the S3 buckets first (CloudFormation cannot delete non-empty buckets)
aws s3 rm s3://budgeting-app-frontend-<ACCOUNT_ID> --recursive --profile <profile>
aws s3 rm s3://budgeting-app-artifacts-<ACCOUNT_ID> --recursive --profile <profile>

# Delete the stack (DeletionPolicy: Delete on Aurora means the DB is destroyed)
aws cloudformation delete-stack --stack-name budgeting-app --profile <profile>
aws cloudformation wait stack-delete-complete --stack-name budgeting-app --profile <profile>
```

> **Warning:** deleting the stack permanently destroys the Aurora database and all data.

---

## Observability

| What | Where |
|---|---|
| API requests | CloudWatch → Log groups → `/aws/apigateway/budgeting-app-access` |
| Lambda errors | CloudWatch → Log groups → `/aws/lambda/budgeting-app-app` |
| Migration runs | CloudWatch → Log groups → `/aws/lambda/budgeting-app-migrate` |
| Billing | CloudWatch → Alarms → `budgeting-app-billing-$10` |

All log groups have a 30-day retention policy. The billing alarm sends an email when estimated daily charges exceed $10.

> **Note:** Billing alerts must be enabled in the AWS Billing console (Billing preferences → Receive CloudWatch billing alerts) for the alarm to receive data.

---

## Security checklist (v1)

- [x] `userId` derived from validated JWT claims only — never from request body or query string
- [x] Every SQL query filters by `user_id`
- [x] All SQL parameterized (`$1, $2`) — no string concatenation of user input
- [x] DB credentials in Secrets Manager, not in code or env files
- [x] Aurora in a private subnet, `PubliclyAccessible: false`
- [x] Input validation on every write endpoint (types, ranges, required fields)
- [x] HTTPS everywhere (CloudFront + API Gateway)
- [x] S3 frontend bucket private (served only via CloudFront OAC)
