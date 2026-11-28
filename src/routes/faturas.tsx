import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan, type CreditCard as CreditCardData } from "@/components/plan/provider";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, Empty, CloudNotice, Confirm, SectionHeading } from "@/components/plan/shared";
import { money, monthName, dateValue, parseDecimal } from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
import { toast } from "sonner";

export const Route = createFileRoute("/faturas")({
  head: () => pageHead("Cartões e faturas", "Cadastre seus cartões e acompanhe as faturas."),
  component: InvoicesPage,
});

type CardForm = {
  name: string;
  institution: string;
  last_four_digits: string;
  credit_limit: string;
  closing_day: string;
  due_day: string;
};

const emptyForm: CardForm = {
  name: "",
  institution: "",
  last_four_digits: "",
  credit_limit: "",
  closing_day: "30",
  due_day: "10",
};

function InvoicesPage() {
  const p = usePlan();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCardData | null>(null);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState<CreditCardData | null>(null);
  const cards = new Map(p.creditCards.map((card) => [card.id, card]));

  function openNewCard() {
    if (!p.user) {
      p.setAuthOpen(true);
      toast.info("Entre na sua conta para cadastrar um cartão.");
      return;
    }
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditCard(card: CreditCardData) {
    setEditing(card);
    setForm({
      name: card.name,
      institution: card.institution,
      last_four_digits: card.last_four_digits ?? "",
      credit_limit: String(card.credit_limit).replace(".", ","),
      closing_day: String(card.closing_day),
      due_day: String(card.due_day),
    });
    setFormOpen(true);
  }

  async function saveCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!p.user) {
      p.setAuthOpen(true);
      return;
    }
    const limit = parseDecimal(form.credit_limit);
    const closingDay = Number(form.closing_day);
    const dueDay = Number(form.due_day);
    if (!form.name.trim() || !form.institution.trim() || !Number.isFinite(limit) || limit <= 0) {
      toast.error("Preencha o nome, a instituição e um limite válido.");
      return;
    }
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 ||
        !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      toast.error("Informe dias de fechamento e vencimento entre 1 e 31.");
      return;
    }
    setSaving(true);
    const values = {
      name: form.name.trim().slice(0, 80),
      institution: form.institution.trim().slice(0, 80),
      last_four_digits: form.last_four_digits.replace(/\D/g, "").slice(-4) || null,
      credit_limit: limit,
      closing_day: closingDay,
      due_day: dueDay,
    };
    try {
      const query = supabase.from("credit_cards" as any) as any;
      const result = editing
        ? await query.update(values).eq("user_id", p.user.id).eq("id", editing.id)
        : await query.insert({ ...values, user_id: p.user.id });
      if (result.error) throw result.error;
      await p.refetch();
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
      toast.success(editing ? "Cartão atualizado." : "Cartão cadastrado.");
    } catch (error) {
      console.error("Erro ao salvar cartão:", error);
      toast.error("Não foi possível salvar o cartão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateCard() {
    if (!p.user || !deactivating) return;
    const { error } = await (supabase.from("credit_cards" as any) as any)
      .update({ is_active: false })
      .eq("user_id", p.user.id)
      .eq("id", deactivating.id);
    if (error) throw error;
    await p.refetch();
    setDeactivating(null);
    toast.success("Cartão removido da sua lista.");
  }

  return (
    <>
      <PageHeading
        eyebrow="CARTÕES DE CRÉDITO"
        title="Faturas"
        description="Cadastre seus cartões para organizar compras, limites, fechamento e vencimento das faturas."
        action={<Button onClick={openNewCard}><Plus size={17} /> Novo cartão</Button>}
      />

      <section className="cards-management-section">
        <SectionHeading title="Meus cartões" aside={<span>{p.creditCards.length} cadastrados</span>} />
        {formOpen && (
          <form className="panel card-form-panel" onSubmit={saveCard}>
            <div className="card-form-heading">
              <div>
                <strong>{editing ? "Editar cartão" : "Cadastrar cartão"}</strong>
                <p>Seus dados ficam vinculados à sua conta.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setFormOpen(false)} aria-label="Fechar formulário">
                <X size={18} />
              </Button>
            </div>
            <div className="card-form-grid">
              <label>Nome do cartão
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Cartão principal" maxLength={80} required />
              </label>
              <label>Banco ou instituição
                <input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="Ex.: C6 Bank" maxLength={80} required />
              </label>
              <label>Últimos 4 dígitos <span>(opcional)</span>
                <input value={form.last_four_digits} onChange={(e) => setForm({ ...form, last_four_digits: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="0000" maxLength={4} />
              </label>
              <label>Limite total
                <div className="card-limit-input"><span>R$</span><input value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} inputMode="decimal" placeholder="0,00" required /></div>
              </label>
              <label>Dia de fechamento
                <input type="number" min="1" max="31" value={form.closing_day} onChange={(e) => setForm({ ...form, closing_day: e.target.value })} required />
              </label>
              <label>Dia de vencimento
                <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} required />
              </label>
            </div>
            <p className="card-form-hint">Não informe o número completo do cartão, senha ou código de segurança.</p>
            <div className="card-form-actions">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar cartão"}</Button>
            </div>
          </form>
        )}

        {p.creditCards.length ? (
          <div className="registered-cards-grid">
            {p.creditCards.map((card) => {
              const cardInvoices = p.creditCardInvoices.filter((invoice) => invoice.card_id === card.id);
              const unpaid = cardInvoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.paid_amount), 0);
              const available = Math.max(0, card.credit_limit - unpaid);
              return (
                <article className="registered-card" key={card.id}>
                  <div className="registered-card-top">
                    <span className="registered-card-icon"><CreditCard size={20} /></span>
                    <div className="registered-card-actions">
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEditCard(card)} aria-label={`Editar ${card.name}`}><Pencil size={16} /></Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => setDeactivating(card)} aria-label={`Remover ${card.name}`}><Trash2 size={16} /></Button>
                    </div>
                  </div>
                  <strong className="registered-card-name">{card.name}</strong>
                  <span className="registered-card-bank">{card.institution}{card.last_four_digits ? ` ···· ${card.last_four_digits}` : ""}</span>
                  <div className="registered-card-limit">
                    <span>Limite total</span><strong>{money(card.credit_limit)}</strong>
                  </div>
                  <div className="registered-card-limit">
                    <span>Limite disponível estimado</span><strong>{money(available)}</strong>
                  </div>
                  <div className="registered-card-dates">
                    <span>Fecha dia <b>{card.closing_day}</b></span>
                    <span>Vence dia <b>{card.due_day}</b></span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <Empty
              title="Você ainda não cadastrou um cartão"
              description="Adicione seu cartão de crédito para selecionar a forma de pagamento ao lançar uma despesa e acompanhar as faturas automaticamente."
              action={<Button onClick={openNewCard}><Plus size={16} /> Cadastrar primeiro cartão</Button>}
            />
          </div>
        )}
      </section>

      <section className="transactions-section">
        <SectionHeading title="Faturas geradas" aside={<span>{p.creditCardInvoices.length} faturas</span>} />
        <div className="panel">
          {p.creditCardInvoices.length ? (
            <div className="transaction-list card-invoice-list">
              {p.creditCardInvoices.map((invoice) => {
                const card = cards.get(invoice.card_id);
                const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount);
                const statusLabel = invoice.status === "paid" ? "Paga" : invoice.status === "closed" ? "Fechada" : "Em aberto";
                return (
                  <div className="transaction-row" key={invoice.id}>
                    <span className="transaction-icon tone-aporte"><CreditCard size={19} /></span>
                    <div className="transaction-info">
                      <strong>{card?.name ?? "Cartão"} · {monthName(invoice.reference_month.slice(0, 7))}</strong>
                      <span>Fecha {dateValue(invoice.closing_date).toLocaleDateString("pt-BR")} · Vence {dateValue(invoice.due_date).toLocaleDateString("pt-BR")}</span>
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
              title="Nenhuma fatura gerada ainda"
              description="Depois de cadastrar um cartão e lançar compras usando a opção Cartão de crédito, as faturas aparecerão aqui."
            />
          )}
        </div>
      </section>
      <CloudNotice />
      <Confirm
        open={!!deactivating}
        onOpenChange={(open) => { if (!open) setDeactivating(null); }}
        title="Remover cartão?"
        description={`O cartão ${deactivating?.name ?? ""} deixará de aparecer nas opções de pagamento. O histórico de compras e faturas será preservado.`}
        onConfirm={deactivateCard}
        label="Remover cartão"
      />
    </>
  );
}
