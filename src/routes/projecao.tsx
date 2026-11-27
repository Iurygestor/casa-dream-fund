import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import { PageHeading, CloudNotice } from "@/components/plan/shared";
import {
  projection,
  parseDecimal,
  money,
  compactMoney,
  monthName,
  shiftMonth,
  monthEnd,
  monthlyTotals,
  reserveBalance,
  plannedDeposit,
  type Transaction,
} from "@/lib/finance";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/projecao")({
  head: () =>
    pageHead(
      "Projeção",
      "Acompanhe receitas, despesas, patrimônio e a evolução da sua reserva até a compra da casa.",
    ),
  component: Projection,
});

type ViewMode = "reserve" | "overview";
type Period = "6M" | "12M" | "3A" | "5A" | "Tudo";
type OverviewPoint = {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  wealth: number;
  projectedIncome: number | null;
  projectedExpenses: number | null;
  projectedBalance: number | null;
  projectedWealth: number | null;
  reserve: number;
  isFuture: boolean;
  hasData: boolean;
};

const periods: Period[] = ["6M", "12M", "3A", "5A", "Tudo"];
const monthKey = (date: string) => date.slice(0, 7);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const average = (values: number[]) => values.length ? sum(values) / values.length : 0;
const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Projection() {
  const p = usePlan();
  return <ProjectionView key={p.settings.monthly_deposit} />;
}

function ProjectionView() {
  const p = usePlan();
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentMonth = todayIso.slice(0, 7);
  const [simulation, setSimulation] = useState(String(p.settings.monthly_deposit).replace(".", ","));
  const [view, setView] = useState<ViewMode>("reserve");
  const [period, setPeriod] = useState<Period>("12M");
  const [budgetMonth, setBudgetMonth] = useState(currentMonth);
  const [visible, setVisible] = useState({ income: true, expenses: true, balance: true, wealth: true });
  const amount = parseDecimal(simulation);
  const valid = Number.isFinite(amount) && amount >= 0;
  const simulatedDeposit = valid ? amount : p.settings.monthly_deposit;

  const currentProjection = useMemo(
    () => projection(p.settings, p.transactions, simulatedDeposit, todayIso),
    [p.settings, p.transactions, simulatedDeposit, todayIso],
  );
  const baseProjection = useMemo(
    () => projection(p.settings, p.transactions, p.settings.monthly_deposit, todayIso),
    [p.settings, p.transactions, todayIso],
  );
  const simulated12 = currentProjection.milestones.find((item) => item.months === 12)?.estimate ?? currentProjection.realNow;
  const simulated60 = currentProjection.milestones.find((item) => item.months === 60)?.estimate ?? currentProjection.realNow;
  const base60 = baseProjection.milestones.find((item) => item.months === 60)?.estimate ?? baseProjection.realNow;

  const firstTransactionMonth = p.transactions.length
    ? p.transactions.reduce((earliest, transaction) => monthKey(transaction.date) < earliest ? monthKey(transaction.date) : earliest, currentMonth)
    : currentMonth;
  const firstBudgetMonth = p.budgets.length
    ? p.budgets.reduce((earliest, budget) => budget.month < earliest ? budget.month : earliest, currentMonth)
    : currentMonth;
  const firstAvailableMonth = firstTransactionMonth < firstBudgetMonth ? firstTransactionMonth : firstBudgetMonth;
  const periodCount = period === "6M" ? 6 : period === "12M" ? 12 : period === "3A" ? 36 : 60;
  const rangeStart = period === "Tudo" ? firstAvailableMonth : shiftMonth(currentMonth, -Math.floor((periodCount - 1) / 2));
  const rangeEnd = period === "Tudo" ? shiftMonth(currentMonth, 60) : shiftMonth(currentMonth, Math.ceil((periodCount - 1) / 2));

  const actualMonthly = useMemo(() => {
    const result = new Map<string, { income: number; expenses: number; deposits: number; withdrawals: number }>();
    for (const transaction of p.transactions) {
      const key = monthKey(transaction.date);
      const item = result.get(key) ?? { income: 0, expenses: 0, deposits: 0, withdrawals: 0 };
      if (transaction.type === "recebimento" || transaction.type === "bonus") item.income += transaction.amount;
      if (transaction.type === "despesa") item.expenses += transaction.amount;
      if (transaction.type === "aporte") item.deposits += transaction.amount;
      if (transaction.type === "retirada") item.withdrawals += transaction.amount;
      result.set(key, item);
    }
    return result;
  }, [p.transactions]);

  const recentMonths = useMemo(
    () => [3, 2, 1].map((offset) => shiftMonth(currentMonth, -offset)),
    [currentMonth],
  );
  const recentRows = recentMonths.map((month) => actualMonthly.get(month) ?? { income: 0, expenses: 0, deposits: 0, withdrawals: 0 });
  const averageSurplus = average(recentRows.map((row) => row.income - row.expenses - row.deposits));
  const recentIncome = sum(recentRows.map((row) => row.income));
  const recentDeposits = sum(recentRows.map((row) => row.deposits));
  const savingsRate = recentIncome > 0 ? (recentDeposits / recentIncome) * 100 : 0;

  const forecastRows = useMemo(() => {
    const completedMonths = [3, 2, 1].map((offset) => shiftMonth(currentMonth, -offset));
    const history = completedMonths.map((month) => {
      const row = actualMonthly.get(month) ?? { income: 0, expenses: 0, deposits: 0, withdrawals: 0 };
      return { month, ...row };
    });
    const averageIncome = average(history.map((row) => row.income));
    const expenseByCategory = new Map<string, number[]>();
    for (const month of completedMonths) {
      const categoryTotals = new Map<string, number>();
      for (const transaction of p.transactions) {
        if (monthKey(transaction.date) !== month || transaction.type !== "despesa") continue;
        const category = transaction.category ?? "Outros";
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + transaction.amount);
      }
      for (const [category, value] of categoryTotals) {
        const values = expenseByCategory.get(category) ?? [];
        values.push(value);
        expenseByCategory.set(category, values);
      }
    }
    const recurringExpenses = new Map<string, number>();
    for (const [category, values] of expenseByCategory) {
      if (values.length >= 2) recurringExpenses.set(category, average(values));
    }
    return { averageIncome, recurringExpenses, history };
  }, [currentMonth, actualMonthly, p.transactions]);

  const overviewData = useMemo(() => {
    const rows: OverviewPoint[] = [];
    const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
    const periodMonths = period === "Tudo" ? monthIndex(currentMonth) - monthIndex(firstAvailableMonth) + 61 : periodCount;
    let accumulatedOutsideReserve = 0;
    let reserve = reserveBalance(p.settings, p.transactions, todayIso) ?? p.settings.initial_balance;
    for (let month = rangeStart, index = 0; index < periodMonths; month = shiftMonth(month, 1), index++) {
      const future = month > currentMonth;
      const pastData = actualMonthly.get(month);
      const budget = p.budgets.find((item) => item.month === month);
      const monthInvoices = p.creditCardInvoices.filter((invoice) => invoice.due_date.slice(0, 7) === month && invoice.status !== "paid");
      const invoiceDue = sum(monthInvoices.map((invoice) => Math.max(0, invoice.total_amount - invoice.paid_amount)));
      const budgetExpenseEntries = Object.entries(budget?.planned_expenses ?? {});
      const budgetExpenses = sum(budgetExpenseEntries.map(([, value]) => value));
      const budgetCardExpense = budgetExpenseEntries.find(([category]) => category.toLowerCase().includes("fatura"))?.[1] ?? 0;
      const forecastExpenses = budget
        ? budgetExpenses + Math.max(0, invoiceDue - budgetCardExpense)
        : sum([...forecastRows.recurringExpenses.values()]) + invoiceDue;
      const income = future
        ? (budget ? budget.planned_income : forecastRows.averageIncome)
        : pastData?.income ?? 0;
      const expenses = future
        ? forecastExpenses
        : pastData?.expenses ?? 0;
      const deposits = future
        ? (month >= p.settings.deposit_start ? simulatedDeposit : 0)
        : pastData?.deposits ?? 0;
      const withdrawals = future ? 0 : pastData?.withdrawals ?? 0;
      const balance = income - expenses;
      if (month <= currentMonth) {
        accumulatedOutsideReserve += income - expenses - deposits + withdrawals;
        const end = monthEnd(month);
        if (month < currentMonth) reserve = reserveBalance(p.settings, p.transactions, end) ?? reserve;
      } else {
        const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
        reserve = reserve * Math.pow(1 + p.settings.daily_rate / 100, days) + deposits - withdrawals;
        accumulatedOutsideReserve += income - expenses - deposits + withdrawals;
      }
      const wealth = reserve + accumulatedOutsideReserve + (future ? 0 : 0);
      const hasData = !!pastData || !!budget || monthInvoices.length > 0;
      rows.push({
        month, income: future ? 0 : income, expenses: future ? 0 : expenses, balance: future ? 0 : balance,
        wealth: future ? 0 : wealth,
        projectedIncome: future ? income : null,
        projectedExpenses: future ? expenses : null,
        projectedBalance: future ? balance : null,
        projectedWealth: future ? wealth : null,
        reserve, isFuture: future, hasData,
      });
    }
    return rows.filter((row) => row.month >= rangeStart && row.month <= rangeEnd);
  }, [period, currentMonth, todayIso, p.transactions, p.budgets, p.creditCardInvoices, p.settings, actualMonthly, forecastRows, firstAvailableMonth, periodCount, rangeStart, rangeEnd, simulatedDeposit]);

  const reserveChartData = useMemo(() => {
    const historical: Array<{ month: string; plan: number | null; realized: number | null; future: number | null }> = [];
    for (let month = rangeStart; month <= currentMonth; month = shiftMonth(month, 1)) {
      historical.push({
        month,
        plan: currentProjection.points.find((point) => point.month === month)?.plan ?? null,
        realized: month === currentMonth ? currentProjection.realNow : reserveBalance(p.settings, p.transactions, monthEnd(month)),
        future: month === currentMonth ? currentProjection.realNow : null,
      });
    }
    const future = currentProjection.points
      .filter((point) => point.month > currentMonth && point.month <= rangeEnd)
      .map((point) => ({ month: point.month, plan: point.plan, realized: null, future: point.future }));
    return [...historical, ...future];
  }, [currentMonth, currentProjection, p.settings, p.transactions, rangeStart, rangeEnd]);

  const reserveDifference = currentProjection.realNow - (currentProjection.points.find((point) => point.month === currentMonth)?.plan ?? currentProjection.points[0]?.plan ?? p.settings.initial_balance);
  const selectedBudget = p.budgets.find((item) => item.month === budgetMonth);
  const selectedTransactions = p.transactions.filter((transaction) => monthKey(transaction.date) === budgetMonth);
  const selectedTotals = monthlyTotals(p.transactions, budgetMonth);
  const selectedInvoices = p.creditCardInvoices.filter((invoice) => invoice.due_date.slice(0, 7) === budgetMonth && invoice.status !== "paid");
  const invoiceOutstanding = sum(selectedInvoices.map((invoice) => Math.max(0, invoice.total_amount - invoice.paid_amount)));
  const plannedIncome = selectedBudget?.planned_income ?? (budgetMonth > currentMonth ? selectedMonthOverview?.projectedIncome ?? 0 : selectedTotals.income);
  const plannedExpenseEntries = Object.entries(selectedBudget?.planned_expenses ?? {});
  const actualExpenseEntries = Object.entries(selectedTransactions.filter((transaction) => transaction.type === "despesa").reduce<Record<string, number>>((acc, transaction) => {
    const category = transaction.category ?? "Outros";
    acc[category] = (acc[category] ?? 0) + transaction.amount;
    return acc;
  }, {}));
  const expenseEntries = selectedBudget ? plannedExpenseEntries : budgetMonth > currentMonth ? [...forecastRows.recurringExpenses.entries()] : actualExpenseEntries;
  const expenseTotal = expenseEntries.reduce((total, [, value]) => total + value, 0);
  const previousMonth = shiftMonth(budgetMonth, -1);
  const previousBudget = p.budgets.find((item) => item.month === previousMonth);
  const previousTotals = monthlyTotals(p.transactions, previousMonth);
  const previousIncome = previousBudget?.planned_income ?? previousTotals.income;
  const previousExpenses = previousBudget
    ? sum(Object.values(previousBudget.planned_expenses))
    : previousTotals.expenses;
  const incomeChange = previousIncome > 0 ? ((plannedIncome - previousIncome) / previousIncome) * 100 : null;
  const expenseChange = previousExpenses > 0 ? ((expenseTotal - previousExpenses) / previousExpenses) * 100 : null;

  const selectedMonthOverview = overviewData.find((row) => row.month === budgetMonth);

  const goalMonthsSaved = (() => {
    if (!p.settings.goal || !currentProjection.goalMonth || !baseProjection.goalMonth) return null;
    const toIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
    return Math.max(0, toIndex(baseProjection.goalMonth) - toIndex(currentProjection.goalMonth));
  })();
  const goalDelta = currentProjection.goalMonth && baseProjection.goalMonth
    ? currentProjection.goalMonth === baseProjection.goalMonth ? "Mesmo prazo do plano" : goalMonthsSaved && goalMonthsSaved > 0 ? `${goalMonthsSaved} meses antes` : "Prazo maior que o plano"
    : "Defina uma meta para comparar";

  const toggleSeries = (key: keyof typeof visible) => setVisible((current) => ({ ...current, [key]: !current[key] }));
  const selectMonth = (month: string) => setBudgetMonth(month);

  return (
    <>
      <PageHeading eyebrow="OLHANDO MAIS LONGE" title="Sua evolução financeira" description="Veja quanto entra, quanto sai e quando sua reserva pode virar a chave da casa." />

      <section className="projection-kpis">
        <article className="stat-summary"><p>Reserva hoje</p><strong>{money(currentProjection.realNow)}</strong><small>Sem incluir FGTS</small></article>
        <article className="stat-summary"><p>Projeção em 60 meses</p><strong>{money(simulated60)}</strong><small>{money(simulatedDeposit)} de aporte mensal simulado</small></article>
        <article className="stat-summary"><p>Rendimento diário</p><strong>{p.settings.daily_rate.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</strong><small>Capitalização diária</small></article>
        <article className="stat-summary"><p>Sobra média mensal</p><strong>{money(averageSurplus)}</strong><small>Média dos últimos 3 meses (após aportes)</small></article>
        <article className="stat-summary"><p>Taxa de poupança</p><strong>{pct(savingsRate)}</strong><small>Aportes ÷ receitas nos últimos 3 meses</small></article>
        <article className="stat-summary"><p>Previsão da meta</p><strong>{p.settings.goal && currentProjection.goalMonth ? monthName(currentProjection.goalMonth, true) : "Sem previsão"}</strong><small>{p.settings.goal && currentProjection.goalMonth ? `${Math.max(0, (Number(currentProjection.goalMonth.slice(0, 4)) - today.getFullYear()) * 12 + Number(currentProjection.goalMonth.slice(5, 7)) - (today.getMonth() + 1))} meses restantes` : "Defina o valor da meta em Ajustes"}</small></article>
        <article className="stat-summary"><p>Patrimônio em 12 meses</p><strong>{money(simulated12 + p.settings.fgts)}</strong><small>Reserva projetada + FGTS informado</small></article>
      </section>

      <section className="panel projection-chart-panel">
        <div className="projection-chart-header">
          <div><p className="budget-eyebrow">ACOMPANHAMENTO</p><h2>{view === "reserve" ? "Crescimento da reserva" : "Receitas, despesas e patrimônio"}</h2></div>
          <div className="projection-view-switch" role="group" aria-label="Tipo de gráfico">
            <button className={view === "reserve" ? "active" : ""} onClick={() => setView("reserve")}>Reserva</button>
            <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Visão geral</button>
          </div>
        </div>
        <div className="projection-periods" role="group" aria-label="Período do gráfico">
          {periods.map((item) => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}
        </div>
        <ClientOnly fallback={<div className="safe-loading">Preparando seus gráficos…</div>}>
          <div className="projection-large-chart">
            {view === "reserve" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reserveChartData} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                  <XAxis dataKey="month" minTickGap={28} tickFormatter={(month) => monthName(String(month), true).replace(".", "")} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compactMoney} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} width={66} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><p>{monthName(String(label), true)}</p>{payload.filter((item) => item.value !== null).map((item) => <div key={String(item.dataKey)}>{item.name}<strong>{money(Number(item.value))}</strong></div>)}</div> : null} />
                  <ReferenceLine x={currentMonth} stroke="var(--gold)" strokeDasharray="3 3" label={{ value: "Hoje", fill: "var(--gold)", fontSize: 10, position: "insideTopRight" }} />
                  <Line type="monotone" dataKey="plan" name="Plano original" stroke="var(--muted-foreground)" strokeDasharray="3 7" strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="realized" name="Realizado" stroke="var(--primary)" strokeWidth={3} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="future" name="Projeção futura" stroke="var(--deposit)" strokeDasharray="7 5" strokeWidth={2.7} dot={false} connectNulls={false} />
                  {p.settings.goal !== null && <ReferenceLine y={Math.max(0, p.settings.goal - p.settings.fgts)} stroke="var(--gold)" strokeDasharray="5 4" label={{ value: "Meta (entrada)", fill: "var(--gold)", fontSize: 10, position: "insideTopLeft" }} />}
                </LineChart>
              </ResponsiveContainer>
            ) : overviewData.some((row) => row.hasData) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={overviewData} margin={{ top: 12, right: 12, bottom: 8, left: 0 }} onClick={(state: any) => { const month = state?.activeLabel; if (typeof month === "string") selectMonth(month); }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
                  <XAxis dataKey="month" minTickGap={26} tickFormatter={(month) => monthName(String(month), true).replace(".", "")} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="money" tickFormatter={compactMoney} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} axisLine={false} tickLine={false} width={64} />
                  <YAxis yAxisId="wealth" orientation="right" tickFormatter={compactMoney} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = overviewData.find((item) => item.month === label);
                    if (!row) return null;
                    const future = row.isFuture;
                    return <div className="chart-tooltip"><p>{monthName(String(label), true)} {future ? "· estimativa" : "· realizado"}</p><div>Receitas<strong>{money(future ? row.projectedIncome ?? 0 : row.income)}</strong></div><div>Despesas<strong>{money(future ? row.projectedExpenses ?? 0 : row.expenses)}</strong></div><div>Saldo do mês<strong>{money(future ? row.projectedBalance ?? 0 : row.balance)}</strong></div><div>Patrimônio acumulado<strong>{money(future ? row.projectedWealth ?? 0 : row.wealth)}</strong></div></div>;
                  }} />
                  <ReferenceLine x={currentMonth} stroke="var(--gold)" strokeDasharray="3 3" label={{ value: "Hoje", fill: "var(--gold)", fontSize: 10, position: "insideTopRight" }} />
                  {visible.income && <Bar yAxisId="money" dataKey="income" name="Receitas realizadas" fill="var(--income)" radius={[3, 3, 0, 0]} maxBarSize={13} />}
                  {visible.expenses && <Bar yAxisId="money" dataKey="expenses" name="Despesas realizadas" fill="var(--expense)" radius={[3, 3, 0, 0]} maxBarSize={13} />}
                  {visible.income && <Bar yAxisId="money" dataKey="projectedIncome" name="Receitas projetadas" fill="var(--income)" fillOpacity={0.35} stroke="var(--income)" strokeDasharray="3 3" radius={[3, 3, 0, 0]} maxBarSize={13} />}
                  {visible.expenses && <Bar yAxisId="money" dataKey="projectedExpenses" name="Despesas projetadas" fill="var(--expense)" fillOpacity={0.35} stroke="var(--expense)" strokeDasharray="3 3" radius={[3, 3, 0, 0]} maxBarSize={13} />}
                  {visible.balance && <Line yAxisId="money" type="monotone" dataKey="balance" name="Saldo realizado" stroke="var(--gold)" strokeWidth={2.5} dot={false} />}
                  {visible.balance && <Line yAxisId="money" type="monotone" dataKey="projectedBalance" name="Saldo projetado" stroke="var(--gold)" strokeDasharray="6 5" strokeWidth={2.5} dot={false} />}
                  {visible.wealth && <Line yAxisId="wealth" type="monotone" dataKey="wealth" name="Patrimônio realizado" stroke="var(--primary)" strokeWidth={2.8} dot={false} />}
                  {visible.wealth && <Line yAxisId="wealth" type="monotone" dataKey="projectedWealth" name="Patrimônio projetado" stroke="var(--primary)" strokeDasharray="6 5" strokeWidth={2.8} dot={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="projection-empty"><strong>Ainda não há dados suficientes para este período.</strong><span>Cadastre lançamentos ou um orçamento mensal para visualizar sua evolução.</span></div>}
          </div>
        </ClientOnly>
        {view === "overview" ? (
          <div className="projection-legend">
            {([
              ["income", "Receitas", "legend-income"],
              ["expenses", "Despesas", "legend-expense"],
              ["balance", "Saldo do mês", "legend-balance"],
              ["wealth", "Patrimônio", "legend-wealth"],
            ] as const).map(([key, label, style]) => <button key={key} className={visible[key] ? "enabled" : "disabled"} onClick={() => toggleSeries(key)}><i className={style} />{label}</button>)}
            <span className="projection-legend-note">Barras/linhas tracejadas = projeção</span>
          </div>
        ) : (
          <div className="projection-legend">
            <span><i className="legend-plan" />Plano original</span>
            <span><i className="legend-realized" />Realizado</span>
            <span><i className="legend-future" />Projeção futura</span>
            {p.settings.goal !== null && <span><i className="legend-goal" />Meta da casa</span>}
          </div>
        )}
        {view === "reserve" && <div className={reserveDifference >= 0 ? "projection-plan-delta positive" : "projection-plan-delta negative"}>{reserveDifference >= 0 ? "+" : "−"}{money(Math.abs(reserveDifference))} {reserveDifference >= 0 ? "acima" : "abaixo"} do plano original <small>comparação da reserva atual com a referência do plano</small></div>}
        {view === "overview" && <p className="projection-chart-hint">Toque em qualquer mês para atualizar o detalhamento abaixo. Meses futuros usam orçamento cadastrado ou médias recentes.</p>}
      </section>

      <section className="simulation projection-simulation">
        <div><h2>E se eu depositar mais?</h2><p>Altere o aporte mensal e veja o impacto nos gráficos e na data da meta.</p></div>
        <label className="simulation-input"><span>R$</span><input aria-label="Depósito mensal simulado" inputMode="decimal" value={simulation} onChange={(event) => setSimulation(event.target.value)} /><small>/ mês</small></label>
        {!valid && <p role="alert" className="subtle-note text-destructive">Informe um valor igual ou maior que zero.</p>}
        <div className="simulation-comparison">
          <div><span>Plano atual</span><strong>{money(p.settings.monthly_deposit)}/mês</strong><small>Em 5 anos: {money(base60)}</small></div>
          <div><span>Com simulação</span><strong>{money(simulatedDeposit)}/mês</strong><small>Em 5 anos: {money(simulated60)}</small></div>
          <div><span>Diferença em 5 anos</span><strong className={simulated60 >= base60 ? "text-income" : "text-destructive"}>{simulated60 >= base60 ? "+" : "−"}{money(Math.abs(simulated60 - base60))}</strong><small>{goalDelta}</small></div>
        </div>
      </section>

      <section className="panel budget-panel projection-budget">
        <div className="chart-title projection-budget-heading">
          <div><p className="budget-eyebrow">DETALHAMENTO MENSAL</p><h2>Receitas e despesas previstas</h2></div>
          <div className="month-selector">
            <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setBudgetMonth((month) => shiftMonth(month, -1))}>‹</Button>
            <span>{monthName(budgetMonth)}</span>
            <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setBudgetMonth((month) => shiftMonth(month, 1))}>›</Button>
          </div>
        </div>
        <div className="projection-month-comparison">
          <div><span>Receitas vs. mês anterior</span><strong className={incomeChange === null ? "" : incomeChange >= 0 ? "text-income" : "text-destructive"}>{incomeChange === null ? "Sem base de comparação" : `${incomeChange >= 0 ? "↑" : "↓"} ${pct(Math.abs(incomeChange))}`}</strong></div>
          <div><span>Despesas vs. mês anterior</span><strong className={expenseChange === null ? "" : expenseChange <= 0 ? "text-income" : "text-destructive"}>{expenseChange === null ? "Sem base de comparação" : `${expenseChange >= 0 ? "↑" : "↓"} ${pct(Math.abs(expenseChange))}`}</strong></div>
        </div>
        {selectedBudget || selectedTransactions.length || selectedInvoices.length ? (
          <>
            <p className="budget-eyebrow">RECEITAS POR ORIGEM</p>
            {selectedBudget && Object.keys(selectedBudget.planned_income_sources).length ? Object.entries(selectedBudget.planned_income_sources).map(([origin, value]) => <div className="budget-line" key={origin}><span>{origin}</span><strong>{money(value)}</strong></div>) : <p className="subtle-note">Sem detalhamento de receitas por origem neste mês.</p>}
            <div className="budget-line total"><span>Total de receitas {selectedBudget ? "previstas" : "registradas"}</span><strong>{money(plannedIncome)}</strong></div>
            <p className="budget-eyebrow">DESPESAS POR CATEGORIA</p>
            {expenseEntries.length ? expenseEntries.sort((a, b) => b[1] - a[1]).map(([category, value]) => <div className="budget-line" key={category}><span>{category}</span><strong>− {money(value)}</strong></div>) : <p className="subtle-note">Nenhuma despesa detalhada para este mês.</p>}
            {invoiceOutstanding > 0 && !expenseEntries.some(([category]) => category.toLowerCase().includes("fatura")) && <div className="budget-line"><span>Faturas de cartão em aberto</span><strong>− {money(invoiceOutstanding)}</strong></div>}
            <div className="budget-line total"><span>Total de despesas</span><strong>− {money(expenseTotal + (invoiceOutstanding > 0 && !expenseEntries.some(([category]) => category.toLowerCase().includes("fatura")) ? invoiceOutstanding : 0))}</strong></div>
            <div className="budget-line"><span>Aporte mensal do plano</span><strong>− {money(plannedDeposit(budgetMonth, p.settings))}</strong></div>
            <div className="budget-line total"><span>Sobra estimada após despesas e aporte</span><strong>{money(plannedIncome - expenseTotal - (invoiceOutstanding > 0 && !expenseEntries.some(([category]) => category.toLowerCase().includes("fatura")) ? invoiceOutstanding : 0) - plannedDeposit(budgetMonth, p.settings))}</strong></div>
          </>
        ) : <div className="projection-empty compact"><strong>Nenhum dado para {monthName(budgetMonth)}.</strong><span>Quando houver lançamentos, orçamento ou fatura, o detalhamento aparecerá aqui.</span></div>}
        <p className="projection-chart-hint">Mês selecionado no gráfico: {monthName(budgetMonth)}. Valores previstos vêm do orçamento e das faturas; quando não há orçamento futuro, usamos a média dos últimos três meses para receitas e categorias de despesas recorrentes.</p>
      </section>

      <section className="panel table-scroll projection-milestones">
        <div className="chart-title"><h2>Marcos da reserva</h2><span>PLANO ATUAL × SIMULAÇÃO</span></div>
        <table className="data-table"><thead><tr><th>Horizonte</th><th>Plano atual</th><th>Simulação</th><th>Diferença</th></tr></thead><tbody>{currentProjection.milestones.map((milestone) => {
          const base = baseProjection.milestones.find((item) => item.months === milestone.months)?.estimate ?? 0;
          const difference = milestone.estimate - base;
          return <tr key={milestone.months}><td>{milestone.months} meses</td><td>{money(base)}</td><td>{money(milestone.estimate)}</td><td className={difference >= 0 ? "text-income" : "text-destructive"}>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{money(Math.abs(difference))}</td></tr>;
        })}</tbody></table>
      </section>
      <p className="subtle-note projection-method-note">Como calculamos: o rendimento da reserva usa capitalização diária pela taxa configurada. Nos meses passados, usamos lançamentos reais; nos futuros, priorizamos o orçamento cadastrado, somamos faturas em aberto sem duplicar a categoria Fatura e estimamos categorias recorrentes pela média dos últimos três meses (consideradas recorrentes quando aparecem em pelo menos dois). O patrimônio considera a reserva e o saldo financeiro acumulado fora dela; FGTS é mostrado separadamente nos KPIs e na meta da casa.</p>
      <CloudNotice />
    </>
  );
}
