import { describe, expect, it } from "vitest";
import { defaults } from "@/lib/finance";
import { createCsv, parseCsvImport } from "@/lib/csv";

describe("Plano Casa CSV", () => {
  it("exports and reimports settings, transactions and monthly budgets", () => {
    const settings = { ...defaults("2026-11-27"), initial_balance: 1200, fgts: 3000, goal: 50000 };
    const csv = createCsv(settings, [{
      id: "00000000-0000-4000-8000-000000000001",
      date: "2026-12-05", type: "despesa", amount: 850,
      category: "Aluguel", description: "Aluguel de dezembro",
    }], [{
      month: "2027-01", planned_income: 4000,
      planned_expenses: { Aluguel: 840, Alimentação: 500 },
    }]);
    const result = parseCsvImport(csv);
    expect(result.errors).toEqual([]);
    expect(result.settings).toEqual(settings);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(850);
    expect(result.budgets).toEqual([{
      month: "2027-01", planned_income: 4000,
      planned_expenses: { Aluguel: 840, Alimentação: 500 },
    }]);
  });

  it("reports invalid data with its source line", () => {
    const csv = createCsv(defaults("2026-11-27"), [], []);
    const invalid = csv + "\r\nLANCAMENTO;;;;;;;;2026-99-99;despesa;10;Aluguel;Inválido";
    const result = parseCsvImport(invalid);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
  });

  it("rejects files with an incompatible header", () => {
    expect(() => parseCsvImport("tipo;valor\nreceita;10")).toThrow(/Cabeçalho incompatível/);
  });
});
