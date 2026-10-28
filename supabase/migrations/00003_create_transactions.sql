CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup', 'ai_usage', 'bonus')),
  amount_paise integer NOT NULL,
  balance_after_paise integer NOT NULL,
  description text,
  metadata jsonb,
  razorpay_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transactions_user_id_created_at_idx ON transactions (user_id, created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
