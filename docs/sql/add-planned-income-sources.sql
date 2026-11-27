-- Execute uma única vez no Supabase SQL Editor.
-- Guarda o detalhamento das origens da receita planejada sem alterar os orçamentos existentes.
ALTER TABLE public.monthly_budgets
ADD COLUMN IF NOT EXISTS planned_income_sources JSONB NOT NULL DEFAULT '{}'::jsonb
CHECK (jsonb_typeof(planned_income_sources) = 'object');
