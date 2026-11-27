import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { usePlan } from "@/components/plan/provider";
import { PageHeading, Empty, CloudNotice } from "@/components/plan/shared";
import { money, monthName, dateValue } from "@/lib/finance";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/faturas")({
  head: () => pageHead("Faturas", "Acompanhe as faturas e parcelas dos seus cartões de crédito."),
  component: InvoicesPage,
});

function InvoicesPage() {
  const p = usePlan();
  const cards = new Map(p.creditCards.map((card) => [card.id, card]));

  return (
    <>
      <PageHeading
        eyebrow="CARTÕES DE CRÉDITO"
        title="Faturas"
        description="Acompanhe os valores, vencimentos e pagamentos das compras parceladas."
      />
      <section className="panel settings-panel">
        {p.creditCardInvoices.length ? (
          <div className="transaction-list">
            {p.creditCardInvoices.map((invoice) => {
              const card = cards.get(invoice.card_id);
              const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount);
              const statusLabel =
                invoice.status === "paid" ? "Paga" : invoice.status === "closed" ? "Fechada" : "Em aberto";
              return (
                <div className="transaction-row" key={invoice.id}>
                  <span className="transaction-icon tone-aporte">
                    <CreditCard size={19} />
                  </span>
                  <div className="transaction-info">
                    <strong>{card?.name ?? "Cartão"} · {monthName(invoice.reference_month.slice(0, 7))}</strong>
                    <span>
                      Fecha {dateValue(invoice.closing_date).toLocaleDateString("pt-BR")} · Vence {dateValue(invoice.due_date).toLocaleDateString("pt-BR")}
                    </span>
                    <span>{statusLabel} · Pago: {money(invoice.paid_amount)}</span>
                  </div>
                  <div className="transaction-value">
                    <strong>{money(invoice.total_amount)}</strong>
                    {remaining > 0 && <span className="text-muted-foreground text-xs">Restam {money(remaining)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Nenhuma fatura por enquanto"
            description="Quando você registrar uma compra no cartão de crédito, as faturas aparecerão aqui automaticamente."
            action={undefined}
          />
        )}
      </section>
      <CloudNotice />
    </>
  );
}
