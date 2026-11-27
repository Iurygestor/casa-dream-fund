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
const s = defaults("2026-12-01");
const row = (type: Transaction["type"], amount: number, date = "2026-12-01"): Transaction => ({
  id: "00000000-0000-4000-8000-000000000001",
  date,
  type,
  amount,
  category: type === "despesa" ? "Outros" : null,
  description: "",
});
describe("Regras do Plano Casa", () => {
  it("usa saldo inicial de 9808,96", () => expect(s.initial_balance).toBe(9808.96));
  it("usa rendimento diário de 0,0568%", () => expect(s.daily_rate).toBe(0.0568));
  it("usa depósito de 800 desde janeiro de 2027", () => {
    expect(s.monthly_deposit).toBe(800);
    expect(s.deposit_start).toBe("2027-01");
  });
  it("mantém FGTS de 6565,52 separado e meta vazia", () => {
    expect(s.fgts).toBe(6565.52);
    expect(s.goal).toBeNull();
  });
  it("dezembro tem resultado -16,01 e nenhum depósito", () => {
    const b = budget("2026-12", s);
    expect(b.income).toBe(3412.4);
    expect(b.expenses).toBe(3428.41);
    expect(b.remaining).toBeCloseTo(-16.01, 2);
    expect(b.deposit).toBe(0);
  });
  it.each([
    ["2027-01", 2714.21],
    ["2027-02", 2496.79],
    ["2027-03", 2496.79],
    ["2027-04", 2324.04],
    ["2027-05", 2205.92],
    ["2028-12", 2205.92],
  ])("respeita despesas previstas %s", (m, v) => {
    expect(budget(m, s).expenses).toBe(v);
    expect(budget(m, s).income).toBe(4000);
    expect(budget(m, s).remaining).toBeCloseTo(4000 - v - 800);
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
    const p = projection(defaults("2026-11-27"), [], 800, "2026-11-27");
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
