# DECISIONS.md

Short notes on non-obvious choices. These are interview talking points.

---

## Rebuild on AWS instead of the earlier Supabase prototype
The initial prototype used Supabase (managed Postgres + Auth) with an Express
backend. It was deleted in the `reworking` commit and restarted on the AWS
stack that CLAUDE.md §2 mandates (SAM, Lambda, API Gateway + Cognito authorizer,
Aurora Serverless v2). Reason: the portfolio goal is to demonstrate the AWS
architecture and security model in the spec, not the fastest path to a working
CRUD app.

---

## Item 1 — data/network foundation

**Aurora Serverless v2 with `MinCapacity: 0` + auto-pause.**
This is the single biggest cost lever (§4). At 0 ACU the cluster pauses when
idle and idle compute bills at ~$0. `SecondsUntilAutoPause: 300` pauses after
5 minutes of inactivity. Tradeoff: a cold, paused cluster adds a few seconds of
resume latency on the first query after idle — acceptable for a portfolio/demo
app, and worth it for the near-zero idle bill. Requires an engine version that
supports 0-ACU (13.15+/14.12+/15.7+/16.3+); pinned to 16.4.

**No NAT gateway; VPC endpoints instead.**
A NAT gateway bills continuously (~$32/mo + data). The in-VPC Lambdas only need
AWS APIs, so we use **interface endpoints** for Secrets Manager and CloudWatch
Logs, and a **gateway endpoint** for S3. The S3 gateway endpoint is free (an
interface endpoint would bill hourly), so it is preferred for S3. Result: no
egress infrastructure billing at idle.

**RDS-managed master password (`ManageMasterUserPassword: true`).**
RDS generates the master password and stores it in Secrets Manager directly, so
no password ever appears in the template, repo, or env files (§6). Lambdas read
the credential from the secret ARN (exposed as the `DBSecretArn` output) at
runtime. Alternative (a manually created secret referenced by the cluster) was
rejected as more moving parts for no benefit here.

---

## Item 2 — Cognito User Pool

**Public app client (no client secret), SRP auth flow.**
The React app is a browser SPA — it cannot keep a client secret confidential.
`ALLOW_USER_SRP_AUTH` uses the Secure Remote Password protocol so the plaintext
password never crosses the wire. The OAuth flow is Authorization Code + PKCE
(implicit in Cognito when `GenerateSecret: false` + `code` flow), which is the
current best practice for SPAs.

**Hosted UI domain (`CognitoUserPoolDomain`).**
Cognito's hosted UI gives us a working login/signup screen before the React
auth screens are built. It lets us prove the full auth path (login → JWT →
`GET /me`) in item 3 without blocking on the React frontend (item 8). The domain
prefix must be globally unique, so it is exposed as a required parameter at
`sam deploy` time rather than hardcoded.

**No MFA for v1.**
TOTP/SMS MFA adds real friction for a portfolio/demo with no real users at
risk. Excluded to keep onboarding simple. Add it if the app ever handles real
financial data in production.

**`PreventUserExistenceErrors: ENABLED`.**
Stops Cognito from confirming via error messages whether an email address is
registered — prevents user enumeration attacks.

---

**No RDS Proxy (deferred per §4).**
RDS Proxy bills continuously and adds value only at higher connection churn than
a demo sees. Lambdas connect to Aurora directly with `pg`. Revisit only if
connection storms become a real problem.

**`DeletionPolicy: Delete` on the cluster/instance.**
Default for `AWS::RDS::DBCluster` is `Snapshot`, which would leave a billable
snapshot and block a clean `sam delete`. The teardown path (§4, §11) requires
the stack to fully delete, so both cluster and instance are set to `Delete`.
Tradeoff: `sam delete` is destructive with no automatic snapshot — correct for a
portfolio app that is spun up/down between work sessions.

**Two private subnets across 2 AZs.**
Aurora's DB subnet group requires at least two AZs even though a single
serverless writer runs at a time. Subnets are private with no public route.
