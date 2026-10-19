-- Run ONCE in the Supabase SQL Editor (safe to re-run).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'backend';

-- These four are Fullstack, everything else stays Backend.
UPDATE projects SET category = 'fullstack'
WHERE title ILIKE '%map creator%'
   OR title ILIKE '%osc memories%'
   OR title ILIKE '%nova real estate%'
   OR title ILIKE '%skill tracker%';

-- Check the result:
SELECT title, category FROM projects ORDER BY category, title;