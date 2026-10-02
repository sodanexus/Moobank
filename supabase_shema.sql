-- ============================================================================
-- Moobank — schéma complet pour une NOUVELLE installation Supabase
-- ============================================================================
-- Ce fichier n'est pas une migration et n'est jamais exécuté par l'application.
-- Ne l'exécutez pas sur une base existante. Pour y activer les nouveaux types
-- de livrets, utilisez uniquement scripts/optional/enable-savings-account-types.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Comptes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
                'PEA', 'CTO', 'PEE', 'PER', 'AV', 'Crypto',
                'Livret', 'Livret A', 'LDDS', 'Autre livret', 'Immo', 'Autre'
              )),
  solde       NUMERIC(24, 2),
  currency    TEXT NOT NULL DEFAULT 'EUR',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON public.accounts(user_id);

-- ── Positions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  exchange        TEXT NOT NULL DEFAULT '',
  currency        TEXT NOT NULL DEFAULT 'EUR',
  qty             NUMERIC(24, 8) NOT NULL CHECK (qty > 0),
  price           NUMERIC(24, 10) NOT NULL DEFAULT 0 CHECK (price >= 0),
  current         NUMERIC(24, 10) NOT NULL DEFAULT 0 CHECK (current >= 0),
  change          NUMERIC(24, 10),
  change_percent  NUMERIC(18, 8),
  last_updated    BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_user_id
  ON public.positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_account_id
  ON public.positions(account_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol
  ON public.positions(symbol);

-- ── Prélèvements récurrents ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prelevements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(24, 2) NOT NULL CHECK (amount > 0),
  freq        TEXT NOT NULL CHECK (freq IN ('mensuel', 'trimestriel', 'annuel')),
  cat         TEXT NOT NULL CHECK (cat IN ('courtage', 'frais', 'credit', 'abonnement', 'autre')),
  split       INTEGER NOT NULL DEFAULT 1 CHECK (split BETWEEN 1 AND 99),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prelevements_user_id
  ON public.prelevements(user_id);

-- ── Historique des transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'edit')),
  symbol        TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  qty           NUMERIC(24, 8) NOT NULL CHECK (qty > 0),
  price         NUMERIC(24, 10) NOT NULL CHECK (price >= 0),
  account_name  TEXT NOT NULL DEFAULT '',
  ts            BIGINT NOT NULL,
  old_qty       NUMERIC(24, 8),
  old_price     NUMERIC(24, 10),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_ts
  ON public.transactions(user_id, ts DESC);

-- ── Historique journalier du patrimoine ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patrimoine_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  value       NUMERIC(24, 2) NOT NULL CHECK (value >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_patrimoine_user_date
  ON public.patrimoine_history(user_id, date DESC);

-- ── Objectifs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  target      NUMERIC(24, 2) NOT NULL CHECK (target > 0),
  current     NUMERIC(24, 2) NOT NULL DEFAULT 0 CHECK (current >= 0),
  emoji       TEXT NOT NULL DEFAULT '🎯',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id
  ON public.goals(user_id);

-- ── updated_at ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_positions_updated_at ON public.positions;
CREATE TRIGGER trg_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prelevements_updated_at ON public.prelevements;
CREATE TRIGGER trg_prelevements_updated_at
  BEFORE UPDATE ON public.prelevements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_goals_updated_at ON public.goals;
CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS : chaque utilisateur ne voit que ses lignes ─────────────────────────
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prelevements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrimoine_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_user_isolation ON public.accounts;
CREATE POLICY accounts_user_isolation ON public.accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS positions_user_isolation ON public.positions;
CREATE POLICY positions_user_isolation ON public.positions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS prelevements_user_isolation ON public.prelevements;
CREATE POLICY prelevements_user_isolation ON public.prelevements
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_user_isolation ON public.transactions;
CREATE POLICY transactions_user_isolation ON public.transactions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS patrimoine_user_isolation ON public.patrimoine_history;
CREATE POLICY patrimoine_user_isolation ON public.patrimoine_history
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS goals_user_isolation ON public.goals;
CREATE POLICY goals_user_isolation ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.accounts,
  public.positions,
  public.prelevements,
  public.transactions,
  public.patrimoine_history,
  public.goals
TO authenticated, service_role;
