-- Run ONCE in your database SQL editor.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS postman_url TEXT;

CREATE TABLE IF NOT EXISTS project_likes (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_user      ON project_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

ALTER TABLE projects ADD CONSTRAINT chk_project_urls CHECK (
  (repo_url    IS NULL OR repo_url    ~* '^https?://') AND
  (demo_url    IS NULL OR demo_url    ~* '^https?://') AND
  (video_url   IS NULL OR video_url   ~* '^https?://') AND
  (postman_url IS NULL OR postman_url ~* '^https?://')
) NOT VALID;