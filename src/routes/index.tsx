import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpLeft,
  Landmark,
  Wallet,
  Plus,
  CalendarDays,
  House,
  CircleHelp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import {
  PageHeading,
  SectionHeading,
  Progress,
  Empty,
  TransactionList,
  CloudNotice,
} from "@/components/plan/shared";
import {
  monthlyTotals,
  plannedDeposit,
  money,
  monthName,
  monthSchema,
  shiftMonth,
  reserveBalance,
} from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { month?: string } => {
    const p = monthSchema.safeParse(search["month"]);
    return p.success ? { month: p.data } : {};
  },
  head: () =>
    pageHead(
      "Início",
      "Acompanhe seu orçamento mensal, aportes e a reserva para comprar sua casa.",
    ),
  component: Index,
});
function Index() {
  const p = usePlan(),
    search = Route.useSearch(),
    navigate = Route.useNavigate(),
    month = search.month ?? "2026-12";
  const [categoryMode, setCategoryMode] = useState<"real" | "plan">("real");
  const totals = monthlyTotals(p.transactions, month),
    monthlyPlan = p.budgets.find((item) => item.month === month),
    plannedIncome = monthlyPlan?.planned_income ?? 0,
    plannedCategories = Object.entries(monthlyPlan?.planned_expenses ?? {})
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    plannedExpenses = plannedCategories.reduce((sum, item) => sum + item.amount, 0),
    planDeposit = plannedDeposit(month, p.settings),
    plan = {
      income: plannedIncome,
      expenses: plannedExpenses,
      deposit: planDeposit,
      remaining: plannedIncome - plannedExpenses - planDeposit,
    },
    balance = reserveBalance(p.settings, p.transactions) ?? p.settings.initial_balance;
  const cats =
    categoryMode === "plan"
      ? plannedCategories
      : Object.entries(
          totals.rows
            .filter((t) => t.type === "despesa")
            .reduce<Record<string, number>>((a, t) => {
              const key = t.category ?? "Outros";
              a[key] = (a[key] ?? 0) + t.amount;
              return a;
            }, {}),
        )
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount);
  const catsTotal = cats.reduce((a, c) => a + c.amount, 0);
  const metrics = [
    {
      label: "Receitas",
      value: totals.income,
      planned: plan.income,
      icon: ArrowDownLeft,
      tone: "recebimento",
      progress: "income",
    },
    {
      label: "Despesas",
      value: totals.expenses,
      planned: plan.expenses,
      icon: ArrowUpLeft,
      tone: "despesa",
      progress: "expense",
    },
    {
      label: "Na reserva",
      value: totals.deposit,
      planned: plan.deposit,
      icon: Landmark,
      tone: "aporte",
      progress: "deposit",
    },
    {
      label: "Retiradas",
      value: totals.withdrawals,
      planned: 0,
      icon: Wallet,
      tone: "retirada",
      progress: "withdrawal",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={p.displayName ? `Olá, ${p.displayName.split(" ")[0]}` : "CADA PASSO CONTA"}
        title="Seu mês em perspectiva"
        action={
          <div className="month-selector">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              onClick={() => navigate({ to: "/", search: { month: shiftMonth(month, -1) } })}
            >
              <ChevronLeft size={17} />
            </Button>
            <span>{monthName(month)}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              onClick={() => navigate({ to: "/", search: { month: shiftMonth(month, 1) } })}
            >
              <ChevronRight size={17} />
            </Button>
          </div>
        }
      />
      <div className="dashboard-grid dashboard-top">
        <section className="balance-card">
          <div className="balance-top">
            <span>Sobra do mês após depósito</span>
            <span className="balance-symbol">
              <ArrowUpRight size={19} />
            </span>
          </div>
          <div className="balance-value">
            <small>R$</small>
            {totals.remaining.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="balance-bottom">
            <span>
              Previsto no plano <strong>{money(plan.remaining)}</strong>
            </span>
            <span className="balance-tag">
              {totals.rows.length ? "Valores realizados" : "Mês ainda sem lançamentos"}
            </span>
          </div>
        </section>
        <section className="reserve-summary">
          <div className="reserve-summary-top">
            <div>
              <h2>A caminho da sua casa</h2>
              <p className="reserve-number">{money(balance)}</p>
              <p className="subtle-note">Reserva estimada atual</p>
            </div>
            <span className="reserve-symbol">
              <House size={25} />
            </span>
          </div>
          <div className="reserve-bottom">
            <span>FGTS separado · {money(p.settings.fgts)}</span>
            <Link to="/reserva">
              Ver reserva
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
      </div>
      <div className="metrics-grid">
        {metrics.map(({ label, value, planned, icon: Icon, tone, progress }) => (
          <section className="metric-card" key={label}>
            <div className="metric-header">
              <span>{label}</span>
              <div className={`metric-icon tone-${tone}`}>
                <Icon size={15} />
              </div>
            </div>
            <p className="metric-value">{money(value)}</p>
            <Progress
              value={planned > 0 ? (value / planned) * 100 : 0}
              className={`progress-${progress}`}
            />
            <div className="metric-foot">
              <span>
                {planned > 0
                  ? `de ${money(planned)} previstos`
                  : tone === "retirada"
                    ? "Fora da sobra mensal"
                    : "Sem depósito previsto"}
              </span>
              <span>{planned > 0 ? `${Math.round((value / planned) * 100)}%` : "—"}</span>
            </div>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section>
          <SectionHeading
            title="Despesas por categoria"
            aside={
              <div className="segmented">
                <Button
                  variant="ghost"
                  className={categoryMode === "real" ? "selected" : ""}
                  onClick={() => setCategoryMode("real")}
                >
                  Real
                </Button>
                <Button
                  variant="ghost"
                  className={categoryMode === "plan" ? "selected" : ""}
                  onClick={() => setCategoryMode("plan")}
                >
                  Plano
                </Button>
              </div>
            }
          />
          <div className="panel categories-panel">
            {cats.length ? (
              <>
                {cats.map((c) => (
                  <div className="category-row" key={c.category}>
                    <span className="category-name">
                      <span className="category-dot" />
                      {c.category}
                    </span>
                    <Progress value={(c.amount / Math.max(...cats.map((c) => c.amount))) * 100} />
                    <strong>{money(c.amount)}</strong>
                  </div>
                ))}
                <div className="category-total">
                  <span>Total {categoryMode === "plan" ? "de referência" : "do mês"}</span>
                  <strong>{money(catsTotal)}</strong>
                </div>
              </>
            ) : (
              <Empty
                title={
                  categoryMode === "real"
                    ? "Tudo tranquilo por aqui"
                    : "Sem detalhamento para este mês"
                }
                description={
                  categoryMode === "real"
                    ? "Suas despesas aparecerão conforme os lançamentos."
                    : "Cadastre um orçamento para este mês para visualizar as categorias planejadas."
                }
                action={
                  categoryMode === "real" ? (
                    <Button variant="outline" asChild>
                      <Link to="/lancar">
                        <Plus />
                        Registrar despesa
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        </section>
        <section>
          <SectionHeading title="Orçamento do plano" aside={<span>COMPARATIVO</span>} />
          <div className="panel budget-panel">
            <p className="budget-eyebrow">
              <CalendarDays size={14} />
              <span className="capitalize">{monthName(month)}</span>
            </p>
            <div className="budget-line">
              <span>Receita prevista</span>
              <strong>{money(plan.income)}</strong>
            </div>
            {Object.entries(monthlyPlan?.planned_income_sources ?? {}).map(([origin, amount]) => (
              <div className="budget-line" key={origin}>
                <span>{origin}</span>
                <strong>{money(amount)}</strong>
              </div>
            ))}
            <div className="budget-line">
              <span>Despesas previstas</span>
              <strong>− {money(plan.expenses)}</strong>
            </div>
            <div className="budget-line">
              <span>Depósito planejado</span>
              <strong>− {money(plan.deposit)}</strong>
            </div>
            <div className="budget-line total">
              <span>Sobra após depósito</span>
              <strong>{money(plan.remaining)}</strong>
            </div>
            <p className="budget-note">
              {monthlyPlan
                ? "Valores planejados cadastrados para este mês."
                : "Nenhum orçamento cadastrado para este mês."}
            </p>
          </div>
        </section>
      </div>
      <section className="transactions-section">
        <SectionHeading
          title="Lançamentos do mês"
          aside={
            <Button variant="link" asChild>
              <Link to="/lancar">
                <Plus />
                Novo lançamento
              </Link>
            </Button>
          }
        />
        <TransactionList rows={totals.rows} />
      </section>
      <CloudNotice />
    </>
  );
}
