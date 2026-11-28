import { createFileRoute, Link } from "@tanstack/react-router";
import { Landmark, Plus, ArrowUpRight, Target, Pencil, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import {
  PageHeading,
  SectionHeading,
  Progress,
  DepositStatus,
  CloudNotice,
  Confirm,
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
  const [editing, setEditing] = useState<(typeof p.transactions)[number] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dateInput, setDateInput] = useState(today);
  const [saving, setSaving] = useState(false);
  const withdrawals = p.transactions
    .filter((transaction) => transaction.type === "retirada")
    .sort((a, b) => b.date.localeCompare(a.date));

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
      <SectionHeading title="Histórico de retiradas" aside={<span>{withdrawals.length} {withdrawals.length === 1 ? "MOVIMENTAÇÃO" : "MOVIMENTAÇÕES"}</span>} />
      <section className="panel withdrawal-history">
        <div className="withdrawal-history-total">
          <span>Total retirado registrado</span>
          <strong>{money(withdrawals.reduce((sum, item) => sum + item.amount, 0))}</strong>
        </div>
        {withdrawals.length ? withdrawals.map((transaction) => (
          <div className="withdrawal-entry" key={transaction.id}>
            <span className="withdrawal-entry-icon"><Wallet size={18} /></span>
            <div className="withdrawal-entry-info">
              <strong>{transaction.description}</strong>
              <span>{dateValue(transaction.date).toLocaleDateString("pt-BR")}</span>
            </div>
            <strong className="withdrawal-entry-value">− {money(transaction.amount)}</strong>
            <div className="withdrawal-entry-actions">
              <Button variant="ghost" size="icon" aria-label="Editar retirada" onClick={() => {
                setEditing(transaction);
                setDescription(transaction.description);
                setAmountInput(String(transaction.amount).replace(".", ","));
                setDateInput(transaction.date);
              }}><Pencil size={16} /></Button>
              <Button variant="ghost" size="icon" aria-label="Excluir retirada" onClick={() => setDeleting(transaction.id)}><Trash2 size={16} /></Button>
            </div>
          </div>
        )) : <p className="withdrawal-empty">Nenhuma retirada registrada ainda.</p>}
      </section>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="income-edit-dialog">
          <DialogTitle>Editar retirada</DialogTitle>
          <DialogDescription>Altere a descrição, o valor ou a data desta movimentação.</DialogDescription>
          <form className="income-edit-form" onSubmit={async (event) => {
            event.preventDefault();
            if (!editing) return;
            const parsedAmount = Number(amountInput.trim().replace(/\\./g, "").replace(",", "."));
            if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !dateInput) return;
            setSaving(true);
            await p.updateTransaction(editing.id, { description: description.trim(), amount: parsedAmount, date: dateInput });
            setSaving(false);
            setEditing(null);
          }}>
            <label>Descrição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} required /></label>
            <div className="income-edit-fields">
              <label>Valor (R$)<input inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} required /></label>
              <label>Data<input type="date" value={dateInput} onChange={(event) => setDateInput(event.target.value)} required /></label>
            </div>
            <div className="income-edit-actions">
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Confirm
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Excluir retirada?"
        description="Essa movimentação será removida do histórico e o saldo da reserva será recalculado."
        onConfirm={async () => { if (deleting) await p.remove(deleting); setDeleting(null); }}
      />
      <CloudNotice />
    </>
  );
}
