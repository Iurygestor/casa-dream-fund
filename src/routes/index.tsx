import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  House,
  CalendarDays,
  Check,
  Circle,
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import {
  PageHeading,
  SectionHeading,
  Empty,
  CloudNotice,
} from "@/components/plan/shared";
import {
  plannedDeposit,
  money,
  monthName,
  monthSchema,
  shiftMonth,
  reserveBalance,
  dateValue,
  isoDate,
  categories,
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
      "Acompanhe seu orçamento mensal, contas, aportes e a reserva para comprar sua casa.",
    ),
  component: Index,
});

type Bill = { category: (typeof categories)[number]; amount: number; dueDate?: string };
type BillFilter = "all" | "pending" | "paid";
const paymentDescription = (category: string, month: string) => "Baixa de conta: " + category + " | " + month;

function Index() {
  const p = usePlan(),
    search = Route.useSearch(),
    navigate = Route.useNavigate(),
    month = search.month ?? "2026-12";
  const [billFilter, setBillFilter] = useState<BillFilter>("all");
  const [busyBill, setBusyBill] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const monthlyPlan = p.budgets.find((item) => item.month === month);
  const plannedIncome = monthlyPlan?.planned_income ?? 0;
  const plannedCategories = Object.entries(monthlyPlan?.planned_expenses ?? {})
    .map(([category, amount]) => ({
      category: category as (typeof categories)[number],
      amount: Number(amount),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const plannedExpenses = plannedCategories.reduce((sum, item) => sum + item.amount, 0);
  const monthInvoices = p.creditCardInvoices.filter((invoice) => invoice.reference_month.startsWith(month));
  const invoiceTotal = monthInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.paid_amount), 0);
  const bills: Bill[] = plannedCategories.map((item) => ({ ...item }));
  if (invoiceTotal > 0 && !bills.some((item) => item.category === "Fatura C6")) {
    bills.push({ category: "Fatura C6", amount: invoiceTotal, dueDate: monthInvoices.map((invoice) => invoice.due_date).sort()[0] });
  }
  bills.sort((a, b) => b.amount - a.amount);
  const paymentTransactions = p.transactions.filter(
    (transaction) =>
      transaction.type === "despesa" &&
      transaction.description.startsWith("Baixa de conta: ") &&
      transaction.description.endsWith(" | " + month),
  );
  const paidByCategory = new Map(
    paymentTransactions.map((transaction) => [transaction.category ?? "", transaction]),
  );
  const paidBills = bills.filter((bill) => {
    const transaction = paidByCategory.get(bill.category);
    return !!transaction && transaction.amount === bill.amount;
  });
  const pendingBills = bills.filter((bill) => !paidBills.some((paid) => paid.category === bill.category));
  const paidAmount = paidBills.reduce((sum, bill) => sum + bill.amount, 0);
  const totalBills = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const remainingToPay = Math.max(0, totalBills - paidAmount);
  const progress = totalBills > 0 ? Math.min(100, (paidAmount / totalBills) * 100) : 0;
  const allPaid = bills.length > 0 && pendingBills.length === 0;
  const visibleBills = bills.filter((bill) => {
    const paid = paidBills.some((item) => item.category === bill.category);
    return billFilter === "all" || (billFilter === "paid" ? paid : !paid);
  });
  const planDeposit = plannedDeposit(month, p.settings);
  const planRemaining = plannedIncome - plannedExpenses - planDeposit;
  const balance = reserveBalance(p.settings, p.transactions) ?? p.settings.initial_balance;
  const cats = plannedCategories;
  const catsTotal = cats.reduce((sum, item) => sum + item.amount, 0);

  const toggleBill = async (bill: Bill) => {
    if (busyBill || bulkBusy) return;
    setBusyBill(bill.category);
    const existing = paidByCategory.get(bill.category);
    const isSamePayment = !!existing && existing.amount === bill.amount;
    try {
      if (existing) await p.remove(existing.id);
      if (!isSamePayment) {
        await p.add(
          {
            date: isoDate(),
            type: "despesa",
            amount: bill.amount,
            category: bill.category,
            description: paymentDescription(bill.category, month),
          },
          false,
        );
      }
    } finally {
      setBusyBill(null);
    }
  };

  const settleAll = async () => {
    if (bulkBusy || busyBill) return;
    setBulkBusy(true);
    try {
    if (allPaid) {
      for (const bill of bills) {
        const transaction = paidByCategory.get(bill.category);
        if (transaction && transaction.amount === bill.amount) await p.remove(transaction.id);
      }
    } else {
      for (const bill of pendingBills) {
        const previous = paidByCategory.get(bill.category);
        if (previous) await p.remove(previous.id);
        await p.add(
          {
            date: isoDate(),
            type: "despesa",
            amount: bill.amount,
            category: bill.category,
            description: paymentDescription(bill.category, month),
          },
          false,
        );
      }
    }
    } finally {
      setBulkBusy(false);
    }
  };

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

      <section className="quick-launch-actions" aria-label="Atalhos de lançamento">
        <Link to="/lancar" search={{ type: "receita" }} className="quick-launch-card quick-launch-income">
          <span className="quick-launch-icon"><TrendingUp size={19} /></span>
          <span><strong>Nova receita</strong><small>Registrar dinheiro que entrou</small></span>
          <ArrowUpRight size={17} className="quick-launch-arrow" />
        </Link>
        <Link to="/lancar" search={{ type: "despesa" }} className="quick-launch-card quick-launch-expense">
          <span className="quick-launch-icon"><TrendingDown size={19} /></span>
          <span><strong>Nova despesa</strong><small>Registrar um pagamento ou compra</small></span>
          <ArrowUpRight size={17} className="quick-launch-arrow" />
        </Link>
      </section>

      <div className="dashboard-grid dashboard-top month-highlight-grid">
        <section className="balance-card month-balance-card">
          <div className="balance-top">
            <span>Falta pagar neste mês</span>
            <span className="balance-symbol"><Wallet size={18} /></span>
          </div>
          <div className="balance-value">
            <small>R$</small>
            {remainingToPay.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="month-progress-track" aria-label={`${Math.round(progress)}% das contas pagas`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="month-balance-stats">
            <div><strong>{money(paidAmount)}</strong><span>Valor pago</span></div>
            <div><strong>{paidBills.length} de {bills.length}</strong><span>Contas pagas</span></div>
            <div><strong>{money(totalBills)}</strong><span>Total do mês</span></div>
          </div>
        </section>

        <section className="reserve-summary month-reserve-card">
          <div className="reserve-summary-top">
            <div>
              <h2>A caminho da sua casa</h2>
              <p className="reserve-number">{money(balance)}</p>
              <p className="subtle-note">Reserva atual</p>
            </div>
            <span className="reserve-symbol"><House size={25} /></span>
          </div>
          <div className="reserve-details">
            <div><span>FGTS separado</span><strong>{money(p.settings.fgts)}</strong></div>
            <div><span>Depósito planejado</span><strong>{money(planDeposit)}</strong></div>
          </div>
          <div className="reserve-bottom">
            <span>Seu objetivo, passo a passo</span>
            <Link to="/reserva">Ver reserva <ArrowUpRight size={14} /></Link>
          </div>
        </section>
      </div>

      <section className="bills-section">
        <SectionHeading
          title="Contas do mês"
          aside={<span>{paidBills.length} de {bills.length} pagas</span>}
        />
        <div className="panel bills-panel">
          <div className="bill-toolbar">
            <div className="bill-filters" aria-label="Filtrar contas">
              <Button variant="ghost" className={billFilter === "all" ? "selected" : ""} onClick={() => setBillFilter("all")}>Todas</Button>
              <Button variant="ghost" className={billFilter === "pending" ? "selected" : ""} onClick={() => setBillFilter("pending")}>A pagar</Button>
              <Button variant="ghost" className={billFilter === "paid" ? "selected" : ""} onClick={() => setBillFilter("paid")}>Pagas</Button>
            </div>
            <span className="bill-total-label">{money(totalBills)} no mês</span>
          </div>
          {visibleBills.length ? (
            <div className="bill-list">
              {visibleBills.map((bill) => {
                const transaction = paidByCategory.get(bill.category);
                const paid = !!transaction && transaction.amount === bill.amount;
                const isBusy = busyBill === bill.category || bulkBusy;
                return (
                  <button
                    type="button"
                    className={`bill-row ${paid ? "is-paid" : ""}`}
                    key={bill.category}
                    onClick={() => void toggleBill(bill)}
                    disabled={isBusy}
                    aria-pressed={paid}
                    aria-label={`${paid ? "Desfazer baixa de" : "Dar baixa em"} ${bill.category}`}
                  >
                    <span className="bill-check">{isBusy ? <span className="bill-spinner" /> : paid ? <Check size={17} /> : <Circle size={21} />}</span>
                    <span className="bill-main">
                      <strong>{bill.category}</strong>
                      <span>{paid && transaction ? `Pago em ${dateValue(transaction.date).toLocaleDateString("pt-BR")}` : bill.dueDate ? `Vencimento ${dateValue(bill.dueDate).toLocaleDateString("pt-BR")}` : "Vencimento não informado"}</span>
                    </span>
                    <span className={`bill-status ${paid ? "paid" : "pending"}`}>{paid ? "Pago" : "A pagar"}</span>
                    <strong className="bill-amount">{money(bill.amount)}</strong>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bill-empty">
              {billFilter === "paid" ? "Nenhuma conta paga por enquanto." : billFilter === "pending" ? "Todas as contas estão pagas." : "Nenhuma despesa prevista cadastrada para este mês."}
            </div>
          )}
          {bills.length > 0 && (
            <div className="bill-actions">
              <Button variant={allPaid ? "outline" : "default"} onClick={() => void settleAll()} disabled={bulkBusy || !!busyBill}>
                {bulkBusy ? "Atualizando contas…" : allPaid ? "Desfazer todas as baixas" : "Dar baixa em todas as pendentes"}
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="dashboard-grid month-detail-grid">
        <section>
          <SectionHeading title="Orçamento do plano" aside={<span>COMPARATIVO</span>} />
          <div className="panel budget-panel month-budget-panel">
            <p className="budget-eyebrow"><CalendarDays size={14} /><span className="capitalize">{monthName(month)}</span></p>
            <div className="budget-line"><span>Receita prevista</span><strong>{money(plannedIncome)}</strong></div>
            <div className="budget-line"><span>Despesas previstas</span><strong>− {money(plannedExpenses)}</strong></div>
            <div className="budget-line"><span>Depósito planejado</span><strong>− {money(planDeposit)}</strong></div>
            <div className={`budget-line total ${planRemaining < 0 ? "is-negative" : ""}`}>
              <span>Sobra após depósito</span><strong>{money(planRemaining)}</strong>
            </div>
            <p className="budget-note">{monthlyPlan ? "Valores planejados cadastrados para este mês." : "Nenhum orçamento cadastrado para este mês."}</p>
          </div>
        </section>

        <section>
          <SectionHeading title="Por categoria" aside={<span>DESPESAS PREVISTAS</span>} />
          <div className="panel categories-panel month-categories-panel">
            {cats.length ? (
              <>
                {cats.map((item) => (
                  <div className="category-row" key={item.category}>
                    <span className="category-name"><span className="category-dot" />{item.category}</span>
                    <div className="category-bar"><span style={{ width: `${(item.amount / Math.max(...cats.map((entry) => entry.amount))) * 100}%` }} /></div>
                    <strong>{money(item.amount)}</strong>
                  </div>
                ))}
                <div className="category-total"><span>Total previsto</span><strong>{money(catsTotal)}</strong></div>
              </>
            ) : (
              <Empty title="Sem categorias previstas" description="Cadastre as despesas do mês no seu orçamento para visualizar a distribuição." />
            )}
          </div>
        </section>
      </div>

      <section className="transactions-section month-payments-section">
        <SectionHeading title="Lançamentos do mês" aside={<span>SAÍDAS CONFIRMADAS</span>} />
        {paymentTransactions.length ? (
          <div className="transaction-list">
            {paymentTransactions.map((transaction) => (
              <div className="transaction-row month-payment-row" key={transaction.id}>
                <span className="transaction-icon tone-despesa"><ArrowUpRight size={17} /></span>
                <div className="transaction-info">
                  <strong>{transaction.category}</strong>
                  <span>Pago em {dateValue(transaction.date).toLocaleDateString("pt-BR")}</span>
                </div>
                <strong className="transaction-value month-payment-value">− {money(transaction.amount)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel no-payments-empty">Ainda sem saídas. Toque em uma conta acima para dar baixa.</div>
        )}
        <div className="month-new-entry">
          <Button variant="outline" asChild><Link to="/lancar"><Plus size={16} /> Novo lançamento</Link></Button>
        </div>
      </section>
      <CloudNotice />
    </>
  );
}
