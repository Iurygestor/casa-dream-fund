import { describe, expect, it } from "vitest";
import {
  defaults,
  budget,
  monthlyTotals,
  reserveBalance,
  bonusEntries,
  projection,
  parseDecimal,
  transactionSchema,
} from "./finance";
import type { Transaction } from "./finance";
const s = {
  initial_balance: 9808.96,
  initial_date: "2026-12-01",
  daily_rate: 0.0568,
  monthly_deposit: 800,
  deposit_start: "2027-01",
  fgts: 6565.52,
  goal: null,
};
const row = (type: Transaction["type"], amount: number, date = "2026-12-01"): Transaction => ({
  id: "00000000-0000-4000-8000-000000000001",
  date,
  type,
  amount,
  category: type === "despesa" ? "Outros" : null,
  description: "",
});
describe("Regras do Plano Casa", () => {
  it("novas contas começam com parâmetros financeiros neutros", () => {
    const fresh = defaults("2026-12-01");
    expect(fresh.initial_balance).toBe(0);
    expect(fresh.daily_rate).toBe(0);
    expect(fresh.monthly_deposit).toBe(0);
    expect(fresh.deposit_start).toBe("2026-12");
    expect(fresh.fgts).toBe(0);
    expect(fresh.goal).toBeNull();
  });
  it("calcula o orçamento usando somente valores recebidos do usuário", () => {
    const b = budget("2027-01", s, 4000, 2714.21);
    expect(b.income).toBe(4000);
    expect(b.expenses).toBe(2714.21);
    expect(b.remaining).toBeCloseTo(485.79);
    expect(b.deposit).toBe(800);
  });
  it("retirada não diminui sobra e bônus conta como receita", () => {
    const t = monthlyTotals(
      [
        row("recebimento", 4000),
        row("bonus", 200),
        row("despesa", 2205.92),
        row("aporte", 800),
        row("retirada", 300),
      ],
      "2026-12",
    );
    expect(t.remaining).toBeCloseTo(1194.08);
    expect(t.withdrawals).toBe(300);
  });
  it("aplica rendimento composto e movimentos nas datas corretas", () => {
    const r = reserveBalance(
      { ...s, initial_balance: 1000, daily_rate: 1 },
      [row("aporte", 100, "2026-12-02"), row("retirada", 50, "2026-12-03")],
      "2026-12-04",
    );
    expect(r).toBeCloseTo(((1000 * 1.01 + 100) * 1.01 - 50) * 1.01);
  });
  it("não projeta dados anteriores ao saldo inicial", () =>
    expect(reserveBalance(s, [], "2026-11-30")).toBeNull());
  it("bônus marcado cria um aporte de valor igual", () => {
    const entries = bonusEntries(row("bonus", 350), true);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.type).toBe("aporte");
    expect(entries[1]?.amount).toBe(350);
  });
  it("bônus desmarcado não cria aporte", () =>
    expect(bonusEntries(row("bonus", 350), false)).toHaveLength(1));
  it("gráfico tem 61 pontos de dezembro 2026 a dezembro 2031", () => {
    const p = projection(s, [], 800, "2026-12-01");
    expect(p.points).toHaveLength(61);
    expect(p.points[0]?.month).toBe("2026-12");
    expect(p.points[60]?.month).toBe("2031-12");
  });
  it("plano usa 30 dias compostos e depósito no fim do mês", () =>
    expect(projection(s, [], 800, "2026-12-01").points[1]?.plan).toBeCloseTo(
      9808.96 * Math.pow(1.000568, 30) + 800,
    ));
  it("inclui os dias restantes de novembro antes do primeiro ponto de dezembro", () => {
    const p = projection({ ...s, initial_date: "2026-11-27" }, [], 800, "2026-11-27");
    expect(p.points[0]?.future).toBeCloseTo(9808.96 * Math.pow(1.000568, 34));
  });
  it("FGTS não muda a linha da reserva", () =>
    expect(projection({ ...s, fgts: 99999 }, [], 800, "2026-12-01").points).toEqual(
      projection(s, [], 800, "2026-12-01").points,
    ));
  it("projeção corrente adiciona somente o aporte que falta", () => {
    const p = projection(
      { ...s, initial_date: "2027-01-01", daily_rate: 0 },
      [row("aporte", 300, "2027-01-10")],
      900,
      "2027-01-15",
    );
    expect(p.points[1]?.future).toBe(9808.96 + 800);
    expect(p.points[2]?.future).toBe(9808.96 + 800 + 900);
  });
  it("aceita vírgula e ponto decimal", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("1234.56")).toBe(1234.56);
    expect(parseDecimal("0,0568")).toBe(0.0568);
  });
  it("rejeita lançamentos de valor zero ou negativo", () => {
    expect(transactionSchema.safeParse(row("aporte", 0)).success).toBe(false);
    expect(transactionSchema.safeParse(row("aporte", -1)).success).toBe(false);
  });
});
