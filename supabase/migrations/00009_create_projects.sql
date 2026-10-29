-- Cloud copy of each student's project files. The browser (IndexedDB) stays the working copy.
CREATE TABLE projects (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  files jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, name),
  CONSTRAINT projects_size_limit CHECK (octet_length(files::text) <= 5000000)
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own projects" ON projects FOR SELECT USING (auth.uid() = user_id);

-- A student can own at most 20 projects.
CREATE POLICY "Users insert own projects" ON projects FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT count(*) FROM projects p WHERE p.user_id = auth.uid()) < 20
  );

CREATE POLICY "Users update own projects" ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);
