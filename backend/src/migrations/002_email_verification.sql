-- Run ONCE in the Supabase SQL Editor (safe to re-run: it checks first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
    -- accounts that already exist (you, your admin, test users) stay usable
    UPDATE public.users SET email_verified = TRUE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_verifications (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;