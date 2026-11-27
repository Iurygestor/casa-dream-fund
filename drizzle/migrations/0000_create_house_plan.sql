CREATE TABLE public.plan_settings (
 user_id uuid PRIMARY KEY DEFAULT auth.uid(),
 initial_balance numeric NOT NULL DEFAULT 9808.96 CHECK(initial_balance >= 0),
 initial_date date NOT NULL DEFAULT CURRENT_DATE,
 daily_rate numeric NOT NULL DEFAULT 0.0568 CHECK(daily_rate >= 0 AND daily_rate <= 100),
 monthly_deposit numeric NOT NULL DEFAULT 800 CHECK(monthly_deposit >= 0),
 deposit_start text NOT NULL DEFAULT '2027-01' CHECK(deposit_start ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 fgts numeric NOT NULL DEFAULT 6565.52 CHECK(fgts >= 0),
 goal numeric CHECK(goal > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_settings TO authenticated;
GRANT ALL ON public.plan_settings TO service_role;
ALTER TABLE public.plan_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_settings ON public.plan_settings FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE TABLE public.transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL DEFAULT auth.uid(),
 date date NOT NULL,
 type text NOT NULL CHECK(type IN ('despesa','recebimento','bonus','aporte','retirada')),
 amount numeric NOT NULL CHECK(amount > 0),
 category text,
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((type = 'despesa' AND category IN ('Aluguel','Internet','Faculdade','Manutenção','Gasolina','Fatura C6','Academia','Alimentação','DAS','Água/Luz','Saúde','Lazer','Outros')) OR (type <> 'despesa' AND category IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_transactions ON public.transactions FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE INDEX transactions_owner_date ON public.transactions(user_id, date DESC, created_at DESC);
CREATE FUNCTION public.restore_house_plan(backup jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); s jsonb := backup->'settings';
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Login necessário'; END IF;
 IF backup->>'version' <> '1' OR jsonb_typeof(backup->'transactions') <> 'array' OR jsonb_typeof(s) <> 'object' THEN RAISE EXCEPTION 'Backup inválido'; END IF;
 INSERT INTO public.plan_settings(user_id,initial_balance,initial_date,daily_rate,monthly_deposit,deposit_start,fgts,goal)
 VALUES(uid,(s->>'initial_balance')::numeric,(s->>'initial_date')::date,(s->>'daily_rate')::numeric,(s->>'monthly_deposit')::numeric,s->>'deposit_start',(s->>'fgts')::numeric,(s->>'goal')::numeric)
 ON CONFLICT(user_id) DO UPDATE SET initial_balance=excluded.initial_balance,initial_date=excluded.initial_date,daily_rate=excluded.daily_rate,monthly_deposit=excluded.monthly_deposit,deposit_start=excluded.deposit_start,fgts=excluded.fgts,goal=excluded.goal;
 DELETE FROM public.transactions WHERE user_id=uid;
 INSERT INTO public.transactions(user_id,date,type,amount,category,description)
 SELECT uid,(x->>'date')::date,x->>'type',(x->>'amount')::numeric,x->>'category',coalesce(x->>'description','') FROM jsonb_array_elements(backup->'transactions') x;
END; $$;
REVOKE EXECUTE ON FUNCTION public.restore_house_plan(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_house_plan(jsonb) TO authenticated;