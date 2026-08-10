-- ============================================================================
-- JobForge PostgreSQL Schema — Consolidated Migration
-- Generated from 22 Supabase migrations, adapted for self-hosted PostgreSQL
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS (replaces Supabase auth.users)
-- ============================================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT,
    full_name       TEXT,
    google_id       VARCHAR(255) UNIQUE,
    avatar_url      VARCHAR(1024),
    email_verified  BOOLEAN NOT NULL DEFAULT false,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users (email);

-- ============================================================================
-- AUTH TOKENS
-- ============================================================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);

CREATE TABLE verification_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_tokens_hash ON verification_tokens (token_hash);

CREATE TABLE password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);

-- ============================================================================
-- USER ROLES
-- ============================================================================
CREATE TABLE user_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    role            VARCHAR(20) NOT NULL DEFAULT 'user'
);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);

-- ============================================================================
-- WORKSPACES
-- ============================================================================
CREATE TABLE workspaces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    timezone            TEXT NOT NULL DEFAULT 'UTC',
    monthly_budget_usd  NUMERIC(10, 4),
    onboarding_step     INT NOT NULL DEFAULT 1,
    onboarding_complete BOOLEAN NOT NULL DEFAULT false,
    plan                TEXT NOT NULL DEFAULT 'free',
    currency            TEXT NOT NULL DEFAULT 'USD',
    trial_apps_limit    INT NOT NULL DEFAULT 2,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspaces_owner ON workspaces (owner_user_id);

-- ============================================================================
-- BOARDS
-- ============================================================================
CREATE TABLE boards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boards_workspace ON boards (workspace_id);

-- ============================================================================
-- AI PROVIDERS
-- ============================================================================
CREATE TABLE ai_providers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name                TEXT NOT NULL DEFAULT 'DeepSeek',
    base_url            TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
    api_key_encrypted   BYTEA,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_providers_workspace ON ai_providers (workspace_id);

-- ============================================================================
-- AI MODELS
-- ============================================================================
CREATE TABLE ai_models (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_id           UUID REFERENCES ai_providers(id) ON DELETE SET NULL,
    name                  TEXT NOT NULL,
    display_name          TEXT NOT NULL,
    input_price_per_1m    NUMERIC(10, 6) NOT NULL DEFAULT 0.14,
    output_price_per_1m   NUMERIC(10, 6) NOT NULL DEFAULT 0.28,
    is_default            BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_models_workspace ON ai_models (workspace_id);
CREATE INDEX idx_ai_models_provider ON ai_models (provider_id);

-- ============================================================================
-- RESUMES
-- ============================================================================
CREATE TABLE resumes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'My Resume',
    latex_source    TEXT NOT NULL DEFAULT '',
    page_count      INT NOT NULL DEFAULT 0,
    primary_color   TEXT NOT NULL DEFAULT '#00008c',
    secondary_color TEXT NOT NULL DEFAULT '#00a698',
    is_base         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resumes_workspace ON resumes (workspace_id);

-- ============================================================================
-- RESUME VERSIONS
-- ============================================================================
CREATE TABLE resume_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id       UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    latex_source    TEXT NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_resume_versions_resume ON resume_versions (resume_id);
CREATE INDEX idx_resume_versions_workspace ON resume_versions (workspace_id);

-- ============================================================================
-- JOBS
-- ============================================================================
CREATE TABLE jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    board_id        UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    company         TEXT NOT NULL,
    company_domain  TEXT,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    url             TEXT,
    notes           TEXT,
    location        TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'wishlist',
    date_applied    DATE,
    resume_score    INT,
    insights        JSONB,
    base_fit_score  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_workspace ON jobs (workspace_id);
CREATE INDEX idx_jobs_board ON jobs (board_id);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_company ON jobs (company);
CREATE INDEX idx_jobs_title ON jobs (title);
CREATE INDEX idx_jobs_created ON jobs (created_at DESC);

-- ============================================================================
-- JOB ARTIFACTS
-- ============================================================================
CREATE TABLE job_artifacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    kind                VARCHAR(30) NOT NULL,
    filename            TEXT NOT NULL,
    latex_source        TEXT NOT NULL DEFAULT '',
    pdf_storage_path    TEXT,
    compile_error       TEXT,
    fit_score           JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_artifacts_workspace ON job_artifacts (workspace_id);
CREATE INDEX idx_job_artifacts_job ON job_artifacts (job_id);
CREATE INDEX idx_job_artifacts_kind ON job_artifacts (kind);

-- ============================================================================
-- AI COST LOGS
-- ============================================================================
CREATE TABLE ai_cost_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
    model_id        UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    model_name      TEXT NOT NULL,
    input_tokens    INT NOT NULL DEFAULT 0,
    output_tokens   INT NOT NULL DEFAULT 0,
    total_tokens    INT NOT NULL DEFAULT 0,
    input_cost      NUMERIC(10, 6) NOT NULL DEFAULT 0,
    output_cost     NUMERIC(10, 6) NOT NULL DEFAULT 0,
    total_cost      NUMERIC(10, 6) NOT NULL DEFAULT 0,
    purpose         VARCHAR(30) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_cost_logs_workspace ON ai_cost_logs (workspace_id);
CREATE INDEX idx_ai_cost_logs_job ON ai_cost_logs (job_id);
CREATE INDEX idx_ai_cost_logs_user ON ai_cost_logs (user_id);

-- ============================================================================
-- EXTENSION TOKENS (Chrome extension auth)
-- ============================================================================
CREATE TABLE extension_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT '',
    token_hash      TEXT NOT NULL,
    token_prefix    TEXT NOT NULL,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_extension_tokens_user ON extension_tokens (user_id);
CREATE INDEX idx_extension_tokens_workspace ON extension_tokens (workspace_id);
CREATE INDEX idx_extension_tokens_hash ON extension_tokens (token_hash);

-- ============================================================================
-- BUILDER RESUMES (Structured resume builder)
-- ============================================================================
CREATE TABLE builder_resumes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content         JSONB NOT NULL DEFAULT '{}',
    latex_source    TEXT,
    pdf_path        TEXT,
    job_match       JSONB,
    score           JSONB,
    suggestions     JSONB,
    primary_color   TEXT,
    secondary_color TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_builder_resumes_workspace ON builder_resumes (workspace_id);
CREATE INDEX idx_builder_resumes_job ON builder_resumes (job_id);

-- ============================================================================
-- BUILDER RESUME VERSIONS
-- ============================================================================
CREATE TABLE builder_resume_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    builder_resume_id   UUID NOT NULL REFERENCES builder_resumes(id) ON DELETE CASCADE,
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content             JSONB NOT NULL DEFAULT '{}',
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_builder_resume_versions_builder ON builder_resume_versions (builder_resume_id);
CREATE INDEX idx_builder_resume_versions_workspace ON builder_resume_versions (workspace_id);

-- ============================================================================
-- PLANS
-- ============================================================================
CREATE TABLE plans (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    monthly_price_usd   NUMERIC(10, 2) NOT NULL DEFAULT 0,
    annual_price_usd    NUMERIC(10, 2) NOT NULL DEFAULT 0,
    job_track_limit     INT,
    cover_letter_limit  INT,
    features            JSONB NOT NULL DEFAULT '[]',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    sort_order          INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GEO PRICING
-- ============================================================================
CREATE TABLE geo_pricing (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                     TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    country_code                TEXT NOT NULL,
    currency                    TEXT NOT NULL,
    currency_symbol             TEXT NOT NULL DEFAULT '$',
    monthly_price               NUMERIC(10, 2) NOT NULL,
    annual_price                NUMERIC(10, 2) NOT NULL,
    razorpay_plan_id_monthly    TEXT,
    razorpay_plan_id_annual     TEXT,
    priority                    INT NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_geo_pricing_plan ON geo_pricing (plan_id);

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================
CREATE TABLE subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    plan                        TEXT NOT NULL DEFAULT 'free',
    plan_id                     TEXT REFERENCES plans(id),
    subscription_status         TEXT,
    razorpay_subscription_id    TEXT,
    razorpay_customer_id        TEXT,
    billing_cycle               TEXT,
    current_period_start        TIMESTAMPTZ,
    current_period_end          TIMESTAMPTZ,
    cancel_at_period_end        BOOLEAN NOT NULL DEFAULT false,
    download_count              INT NOT NULL DEFAULT 0,
    prompt_count                INT NOT NULL DEFAULT 0,
    trial_ends_at               TIMESTAMPTZ,
    suspended                   BOOLEAN NOT NULL DEFAULT false,
    lifetime_deal               BOOLEAN NOT NULL DEFAULT false,
    provider                    TEXT NOT NULL DEFAULT 'razorpay',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions (plan_id);

-- ============================================================================
-- PAYMENT EVENTS
-- ============================================================================
CREATE TABLE payment_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL DEFAULT 'razorpay',
    event_id        TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id)
);
CREATE INDEX idx_payment_events_workspace ON payment_events (workspace_id);

-- ============================================================================
-- DOWNLOAD LOGS
-- ============================================================================
CREATE TABLE download_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    application_id  UUID REFERENCES jobs(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_download_logs_user ON download_logs (user_id);

-- ============================================================================
-- PROMPT LOGS
-- ============================================================================
CREATE TABLE prompt_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_name       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prompt_logs_user ON prompt_logs (user_id);

-- ============================================================================
-- FUNCTIONS (replaces Supabase RPC functions)
-- ============================================================================
CREATE OR REPLACE FUNCTION owns_workspace(_ws UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspaces WHERE id = _ws
    );
$$;

CREATE OR REPLACE FUNCTION has_active_pro(_ws UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM workspaces w
        JOIN subscriptions s ON s.user_id = w.owner_user_id
        WHERE w.id = _ws
          AND s.subscription_status = 'active'
          AND (s.suspended = false)
          AND (s.current_period_end IS NULL OR s.current_period_end > now())
    );
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_builder_resumes_updated_at
    BEFORE UPDATE ON builder_resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA: Default plans
-- ============================================================================
INSERT INTO plans (id, name, monthly_price_usd, annual_price_usd, job_track_limit, cover_letter_limit, features, sort_order) VALUES
    ('free', 'Free', 0, 0, 2, 2, '["2 job tracks", "2 cover letters", "ATS checker", "Chrome extension"]', 0),
    ('pro', 'Pro', 14.00, 99.00, 30, 30, '["30 job tracks", "30 cover letters", "Structured resume builder", "ATS checker", "Chrome extension", "Priority support"]', 1),
    ('unlimited', 'Unlimited', 29.00, 199.00, NULL, NULL, '["Unlimited job tracks", "Unlimited cover letters", "Structured resume builder", "ATS checker", "Chrome extension", "Priority support"]', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO geo_pricing (plan_id, country_code, currency, currency_symbol, monthly_price, annual_price, priority) VALUES
    ('pro', 'IN', 'INR', '₹', 599.00, 3999.00, 10),
    ('pro', 'US', 'USD', '$', 14.00, 99.00, 5),
    ('pro', 'DEFAULT', 'USD', '$', 14.00, 99.00, 0),
    ('unlimited', 'IN', 'INR', '₹', 1299.00, 9999.00, 10),
    ('unlimited', 'US', 'USD', '$', 29.00, 249.00, 5),
    ('unlimited', 'DEFAULT', 'USD', '$', 29.00, 249.00, 0)
ON CONFLICT DO NOTHING;
