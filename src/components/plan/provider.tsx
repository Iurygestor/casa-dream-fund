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
import type { CsvImportData } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LockKeyhole, Mail, ArrowRight } from "lucide-react";

type MonthlyBudget = {
  month: string;
  planned_income: number;
  planned_expenses: Record<string, number>;
  planned_income_sources: Record<string, number>;
};
export type CreditCard = {
  id: string;
  name: string;
  institution: string;
  last_four_digits: string | null;
  credit_limit: number;
  closing_day: number;
  due_day: number;
};
export type CreditCardInvoice = {
  id: string;
  card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: "open" | "closed" | "paid";
};
type PlanContext = {
  user: User | null;
  budgets: MonthlyBudget[];
  creditCards: CreditCard[];
  creditCardInvoices: CreditCardInvoice[];
  authLoading: boolean;
  settings: Settings;
  transactions: Transaction[];
  displayName: string;
  loading: boolean;
  error: boolean;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  refetch: () => void;
  add: (
    t: Omit<Transaction, "id">,
    bonus: boolean,
    payment?: { method: "credit_card"; cardId: string; installments: number },
  ) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  updateTransaction: (id: string, values: Pick<Transaction, "date" | "amount" | "description">) => Promise<void>;
  removeBudgetCategory: (month: string, category: string) => Promise<void>;
  clear: () => Promise<void>;
  saveSettings: (s: Settings, name: string) => Promise<boolean>;
  restore: (value: unknown) => Promise<void>;
  importCsv: (data: CsvImportData) => Promise<{ inserted: number; duplicates: number }>;
  signOut: () => Promise<void>;
};
const Context = createContext<PlanContext | null>(null);
function creditCardIsValid(
  payment: { method: "credit_card"; cardId: string; installments: number },
  cards: CreditCard[],
) {
  return (
    cards.some((card) => card.id === payment.cardId) &&
    Number.isInteger(payment.installments) &&
    payment.installments >= 1 &&
    payment.installments <= 48
  );
}
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
        return { settings: defaults(), transactions: [] as Transaction[], budgets: [] as MonthlyBudget[], creditCards: [] as CreditCard[], creditCardInvoices: [] as CreditCardInvoice[], displayName: "" };
      const [settingsResult, profileResult, budgetsResult, cardsResult, invoicesResult] = await Promise.all([
        supabase.from("plan_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("display_name").eq("id", user.id).single(),
        (supabase.from("monthly_budgets" as any) as any)
          .select("month,planned_income,planned_expenses,planned_income_sources")
          .eq("user_id", user.id)
          .order("month"),
        (supabase.from("credit_cards" as any) as any)
          .select("id,name,institution,last_four_digits,credit_limit,closing_day,due_day")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at"),
        (supabase.from("credit_card_invoices" as any) as any)
          .select("id,card_id,reference_month,closing_date,due_date,total_amount,paid_amount,status")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true }),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (profileResult.error) throw profileResult.error;
      if (budgetsResult.error) throw budgetsResult.error;
      if (cardsResult.error) throw cardsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;
      const creditCardInvoices: CreditCardInvoice[] = (invoicesResult.data ?? []).map((invoice: any) => ({
        ...invoice,
        total_amount: Number(invoice.total_amount),
        paid_amount: Number(invoice.paid_amount),
      }));
      const creditCards: CreditCard[] = (cardsResult.data ?? []).map((card: any) => ({
        ...card,
        credit_limit: Number(card.credit_limit),
      }));
      const budgets: MonthlyBudget[] = (budgetsResult.data ?? []).map((row: any) => ({
        month: row.month,
        planned_income: Number(row.planned_income),
        planned_expenses: Object.fromEntries(
          Object.entries(row.planned_expenses ?? {}).map(([key, value]) => [key, Number(value)]),
        ),
        planned_income_sources: Object.fromEntries(
          Object.entries(row.planned_income_sources ?? {}).map(([key, value]) => [key, Number(value)]),
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
        creditCards,
        creditCardInvoices,
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
  const add = async (
    t: Omit<Transaction, "id">,
    bonus: boolean,
    payment?: { method: "credit_card"; cardId: string; installments: number },
  ) => {
    const account = requireUser();
    if (!account) return false;
    let insertedId: string | null = null;
    try {
      const parsed = transactionSchema.parse(t);
      if (payment && (parsed.type !== "despesa" || !creditCardIsValid(payment, query.data?.creditCards ?? []))) {
        throw new Error("Cartão ou forma de pagamento inválida.");
      }
      const entries = (payment ? [parsed] : bonusEntries(parsed, bonus)).map(
        ({ id: _id, ...entry }) => ({
          ...entry,
          user_id: account.id,
          ...(payment
            ? {
                payment_method: "credit_card",
                credit_card_id: payment.cardId,
                installments_total: payment.installments,
              }
            : {}),
        }),
      );
      const { data, error } = await (supabase.from("transactions") as any)
        .insert(entries)
        .select("id");
      if (error) throw error;
      if (payment) {
        insertedId = data?.[0]?.id ?? null;
        if (!insertedId) throw new Error("Não foi possível identificar o lançamento salvo.");
        const { error: installmentError } = await (supabase.rpc as any)(
          "generate_credit_card_installments",
          { p_transaction_id: insertedId },
        );
        if (installmentError) throw installmentError;
      }
      await invalidate();
      toast.success(payment ? "Compra no cartão salva e parcelada na fatura" : "Lançamento salvo na nuvem");
      return true;
    } catch (error) {
      if (insertedId) {
        await supabase.from("transactions").delete().eq("user_id", account.id).eq("id", insertedId);
      }
      console.error("Erro ao salvar lançamento:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
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
  const updateTransaction = async (id: string, values: Pick<Transaction, "date" | "amount" | "description">) => {
    const account = requireUser();
    if (!account) return;
    try {
      const current = query.data?.transactions.find((transaction) => transaction.id === id);
      if (!current) throw new Error("Lançamento não encontrado.");
      const parsed = transactionSchema.parse({ ...current, ...values });
      const { error } = await supabase
        .from("transactions")
        .update({ date: parsed.date, amount: parsed.amount, description: parsed.description })
        .eq("user_id", account.id)
        .eq("id", id);
      if (error) throw error;
      await invalidate();
      toast.success("Receita atualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a receita.");
      throw error;
    }
  };
  const removeBudgetCategory = async (month: string, category: string) => {
    const account = requireUser();
    if (!account) return;
    try {
      const current = query.data?.budgets.find((item) => item.month === month);
      if (!current || !(category in current.planned_expenses)) {
        throw new Error("Despesa não encontrada neste orçamento.");
      }
      const plannedExpenses = { ...current.planned_expenses };
      delete plannedExpenses[category];
      const { error } = await (supabase.from("monthly_budgets" as any) as any)
        .upsert({
          user_id: account.id,
          month,
          planned_income: current.planned_income,
          planned_expenses: plannedExpenses,
          planned_income_sources: current.planned_income_sources,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,month" });
      if (error) throw error;
      await invalidate();
      toast.success("Despesa removida do orçamento");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a despesa.");
      throw error;
    }
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
  const importCsv = async (data: CsvImportData) => {
    const account = requireUser();
    if (!account) throw new Error("Entre na sua conta para importar.");
    if (data.errors.length) throw new Error("Corrija os erros do CSV antes de importar.");
    const existing = query.data?.transactions ?? [];
    const seen = new Set(existing.map((t) => [t.date, t.type, t.amount, t.category ?? "", t.description].join("|")));
    const unique = data.transactions.filter((t) => {
      const key = [t.date, t.type, t.amount, t.category ?? "", t.description].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (data.settings) {
      const { error } = await supabase.from("plan_settings").upsert({ ...settingsSchema.parse(data.settings), user_id: account.id });
      if (error) throw error;
    }
    if (data.displayName !== undefined) {
      const { error } = await supabase.from("profiles").update({ display_name: data.displayName.slice(0, 100) }).eq("id", account.id);
      if (error) throw error;
    }
    if (data.budgets.length) {
      const rows = data.budgets.map((b) => ({
        user_id: account.id, month: b.month, planned_income: b.planned_income,
        planned_expenses: b.planned_expenses, planned_income_sources: b.planned_income_sources,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase.from("monthly_budgets" as any) as any)
        .upsert(rows, { onConflict: "user_id,month" });
      if (error) throw error;
    }
    if (unique.length) {
      const rows = unique.map((t) => ({ ...transactionSchema.parse(t), user_id: account.id }));
      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;
    }
    await invalidate();
    toast.success("Planilha importada com sucesso");
    return { inserted: unique.length, duplicates: data.transactions.length - unique.length };
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
        creditCards: query.data?.creditCards ?? [],
        creditCardInvoices: query.data?.creditCardInvoices ?? [],
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
        updateTransaction,
        removeBudgetCategory,
        clear,
        saveSettings,
        restore,
        importCsv,
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
