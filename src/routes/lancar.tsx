import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import {
  PageHeading,
  TransactionList,
  transactionIcons,
  CloudNotice,
} from "@/components/plan/shared";
import {
  types,
  typeLabels,
  isoDate,
  categories,
  parseDecimal,
  transactionSchema,
  type TransactionType,
  RECEIVABLE_PREFIX,
} from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
import { toast } from "sonner";
export const Route = createFileRoute("/lancar")({
  validateSearch: (s: Record<string, unknown>): { type?: TransactionType; receivable?: boolean } => {
    const t = s["type"];
    return typeof t === "string" && types.includes(t as TransactionType)
      ? { type: t as TransactionType, receivable: s["receivable"] === true }
      : {};
  },
  head: () =>
    pageHead("Lançar", "Registre despesas, receitas, bônus e movimentações da reserva da casa."),
  component: Launch,
});
function Launch() {
  const search = Route.useSearch();
  return <LaunchForm key={`${search.type ?? "despesa"}-${search.receivable ? "receivable" : "normal"}`} initialType={search.type ?? "despesa"} initialReceivable={search.receivable ?? false} />;
}
function LaunchForm({ initialType, initialReceivable }: { initialType: TransactionType; initialReceivable: boolean }) {
  const p = usePlan(),
    navigate = useNavigate();
  const [type, setType] = useState<TransactionType>(initialType),
    [isReceivable, setIsReceivable] = useState(initialReceivable),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(isoDate()),
    [category, setCategory] = useState<(typeof categories)[number]>("Aluguel"),
    [description, setDescription] = useState(""),
    [receivableSource, setReceivableSource] = useState(""),
    [paymentMethod, setPaymentMethod] = useState<"none" | "credit_card">("none"),
    [creditCardId, setCreditCardId] = useState(p.creditCards[0]?.id ?? ""),
    [installments, setInstallments] = useState("1"),
    [depositBonus, setDepositBonus] = useState(false),
    [busy, setBusy] = useState(false);
  const selectedCardId = creditCardId || p.creditCards[0]?.id || "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = transactionSchema.safeParse({
      date,
      type,
      amount: parseDecimal(amount),
      category: type === "despesa" ? category : null,
      description: isReceivable ? RECEIVABLE_PREFIX + description.trim() : description,
    });
    if (!result.success) {
      toast.error("Informe uma data válida e um valor maior que zero.");
      return;
    }
    if (isReceivable && !receivableSource.trim()) {
      toast.error("Informe de quem ou de onde você vai receber esse valor.");
      return;
    }
    if (isReceivable) {
      result.data.description = RECEIVABLE_PREFIX + "Fonte: " + receivableSource.trim() + " | " + description.trim();
    }
    if (paymentMethod === "credit_card" && (!selectedCardId || !p.creditCards.some((card) => card.id === selectedCardId))) {
      toast.error("Selecione um cartão de crédito válido.");
      return;
    }
    const installmentCount = Number(installments);
    if (paymentMethod === "credit_card" && (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 48)) {
      toast.error("Informe entre 1 e 48 parcelas.");
      return;
    }
    setBusy(true);
    const saved = await p.add(
      result.data,
      depositBonus,
      type === "despesa" && paymentMethod === "credit_card"
        ? { method: "credit_card", cardId: selectedCardId, installments: installmentCount }
        : undefined,
    );
    setBusy(false);
    if (saved) await navigate({ to: "/", search: { month: date.slice(0, 7) } });
  }
  return (
    <>
      <PageHeading
        eyebrow="UM PASSO DE CADA VEZ"
        title="Novo lançamento"
        description="Cada valor faz parte da sua conquista."
      />
      <div className="form-layout">
        <section className="panel form-panel">
          <form className="form-stack" onSubmit={submit}>
            <div className="field-label">
              Tipo de lançamento
              <div className="type-picker" role="group" aria-label="Tipo de lançamento">
                {types.map((t) => {
                  const Icon = transactionIcons[t];
                  return (
                    <Button
                      key={t}
                      type="button"
                      aria-pressed={type === t && !isReceivable}
                      variant={type === t && !isReceivable ? "default" : "outline"}
                      onClick={() => { setType(t); setIsReceivable(false); }}
                    >
                      <Icon />
                      {typeLabels[t]}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  aria-pressed={isReceivable}
                  variant={isReceivable ? "default" : "outline"}
                  onClick={() => { setType("recebimento"); setIsReceivable(true); }}
                >
                  <Clock />
                  A receber
                </Button>
              </div>
            </div>
            {isReceivable && (
              <>
                <p className="subtle-note receivable-form-note">Informe quem vai pagar ou de onde virá o dinheiro. O valor só entra nas receitas quando você marcar como recebido.</p>
                <label>
                  Fonte do recebimento
                  <input
                    value={receivableSource}
                    onChange={(e) => setReceivableSource(e.target.value)}
                    maxLength={120}
                    placeholder="Ex.: Empresa, cliente, pessoa..."
                    required
                  />
                </label>
              </>
            )}
            <div className="field-grid">
              <label>
                Valor
                <div className="amount-input">
                  <span>R$</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    required
                    aria-label="Valor"
                  />
                </div>
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
            </div>
            {type === "despesa" && (
              <label>
                Categoria
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as (typeof categories)[number])}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            {type === "despesa" && (
              <div className="form-stack">
                <label>
                  Forma de pagamento
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "none" | "credit_card")}
                  >
                    <option value="none">Não informado</option>
                    {p.creditCards.length > 0 && <option value="credit_card">Cartão de crédito</option>}
                  </select>
                </label>
                {paymentMethod === "credit_card" && (
                  <>
                    <label>
                      Cartão
                      <select value={selectedCardId} onChange={(e) => setCreditCardId(e.target.value)} required>
                        {p.creditCards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.name} {card.last_four_digits ? "•••• " + card.last_four_digits : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Número de parcelas
                      <select value={installments} onChange={(e) => setInstallments(e.target.value)}>
                        {Array.from({ length: 48 }, (_, i) => i + 1).map((count) => (
                          <option key={count} value={count}>
                            {count}x {count === 1 ? "à vista" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="subtle-note">
                      O sistema distribuirá o valor nas faturas mensais do cartão automaticamente.
                    </p>
                  </>
                )}
              </div>
            )}
            <label>
              Descrição <span className="text-muted-foreground font-normal">opcional</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder={
                  type === "despesa" ? "Ex.: aluguel de dezembro" : isReceivable ? "Ex.: salário, venda ou valor combinado" : "Ex.: um passo para a casa nova"
                }
              />
            </label>
            {type === "bonus" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={depositBonus}
                  onChange={(e) => setDepositBonus(e.target.checked)}
                />
                Depositar este bônus na reserva da casa
              </label>
            )}
            <Button size="lg" type="submit" disabled={busy || p.loading}>
              {busy ? "Salvando…" : "Salvar lançamento"}
              <Check />
            </Button>
          </form>
        </section>
        <section>
          <div className="recent-title section-heading">
            <h2>Últimos lançamentos</h2>
            <CalendarDays size={16} className="text-muted-foreground" />
          </div>
          <TransactionList rows={p.transactions.slice(0, 5)} emptyAction={false} />
          <p className="subtle-note">
            {type === "retirada"
              ? "Retiradas reduzem a reserva, mas não entram no cálculo da sobra do mês."
              : type === "aporte"
                ? "O aporte é um depósito real na sua reserva, separado do valor planejado."
                : isReceivable
                  ? "Contas a receber ficam pendentes e não entram no saldo até serem recebidas."
                  : "Receitas incluem os recebimentos e os bônus do mês."}
          </p>
        </section>
      </div>
      <CloudNotice />
    </>
  );
}
