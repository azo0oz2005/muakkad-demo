CREATE TABLE IF NOT EXISTS caseflow_documents (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), office_id BIGINT NOT NULL REFERENCES offices(id),
 source_hash TEXT NOT NULL, payload TEXT NOT NULL, approved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(office_id,source_hash)
);
CREATE TABLE IF NOT EXISTS caseflow_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), office_id BIGINT NOT NULL REFERENCES offices(id),
 match_key TEXT NOT NULL, payload TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(office_id,match_key)
);
CREATE TABLE IF NOT EXISTS caseflow_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), office_id BIGINT NOT NULL REFERENCES offices(id),
 case_id UUID NOT NULL REFERENCES caseflow_cases(id), document_id UUID NOT NULL REFERENCES caseflow_documents(id),
 kind TEXT NOT NULL CHECK(kind IN ('event','task')), payload TEXT NOT NULL,
 completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS caseflow_audit (
 id BIGSERIAL PRIMARY KEY, office_id BIGINT NOT NULL REFERENCES offices(id), user_id BIGINT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL, entity_id UUID NOT NULL, payload TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS caseflow_usage (
 id BIGSERIAL PRIMARY KEY, office_id BIGINT NOT NULL REFERENCES offices(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caseflow_usage_office_date ON caseflow_usage(office_id,created_at);
CREATE INDEX IF NOT EXISTS caseflow_items_office ON caseflow_items(office_id,case_id);
