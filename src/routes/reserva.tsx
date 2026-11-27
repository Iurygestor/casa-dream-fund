import { createFileRoute, Link } from "@tanstack/react-router";
import { Landmark, Plus, ArrowUpRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import {
  PageHeading,
  SectionHeading,
  Progress,
  DepositStatus,
  CloudNotice,
} from "@/components/plan/shared";
import {
  isoDate,
  reserveBalance,
  money,
  plannedDeposit,
  monthlyTotals,
  monthName,
  dateValue,
} from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
export const Route = createFileRoute("/reserva")({
  head: () =>
    pageHead(
      "Reserva",
      "Veja sua reserva estimada, FGTS separado e o acompanhamento dos depósitos de 2027.",
    ),
  component: Reserve,
});
function Reserve() {
  const p = usePlan(),
    s = p.settings,
    today = isoDate(),
    balance = reserveBalance(s, p.transactions, today) ?? s.initial_balance,
    total = balance + s.fgts;
  const months = Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}`),
    elapsed = months.filter((m) => m <= today.slice(0, 7)),
    planned = elapsed.reduce((a, m) => a + plannedDeposit(m, s), 0),
    actual = elapsed.reduce(
      (a, m) =>
        a +
        monthlyTotals(
          p.transactions.filter((t) => t.date <= today),
          m,
        ).deposit,
      0,
    );
  return (
    <>
      <PageHeading
        eyebrow="O SEU FUTURO JÁ COMEÇOU"
        title="Reserva da casa"
        action={
          <Button asChild className="large-action">
            <Link to="/lancar" search={{ type: "aporte" }}>
              <Plus />
              Registrar depósito
            </Link>
          </Button>
        }
      />
      <div className="reserve-main">
        <section className="balance-card reserve-balance">
          <div className="balance-top">
            <span>Saldo estimado atual</span>
            <span className="balance-symbol">
              <Landmark size={20} />
            </span>
          </div>
          <p className="balance-value">{money(balance)}</p>
          <p className="subtle-note">
            Até {dateValue(today).toLocaleDateString("pt-BR")} · rendimento diário composto
          </p>
          <div className="balance-bottom">
            <span>
              Rendimento ao dia{" "}
              <strong>{s.daily_rate.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%</strong>
            </span>
            <span className="balance-tag">Só a reserva, sem FGTS</span>
          </div>
        </section>
        <section className="panel fgts-panel">
          <h2>Seu FGTS, separado</h2>
          <p className="fgts-number">{money(s.fgts)}</p>
          <p className="subtle-note">Sem projeção de novos depósitos.</p>
          <div className="fgts-total">
            <span>Total indicativo</span>
            <strong>{money(total)}</strong>
          </div>
        </section>
      </div>
      {s.goal !== null ? (
        <section className="goal-section">
          <Target size={25} className="text-primary" />
          <div>
            <h2>Meta da sua casa · {money(s.goal)}</h2>
            <Progress value={(total / s.goal) * 100} />
            <p>{money(Math.max(0, s.goal - total))} para a entrada total</p>
          </div>
          <strong className="goal-percent">
            {((total / s.goal) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </strong>
        </section>
      ) : (
        <p className="subtle-note mb-6">
          <Link to="/ajustes" className="info-link">
            Definir a meta da casa <ArrowUpRight size={13} className="inline" />
          </Link>
        </p>
      )}
      <SectionHeading title="Seus depósitos em 2027" aside={<span>PLANEJADO × REAL</span>} />
      <section className="panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Planejado</th>
                <th>Depositado</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const amount = monthlyTotals(p.transactions, m).deposit,
                  expected = plannedDeposit(m, s);
                return (
                  <tr key={m} className={m === today.slice(0, 7) ? "current-month" : ""}>
                    <td>{monthName(m, true)}</td>
                    <td>{money(expected)}</td>
                    <td>{money(amount)}</td>
                    <td>
                      {m > today.slice(0, 7) && amount === 0 ? (
                        <span className="text-muted-foreground">Ainda por vir</span>
                      ) : (
                        <DepositStatus actual={amount} planned={expected} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-totals">
          <span>Acumulado até o mês atual</span>
          <span>
            Planejado <strong>{money(planned)}</strong> · Real <strong>{money(actual)}</strong>
          </span>
        </div>
      </section>
      <p className="subtle-note">
        Saldo de referência: {money(s.initial_balance)} em{" "}
        {dateValue(s.initial_date).toLocaleDateString("pt-BR")}. Aportes e retiradas anteriores a
        essa data não alteram esse saldo.
      </p>
      <CloudNotice />
    </>
  );
}
