import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import { PageHeading, SectionHeading, CloudNotice } from "@/components/plan/shared";
import { projection, parseDecimal, money, compactMoney, monthName, shiftMonth } from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
export const Route = createFileRoute("/projecao")({
  head: () =>
    pageHead(
      "Projeção",
      "Simule seus depósitos e compare o plano original com a projeção da reserva até 2031.",
    ),
  component: Projection,
});
function Projection() {
  const p = usePlan();
  return <ProjectionView key={p.settings.monthly_deposit} />;
}
function ProjectionView() {
  const p = usePlan(),
    [simulation, setSimulation] = useState(String(p.settings.monthly_deposit).replace(".", ",")),
    [budgetMonth, setBudgetMonth] = useState("2026-12"),
    budget = p.budgets.find((item) => item.month === budgetMonth),
    incomeSources = Object.entries(budget?.planned_income_sources ?? {}),
    expenseItems = Object.entries(budget?.planned_expenses ?? {}).sort((a, b) => b[1] - a[1]),
    budgetExpenses = expenseItems.reduce((sum, [, value]) => sum + value, 0);
  const amount = parseDecimal(simulation),
    valid = Number.isFinite(amount) && amount >= 0,
    result = useMemo(
      () => projection(p.settings, p.transactions, valid ? amount : p.settings.monthly_deposit),
      [p.settings, p.transactions, amount, valid],
    );
  const last = result.milestones[2];
  return (
    <>
      <PageHeading
        eyebrow="OLHANDO MAIS LONGE"
        title="O futuro da sua reserva"
        description="Do primeiro depósito à chave da sua casa."
      />
      <div className="projection-summary">
        <div className="stat-summary">
          <p>Reserva hoje</p>
          <strong>{money(result.realNow)}</strong>
          <small>Sem incluir FGTS</small>
        </div>
        <div className="stat-summary">
          <p>Projeção em 60 meses</p>
          <strong>{money(last?.estimate ?? 0)}</strong>
          <small>Com {money(valid ? amount : p.settings.monthly_deposit)} por mês</small>
        </div>
        <div className="stat-summary">
          <p>{p.settings.goal ? "Meta da casa" : "Rendimento diário"}</p>
          <strong>
            {p.settings.goal
              ? result.goalMonth
                ? monthName(result.goalMonth, true)
                : "Sem previsão"
              : `${p.settings.daily_rate.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`}
          </strong>
          <small>{p.settings.goal ? "Reserva + FGTS" : "Taxa atual do plano"}</small>
        </div>
      </div>
      <section className="panel chart-panel">
        <div className="chart-title">
          <h2>Crescimento da reserva</h2>
          <span>DEZ 2026 — DEZ 2031</span>
        </div>
        <ClientOnly fallback={<div className="safe-loading">Preparando projeção…</div>}>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.points} margin={{ top: 8, right: 15, bottom: 5, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis
                  dataKey="month"
                  ticks={["2026-12", "2027-12", "2028-12", "2029-12", "2030-12", "2031-12"]}
                  tickFormatter={(m) => String(m).slice(0, 4)}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  tickFormatter={compactMoney}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  width={63}
                />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="chart-tooltip">
                        <p>{monthName(String(label), true)}</p>
                        {payload
                          .filter((v) => v.value !== null)
                          .map((v) => (
                            <div key={v.dataKey}>
                              {v.name}
                              <strong>{money(Number(v.value))}</strong>
                            </div>
                          ))}
                      </div>
                    ) : null
                  }
                />
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="Plano original"
                  stroke="var(--muted-foreground)"
                  strokeDasharray="6 5"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Realizado"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="future"
                  name="Projeção futura"
                  stroke="var(--deposit)"
                  strokeDasharray="2 4"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
                {p.settings.goal !== null && (
                  <ReferenceLine
                    y={p.settings.goal}
                    stroke="var(--gold)"
                    strokeDasharray="4 4"
                    label={{
                      value: "Meta da casa",
                      position: "insideTopLeft",
                      fill: "var(--withdrawal)",
                      fontSize: 10,
                    }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ClientOnly>
        <div className="chart-legend">
          <span>
            <i className="legend-line legend-plan" />
            Plano original
          </span>
          <span>
            <i className="legend-line" />
            Realizado
          </span>
          <span>
            <i className="legend-line legend-future" />
            Projeção futura
          </span>
          {p.settings.goal && (
            <span>
              <i className="legend-line legend-goal" />
              Meta
            </span>
          )}
        </div>
      </section>
      <div className="simulation">
        <div>
          <h2>E se eu depositar mais?</h2>
          <p>Depósito mensal simulado</p>
        </div>
        <label className="simulation-input">
          <span>R$</span>
          <input
            aria-label="Depósito mensal simulado"
            inputMode="decimal"
            value={simulation}
            onChange={(e) => setSimulation(e.target.value)}
          />
          <small>/ mês</small>
        </label>
      </div>
      {!valid && (
        <p role="alert" className="subtle-note text-destructive mb-4">
          Informe um valor igual ou maior que zero.
        </p>
      )}
      <section className="panel budget-panel projection-budget">
        <div className="chart-title">
          <h2>Receitas e despesas previstas</h2>
          <div className="month-selector">
            <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setBudgetMonth((m) => shiftMonth(m, -1))}>‹</Button>
            <span>{monthName(budgetMonth)}</span>
            <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setBudgetMonth((m) => shiftMonth(m, 1))}>›</Button>
          </div>
        </div>
        {budget ? (
          <>
            <p className="budget-eyebrow">RECEITAS POR ORIGEM</p>
            {incomeSources.length ? incomeSources.map(([origin, value]) => (
              <div className="budget-line" key={origin}><span>{origin}</span><strong>{money(value)}</strong></div>
            )) : <p className="subtle-note">Sem detalhamento de receitas para este mês.</p>}
            <div className="budget-line total"><span>Total de receitas previstas</span><strong>{money(budget.planned_income)}</strong></div>
            <p className="budget-eyebrow">DESPESAS POR CATEGORIA</p>
            {expenseItems.map(([category, value]) => (
              <div className="budget-line" key={category}><span>{category}</span><strong>− {money(value)}</strong></div>
            ))}
            <div className="budget-line total"><span>Total de despesas previstas</span><strong>− {money(budgetExpenses)}</strong></div>
            <div className="budget-line"><span>Aporte mensal planejado</span><strong>− {money(p.settings.monthly_deposit)}</strong></div>
            <div className="budget-line total"><span>Sobra estimada após despesas e aporte</span><strong>{money(budget.planned_income - budgetExpenses - (budgetMonth >= p.settings.deposit_start ? p.settings.monthly_deposit : 0))}</strong></div>
          </>
        ) : <p className="subtle-note">Nenhum orçamento cadastrado para {monthName(budgetMonth)}.</p>}
      </section>
      <section className="panel table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Horizonte</th>
              <th>Plano original</th>
              <th>Projeção</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>
            {result.milestones.map((m) => (
              <tr key={m.months}>
                <td>{m.months} meses</td>
                <td>{money(m.plan)}</td>
                <td>{money(m.estimate)}</td>
                <td className={m.difference >= 0 ? "text-income" : "text-destructive"}>
                  {m.difference > 0 ? "+ " : ""}
                  {money(m.difference)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="subtle-note">
        Plano original: períodos de 30 dias desde dezembro de 2026. Projeção: meses a partir de
        hoje, com dias reais do calendário. Valores somente da reserva, sem FGTS. O aporte restante
        do mês corrente usa o planejado; a simulação vale para os meses seguintes.
      </p>
      <CloudNotice />
    </>
  );
}
