import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, CalendarDays } from "lucide-react";
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
} from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
import { toast } from "sonner";
export const Route = createFileRoute("/lancar")({
  validateSearch: (s: Record<string, unknown>): { type?: TransactionType } => {
    const t = s["type"];
    return typeof t === "string" && types.includes(t as TransactionType)
      ? { type: t as TransactionType }
      : {};
  },
  head: () =>
    pageHead("Lançar", "Registre despesas, receitas, bônus e movimentações da reserva da casa."),
  component: Launch,
});
function Launch() {
  const search = Route.useSearch();
  return <LaunchForm key={search.type ?? "despesa"} initialType={search.type ?? "despesa"} />;
}
function LaunchForm({ initialType }: { initialType: TransactionType }) {
  const p = usePlan(),
    navigate = useNavigate();
  const [type, setType] = useState<TransactionType>(initialType),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(isoDate()),
    [category, setCategory] = useState<(typeof categories)[number]>("Aluguel"),
    [description, setDescription] = useState(""),
    [paymentMethod, setPaymentMethod] = useState<"none" | "credit_card">("none"),
    [creditCardId, setCreditCardId] = useState(p.creditCards[0]?.id ?? ""),
    [installments, setInstallments] = useState("1"),
    [depositBonus, setDepositBonus] = useState(false),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = transactionSchema.safeParse({
      date,
      type,
      amount: parseDecimal(amount),
      category: type === "despesa" ? category : null,
      description,
    });
    if (!result.success) {
      toast.error("Informe uma data válida e um valor maior que zero.");
      return;
    }
    if (paymentMethod === "credit_card" && (!creditCardId || !p.creditCards.some((card) => card.id === creditCardId))) {
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
      paymentMethod === "credit_card"
        ? { method: "credit_card", cardId: creditCardId, installments: installmentCount }
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
                      aria-pressed={type === t}
                      variant={type === t ? "default" : "outline"}
                      onClick={() => setType(t)}
                    >
                      <Icon />
                      {typeLabels[t]}
                    </Button>
                  );
                })}
              </div>
            </div>
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
                      <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)} required>
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
                  type === "despesa" ? "Ex.: aluguel de dezembro" : "Ex.: um passo para a casa nova"
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
                : "Receitas incluem os recebimentos e os bônus do mês."}
          </p>
        </section>
      </div>
      <CloudNotice />
    </>
  );
}
