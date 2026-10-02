-- Moobank — migration ciblée du sprint 1 : flux de trésorerie.
-- À exécuter UNE SEULE FOIS sur une base existante depuis l'éditeur SQL Supabase.
-- Elle conserve toutes les transactions existantes.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(24, 2),
  ADD COLUMN IF NOT EXISTS fees NUMERIC(24, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.transactions
  ALTER COLUMN symbol SET DEFAULT '',
  ALTER COLUMN qty SET DEFAULT 0,
  ALTER COLUMN price SET DEFAULT 0;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check,
  DROP CONSTRAINT IF EXISTS transactions_qty_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('buy', 'sell', 'edit', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee')),
  ADD CONSTRAINT transactions_qty_check CHECK (qty >= 0),
  ADD CONSTRAINT transactions_fees_check CHECK (fees >= 0);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
  ON public.transactions(account_id);
