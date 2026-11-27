import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  defaults,
  settingsSchema,
  transactionSchema,
  bonusEntries,
  backupSchema,
  type Settings,
  type Transaction,
} from "@/lib/finance";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LockKeyhole, Mail, ArrowRight } from "lucide-react";

type MonthlyBudget = {
  month: string;
  planned_income: number;
  planned_expenses: Record<string, number>;
};
type PlanContext = {
  user: User | null;
  budgets: MonthlyBudget[];
  authLoading: boolean;
  settings: Settings;
  transactions: Transaction[];
  displayName: string;
  loading: boolean;
  error: boolean;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  refetch: () => void;
  add: (t: Omit<Transaction, "id">, bonus: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  saveSettings: (s: Settings, name: string) => Promise<boolean>;
  restore: (value: unknown) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<PlanContext | null>(null);
export function usePlan() {
  const context = useContext(Context);
  if (!context) throw new Error("Plano indisponível");
  return context;
}
export function PlanProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [authLoading, setAuthLoading] = useState(true),
    [authOpen, setAuthOpen] = useState(false);
  const client = useQueryClient(),
    router = useRouter(),
    navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      setUser(session?.user ?? null);
      if (event === "SIGNED_IN") setAuthOpen(false);
      if (event === "SIGNED_OUT") client.clear();
      else void client.invalidateQueries();
      void router.invalidate();
    });
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) {
          setUser(data.user);
          setAuthLoading(false);
        }
      })
      .catch(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client, router]);
  const query = useQuery({
    queryKey: ["house-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user)
        return { settings: defaults(), transactions: [] as Transaction[], budgets: [] as MonthlyBudget[], displayName: "" };
      const [settingsResult, profileResult, budgetsResult] = await Promise.all([
        supabase.from("plan_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        (supabase.from("monthly_budgets" as any) as any)
          .select("month,planned_income,planned_expenses")
          .eq("user_id", user.id)
          .order("month"),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (profileResult.error) throw profileResult.error;
      if (budgetsResult.error) throw budgetsResult.error;
      const budgets: MonthlyBudget[] = (budgetsResult.data ?? []).map((row: any) => ({
        month: row.month,
        planned_income: Number(row.planned_income),
        planned_expenses: Object.fromEntries(
          Object.entries(row.planned_expenses ?? {}).map(([key, value]) => [key, Number(value)]),
        ),
      }));
      const transactions: Transaction[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase
          .from("transactions")
          .select("id,date,type,amount,category,description")
          .eq("user_id", user.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        for (const row of result.data) {
          const parsed = transactionSchema.parse(row);
          transactions.push({ ...parsed, id: row.id });
        }
        if (result.data.length < 1000) break;
      }
      return {
        settings: settingsResult.data ? settingsSchema.parse(settingsResult.data) : defaults(),
        transactions,
        budgets,
        displayName: profileResult.data.display_name,
      };
    },
    staleTime: 15000,
    refetchOnWindowFocus: true,
  });
  const requireUser = () => {
    if (user) return user;
    setAuthOpen(true);
    toast.info("Entre na sua conta para salvar seu plano.");
    return null;
  };
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["house-plan"] });
  };
  const add = async (t: Omit<Transaction, "id">, bonus: boolean) => {
    const account = requireUser();
    if (!account) return false;
    try {
      const entries = bonusEntries(transactionSchema.parse(t), bonus).map(
        ({ id: _id, ...entry }) => ({ ...entry, user_id: account.id }),
      );
      const { error } = await supabase.from("transactions").insert(entries);
      if (error) throw error;
      await invalidate();
      toast.success("Lançamento salvo na nuvem");
      return true;
    } catch {
      toast.error("Não foi possível salvar. Tente novamente.");
      return false;
    }
  };
  const remove = async (id: string) => {
    const account = requireUser();
    if (!account) return;
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("user_id", account.id)
      .eq("id", id);
    if (error) throw error;
    await invalidate();
    toast.success("Lançamento excluído");
  };
  const clear = async () => {
    const account = requireUser();
    if (!account) return;
    const { error } = await supabase.from("transactions").delete().eq("user_id", account.id);
    if (error) throw error;
    await invalidate();
    toast.success("Lançamentos apagados");
  };
  const saveSettings = async (s: Settings, name: string) => {
    const account = requireUser();
    if (!account) return false;
    try {
      const config = settingsSchema.parse(s);
      const { error } = await supabase
        .from("plan_settings")
        .upsert({ ...config, user_id: account.id });
      if (error) throw error;
      const profile = await supabase
        .from("profiles")
        .update({ display_name: name.trim().slice(0, 100) })
        .eq("id", account.id);
      if (profile.error) throw profile.error;
      await invalidate();
      toast.success("Ajustes salvos");
      return true;
    } catch {
      toast.error("Não foi possível salvar os ajustes.");
      return false;
    }
  };
  const restore = async (value: unknown) => {
    const account = requireUser();
    if (!account) return;
    const backup = backupSchema.parse(value);
    const { error } = await supabase.rpc("restore_house_plan", {
      backup: JSON.parse(JSON.stringify(backup)),
    });
    if (error) throw error;
    if (backup.profile) {
      const profile = await supabase.from("profiles").update(backup.profile).eq("id", account.id);
      if (profile.error) throw profile.error;
    }
    await invalidate();
    toast.success("Backup restaurado");
  };
  const signOut = async () => {
    await client.cancelQueries();
    client.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Não foi possível sair.");
      return;
    }
    setUser(null);
    await navigate({ to: "/auth", replace: true });
  };
  return (
    <Context.Provider
      value={{
        user,
        authLoading,
        settings: query.data?.settings ?? defaults(),
        transactions: query.data?.transactions ?? [],
        budgets: query.data?.budgets ?? [],
        displayName: query.data?.displayName ?? "",
        loading: !!user && query.isPending,
        error: !!user && query.isError,
        authOpen,
        setAuthOpen,
        refetch: () => {
          void query.refetch();
        },
        add,
        remove,
        clear,
        saveSettings,
        restore,
        signOut,
      }}
    >
      {children}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="auth-dialog">
          <DialogTitle>Seu plano, em qualquer lugar</DialogTitle>
          <DialogDescription>Entre para guardar seus dados com segurança.</DialogDescription>
          <AuthForm />
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("Confira seu e-mail para redefinir a senha.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: name } },
        });
        if (error) throw error;
        if (!data.session)
          setMessage("Conta criada! Confirme seu e-mail pelo link que enviamos antes de entrar.");
        else await navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo ao seu plano");
        await navigate({ to: "/" });
      }
    } catch {
      setMessage(
        mode === "login"
          ? "Não foi possível entrar. Confira e-mail, senha e a confirmação da conta."
          : "Não foi possível enviar. Confira os dados e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      {mode === "signup" && (
        <label>
          Seu nome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="name"
            required
            placeholder="Como podemos chamar você?"
          />
        </label>
      )}
      <label>
        E-mail
        <div className="field-icon">
          <Mail size={18} />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="voce@email.com"
          />
        </div>
      </label>
      {mode !== "forgot" && (
        <label>
          Senha
          <div className="field-icon">
            <LockKeyhole size={18} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="Pelo menos 6 caracteres"
            />
          </div>
        </label>
      )}
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      <Button size="lg" disabled={busy} type="submit">
        {busy
          ? "Aguarde…"
          : mode === "login"
            ? "Entrar"
            : mode === "signup"
              ? "Criar conta"
              : "Enviar link"}
        <ArrowRight />
      </Button>
      <div className="auth-options">
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Já tenho uma conta" : "Criar uma conta"}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setMode(mode === "forgot" ? "login" : "forgot");
            setMessage("");
          }}
        >
          {mode === "forgot" ? "Voltar para entrar" : "Esqueci minha senha"}
        </Button>
      </div>
    </form>
  );
}
