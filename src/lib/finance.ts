import { z } from "zod";

export const categories = [
  "Aluguel",
  "Internet",
  "Faculdade",
  "Manutenção",
  "Gasolina",
  "Fatura C6",
  "Academia",
  "Alimentação",
  "DAS",
  "Água/Luz",
  "Saúde",
  "Lazer",
  "Outros",
] as const;
export const types = ["despesa", "recebimento", "bonus", "aporte", "retirada"] as const;
export type TransactionType = (typeof types)[number];
export const RECEIVABLE_PREFIX = "[A RECEBER] ";
export const typeLabels: Record<TransactionType, string> = {
  despesa: "Despesa",
  recebimento: "Recebimento",
  bonus: "Bônus",
  aporte: "Aporte",
  retirada: "Retirada",
};
export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const dateValue = (s: string) => new Date(`${s}T12:00:00`);
export const dayDifference = (a: string, b: string) =>
  Math.round(
    (Date.UTC(dateValue(b).getFullYear(), dateValue(b).getMonth(), dateValue(b).getDate()) -
      Date.UTC(dateValue(a).getFullYear(), dateValue(a).getMonth(), dateValue(a).getDate())) /
      86400000,
  );
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => !Number.isNaN(dateValue(s).getTime()) && isoDate(dateValue(s)) === s,
    "Data inválida",
  );
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const settingsSchema = z.object({
  initial_balance: z.number().finite().min(0),
  initial_date: dateSchema,
  daily_rate: z.number().finite().min(0).max(100),
  monthly_deposit: z.number().finite().min(0),
  deposit_start: monthSchema,
  fgts: z.number().finite().min(0),
  goal: z.number().finite().positive().nullable(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = (today = isoDate()): Settings => ({
  initial_balance: 0,
  initial_date: today,
  daily_rate: 0,
  monthly_deposit: 0,
  deposit_start: today.slice(0, 7),
  fgts: 0,
  goal: null,
});
export const transactionSchema = z
  .object({
    id: z.string().uuid().optional(),
    date: dateSchema,
    type: z.enum(types),
    amount: z.number().finite().positive(),
    category: z.enum(categories).nullable(),
    description: z.string().max(500),
  })
  .refine(
    (t) => (t.type === "despesa" ? t.category !== null : t.category === null),
    "Categoria inválida",
  );
export type Transaction = z.infer<typeof transactionSchema> & { id: string };
export const backupSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  transactions: z.array(transactionSchema).max(100000),
  profile: z.object({ display_name: z.string().max(100) }).optional(),
});
export const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
export const compactMoney = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
    : money(v);
export function parseDecimal(raw: string): number {
  const s = raw.trim().replace(/R\$/g, "").replace(/\s/g, "");
  if (!s || !/^[+-]?[\d.,]+$/.test(s)) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}
export function shiftMonth(month: string, step: number) {
  const d = dateValue(`${month}-01`);
  d.setMonth(d.getMonth() + step);
  return isoDate(d).slice(0, 7);
}
export const monthName = (month: string, short = false) =>
  dateValue(`${month}-01`).toLocaleDateString("pt-BR", {
    month: short ? "short" : "long",
    year: "numeric",
  });
export const monthEnd = (month: string) => {
  const d = dateValue(`${month}-01`);
  d.setMonth(d.getMonth() + 1, 0);
  return isoDate(d);
};
export const plannedDeposit = (month: string, s: Settings) =>
  month >= s.deposit_start ? s.monthly_deposit : 0;
export function budget(
  month: string,
  s: Settings,
  income = 0,
  expenses = 0,
) {
  const deposit = plannedDeposit(month, s);
  return { income, expenses, deposit, remaining: income - expenses - deposit };
}
export function monthlyTotals(transactions: Transaction[], month: string) {
  const rows = transactions.filter((t) => t.date.startsWith(month));
  const total = (ts: TransactionType[]) =>
    rows.filter((t) => ts.includes(t.type)).reduce((a, t) => a + t.amount, 0);
  const income = total(["recebimento", "bonus"]),
    expenses = total(["despesa"]),
    deposit = total(["aporte"]),
    withdrawals = total(["retirada"]);
  return { income, expenses, deposit, withdrawals, remaining: income - expenses - deposit, rows };
}
export function bonusEntries(t: z.infer<typeof transactionSchema>, depositBonus: boolean) {
  return t.type === "bonus" && depositBonus
    ? [
        t,
        {
          ...t,
          type: "aporte" as const,
          category: null,
          description: t.description ? `Bônus: ${t.description}` : "Depósito do bônus",
        },
      ]
    : [t];
}
// Initial balance is an opening balance: movements on that day apply before the next day's interest.
export function reserveBalance(s: Settings, rows: Transaction[], until = isoDate()) {
  if (until < s.initial_date) return null;
  let balance = s.initial_balance;
  const movements = rows
    .filter(
      (t) =>
        (t.type === "aporte" || t.type === "retirada") &&
        t.date >= s.initial_date &&
        t.date <= until,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  let cursor = s.initial_date;
  for (const t of movements) {
    balance *= Math.pow(1 + s.daily_rate / 100, dayDifference(cursor, t.date));
    balance += t.type === "aporte" ? t.amount : -t.amount;
    cursor = t.date;
  }
  return balance * Math.pow(1 + s.daily_rate / 100, dayDifference(cursor, until));
}
export function projection(s: Settings, rows: Transaction[], simulated: number, today = isoDate()) {
  const currentMonth = today.slice(0, 7),
    realNow = reserveBalance(s, rows, today) ?? s.initial_balance;
  let original = s.initial_balance,
    future = realNow;
  // Include all days between today and the first displayed month when the app starts before December.
  if (currentMonth < "2026-12") {
    future *= Math.pow(1 + s.daily_rate / 100, dayDifference(today, monthEnd(currentMonth)));
    future += Math.max(
      0,
      plannedDeposit(currentMonth, s) -
        monthlyTotals(
          rows.filter((t) => t.date <= today),
          currentMonth,
        ).deposit,
    );
    for (let month = shiftMonth(currentMonth, 1); month < "2026-12"; month = shiftMonth(month, 1)) {
      future =
        future *
          Math.pow(1 + s.daily_rate / 100, dayDifference(`${month}-01`, monthEnd(month)) + 1) +
        (month >= s.deposit_start ? simulated : 0);
    }
  }
  const points = Array.from({ length: 61 }, (_, i) => {
    const month = shiftMonth("2026-12", i),
      end = monthEnd(month);
    // December is the opening point; January is the first of 60 monthly compounding periods.
    if (i > 0)
      original = original * Math.pow(1 + s.daily_rate / 100, 30) + plannedDeposit(month, s);
    let estimated: number | null = null;
    if (month >= currentMonth) {
      if (month === currentMonth)
        future =
          realNow * Math.pow(1 + s.daily_rate / 100, dayDifference(today, end)) +
          Math.max(
            0,
            plannedDeposit(month, s) -
              monthlyTotals(
                rows.filter((t) => t.date <= today),
                month,
              ).deposit,
          );
      else
        future =
          future * Math.pow(1 + s.daily_rate / 100, dayDifference(`${month}-01`, end) + 1) +
          (month >= s.deposit_start ? simulated : 0);
      estimated = future;
    }
    return {
      month,
      label: monthName(month, true),
      plan: original,
      actual: end < today ? reserveBalance(s, rows, end) : month === currentMonth ? realNow : null,
      future: estimated,
    };
  });
  const milestones = [12, 24, 60].map((months) => {
    let plan = s.initial_balance,
      estimate = realNow;
    for (let i = 1; i <= months; i++) {
      const m = shiftMonth("2026-12", i);
      plan = plan * Math.pow(1 + s.daily_rate / 100, 30) + plannedDeposit(m, s);
      const fm = shiftMonth(currentMonth, i);
      estimate =
        estimate * Math.pow(1 + s.daily_rate / 100, dayDifference(`${fm}-01`, monthEnd(fm)) + 1) +
        (fm >= s.deposit_start ? simulated : 0);
    }
    return { months, plan, estimate, difference: estimate - plan };
  });
  let goalMonth: string | null =
    s.goal !== null && realNow + s.fgts >= s.goal ? currentMonth : null;
  let goalBalance = realNow;
  if (s.goal && !goalMonth)
    for (let i = 0; i < 1200; i++) {
      const month = shiftMonth(currentMonth, i);
      const days =
        i === 0
          ? dayDifference(today, monthEnd(month))
          : dayDifference(`${month}-01`, monthEnd(month)) + 1;
      const deposit =
        i === 0
          ? Math.max(
              0,
              plannedDeposit(month, s) -
                monthlyTotals(
                  rows.filter((t) => t.date <= today),
                  month,
                ).deposit,
            )
          : month >= s.deposit_start
            ? simulated
            : 0;
      goalBalance = goalBalance * Math.pow(1 + s.daily_rate / 100, days) + deposit;
      if (goalBalance + s.fgts >= s.goal) {
        goalMonth = month;
        break;
      }
    }
  return { points, milestones, goalMonth, realNow };
}
