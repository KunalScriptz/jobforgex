# JobForge API Specification

**Base URL:** `http://localhost:8000`  
**Version:** 1.0.0  
**Content Type:** `application/json`  
**Authentication:** Bearer JWT token  
**OpenAPI Docs:** `http://localhost:8000/docs`

---

## Authentication

All endpoints except `/api/v1/auth/*` and `/api/v1/webhooks/*` require authentication.

```
Authorization: Bearer <access_token>
```

### POST /api/v1/auth/register

Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "full_name": "Jane Doe"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "550e8400-...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "Jane Doe",
    "email_verified": false,
    "role": "user",
    "workspace_id": null,
    "workspace_name": null,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### POST /api/v1/auth/login

Authenticate with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response (200):** Same as register response.

### POST /api/v1/auth/refresh

Get new tokens using a refresh token.

**Request:**
```json
{
  "refresh_token": "550e8400-..."
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "new-token-uuid"
}
```

### POST /api/v1/auth/logout

Revoke a refresh token.

**Request:**
```json
{
  "refresh_token": "550e8400-..."
}
```

### POST /api/v1/auth/forgot-password

Request a password reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/v1/auth/reset-password

Reset password with a token from email.

**Request:**
```json
{
  "token": "reset-token-uuid",
  "new_password": "newpassword123"
}
```

### POST /api/v1/auth/verify-email

Verify email address.

**Request:**
```json
{
  "token": "verification-token-uuid"
}
```

---

## Workspace

### GET /api/v1/workspace/me

Get current user's workspace.

**Response (200):**
```json
{
  "id": "uuid",
  "owner_user_id": "uuid",
  "name": "My Workspace",
  "timezone": "UTC",
  "onboarding_step": 2,
  "onboarding_complete": true,
  "plan": "free",
  "currency": "USD",
  "trial_apps_limit": 2,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### POST /api/v1/workspace/create

Create a workspace.

**Request:**
```json
{
  "name": "My Workspace",
  "timezone": "UTC"
}
```

### POST /api/v1/workspace/onboarding

Update onboarding step.

**Query params:** `step` (int 1-4), `complete` (bool)

### GET /api/v1/workspace/boards

List all boards for the current workspace.

### POST /api/v1/workspace/boards

Create a board.

**Request:**
```json
{
  "name": "2025 Job Search"
}
```

### PUT /api/v1/workspace/boards/{board_id}

Rename a board.

**Request:**
```json
{
  "name": "New Board Name"
}
```

### DELETE /api/v1/workspace/boards/{board_id}

Delete a board.

---

## Jobs

### GET /api/v1/jobs/

List jobs with optional filters.

**Query params:** `board_id`, `search`, `status`

**Response (200):**
```json
[
  {
    "id": "uuid",
    "workspace_id": "uuid",
    "board_id": "uuid",
    "company": "Acme Inc",
    "title": "Software Engineer",
    "description": "...",
    "url": "https://...",
    "notes": "...",
    "location": "San Francisco, CA",
    "status": "applied",
    "date_applied": "2024-01-15",
    "resume_score": 85,
    "insights": {},
    "base_fit_score": {},
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/v1/jobs/{job_id}

Get job detail with artifacts and cost logs.

### POST /api/v1/jobs/

Create a new job.

**Request:**
```json
{
  "board_id": "uuid",
  "company": "Acme Inc",
  "title": "Software Engineer",
  "description": "Job description...",
  "url": "https://careers.example.com/...",
  "notes": "Referred by John",
  "location": "SF",
  "status": "wishlist"
}
```

### PUT /api/v1/jobs/{job_id}

Update a job. All fields optional.

### DELETE /api/v1/jobs/{job_id}

Delete a job and its artifacts.

### POST /api/v1/jobs/bulk-status

Update status for multiple jobs.

**Request:**
```json
{
  "ids": ["uuid1", "uuid2"],
  "status": "applied"
}
```

### POST /api/v1/jobs/bulk-delete

Delete multiple jobs (max 500).

**Request:**
```json
{
  "ids": ["uuid1", "uuid2"]
}
```

---

## Resumes

### GET /api/v1/resumes/

List all resumes for workspace.

### GET /api/v1/resumes/base

Get the base resume.

### POST /api/v1/resumes/base

Save/update the base resume.

**Request:**
```json
{
  "name": "My Resume",
  "latex_source": "\\documentclass{article}..."
}
```

### POST /api/v1/resumes/compile

Compile an artifact's LaTeX to PDF.

**Request:**
```json
{
  "artifact_id": "uuid"
}
```

**Response (200):**
```json
{
  "ok": true,
  "storage_path": "workspace-id/artifact-id.pdf"
}
```

### POST /api/v1/resumes/pdf-url

Get a presigned download URL.

**Request:**
```json
{
  "artifact_id": "uuid",
  "inline": false
}
```

**Response (200):**
```json
{
  "url": "http://minio:9000/job-artifacts/...?signature=...",
  "filename": "document.pdf"
}
```

---

## AI Generation

### POST /api/v1/ai/generate

Call DeepSeek AI for resume tailoring, cover letters, etc.

**Request:**
```json
{
  "prompt_name": "tailor_resume",
  "vars": {
    "job_description": "We are looking for...",
    "job_title": "Software Engineer",
    "company": "Acme Inc"
  },
  "job_id": "optional-uuid",
  "purpose": "resume_tailoring",
  "override_temperature": 0.3
}
```

**Prompt names:** `resume_scorer`, `tailor_resume`, `generate_cover_letter`, `parse_jd`, `ats_checker`, `extract_insights`, `builder_seed`, `builder_job_match`, `builder_score`, `builder_suggestions`

### GET /api/v1/ai/entitlement

Check if user can generate AI content.

**Response:**
```json
{
  "allowed": true
}
```

---

## Billing

### GET /api/v1/billing/status

Get current billing status.

**Response:**
```json
{
  "plan": "free",
  "currency": "USD",
  "trial_used": 0,
  "trial_limit": 2,
  "has_pro": false,
  "current_period_end": null
}
```

### POST /api/v1/billing/subscription/create

Create a Razorpay subscription.

**Request:**
```json
{
  "plan_id": "pro",
  "billing_cycle": "monthly",
  "country_code": "US",
  "trial": false
}
```

### GET /api/v1/billing/pricing

Get pricing for a country.

**Query params:** `country_code` (default: "DEFAULT")

---

## Extension (Chrome Extension)

### GET /api/v1/extension/tokens

List extension auth tokens.

### POST /api/v1/extension/tokens

Create a new extension token.

**Request:**
```json
{
  "label": "Laptop"
}
```

**Response:**
```json
{
  "id": "uuid",
  "token": "jfx_abc123...",
  "prefix": "jfx_abc123",
  "label": "Laptop"
}
```

### DELETE /api/v1/extension/tokens/{token_id}

Revoke an extension token.

### POST /api/v1/extension/jobs

Submit a job via extension (Bearer `jfx_` token auth).

**Request:**
```json
{
  "company": "Acme Inc",
  "title": "Software Engineer",
  "url": "https://...",
  "description": "...",
  "location": "SF"
}
```

---

## Webhooks

### POST /api/v1/webhooks/razorpay

Razorpay webhook handler (HMAC-SHA256 verified).

---

## Health

### GET /health

```json
{"status": "healthy", "version": "1.0.0"}
```

### GET /health/ready

```json
{"status": "ready"}
```

### GET /health/live

```json
{"status": "alive"}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Not authenticated"
}
```

### 402 Payment Required
```json
{
  "detail": "Free trial limit reached"
}
```

### 404 Not Found
```json
{
  "detail": "Workspace not found"
}
```

### 409 Conflict
```json
{
  "detail": "A user with this email already exists"
}
```

### 422 Validation Error
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

### 500 Internal Server Error
```json
{
  "detail": "AI provider error 500: ..."
}
```
