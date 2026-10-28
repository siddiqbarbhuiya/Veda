-- Restrict profiles UPDATE policy to prevent client-side balance modification.
-- Balance changes go through the service role (topup webhook, AI usage deduction).
DROP POLICY "Users update own profile" ON profiles;

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Revoke direct UPDATE on balance_paise from authenticated users.
-- Only the service role can modify balance.
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (display_name, email, updated_at) ON profiles TO authenticated;
