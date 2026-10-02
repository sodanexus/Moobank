-- Moobank 2.6.0 — capital investi dans l'historique journalier.
-- Ajout non destructif : les anciennes lignes gardent invested = NULL et
-- continuent d'être lues normalement. À exécuter une seule fois dans Supabase.
ALTER TABLE public.patrimoine_history
  ADD COLUMN IF NOT EXISTS invested NUMERIC(24, 2) CHECK (invested IS NULL OR invested >= 0);
