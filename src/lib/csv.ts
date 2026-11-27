import { categories, monthSchema, settingsSchema, transactionSchema, type Settings, type Transaction } from "@/lib/finance";

export const csvHeaders = [
  "tipo_registro", "saldo_inicial", "data_saldo_inicial", "rendimento_diario",
  "aporte_mensal", "inicio_aportes", "fgts", "meta_casa", "data", "tipo",
  "valor", "categoria", "descricao", "mes", "receita_planejada", "despesa_planejada",
] as const;

export type CsvBudget = {
  month: string;
  planned_income: number;
  planned_expenses: Record<string, number>;
};
export type CsvImportData = {
  settings?: Settings;
  transactions: Omit<Transaction, "id">[];
  budgets: CsvBudget[];
  errors: { line: number; message: string }[];
};

const clean = (value: string | undefined) => (value ?? "").trim();
function decimal(value: string, optional = false): number | null {
  if (!clean(value) && optional) return null;
  const raw = clean(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^[+-]?[\d.,]+$/.test(raw)) return NaN;
  return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
}
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ";" && !quoted) {
      row.push(cell); cell = "";
    } else if (char === "\n" && !quoted) {
      row.push(cell); cell = "";
      if (row.some((part) => part.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("Existe uma aspa aberta sem fechamento.");
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[;"\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};
export function createCsv(settings: Settings, transactions: Transaction[], budgets: CsvBudget[]) {
  const rows: unknown[][] = [[...csvHeaders]];
  rows.push(["CONFIGURACAO", settings.initial_balance, settings.initial_date, settings.daily_rate, settings.monthly_deposit, settings.deposit_start, settings.fgts, settings.goal ?? ""]);
  for (const transaction of transactions) rows.push([
    "LANCAMENTO", "", "", "", "", "", "", "", transaction.date, transaction.type,
    transaction.amount, transaction.category ?? "", transaction.description,
  ]);
  for (const budget of budgets) {
    const entries = Object.entries(budget.planned_expenses);
    if (!entries.length) rows.push(["ORCAMENTO", "", "", "", "", "", "", "", "", "", "", "", "", budget.month, budget.planned_income, ""]);
    else for (const [category, amount] of entries) rows.push([
      "ORCAMENTO", "", "", "", "", "", "", "", "", "", "", "", "", budget.month, budget.planned_income, category + "=" + amount,
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
export function parseCsvImport(source: string): CsvImportData {
  const rows = parseRows(source);
  if (!rows.length) throw new Error("O arquivo está vazio.");
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  if (headers.join("|") !== csvHeaders.join("|")) throw new Error("Cabeçalho incompatível. Baixe o modelo CSV atualizado do Plano Casa.");
  const errors: CsvImportData["errors"] = [];
  let settings: Settings | undefined;
  const transactions: CsvImportData["transactions"] = [];
  const budgets = new Map<string, CsvBudget>();
  rows.slice(1).forEach((values, index) => {
    const line = index + 2;
    const row = Object.fromEntries(csvHeaders.map((header, i) => [header, clean(values[i])])) as Record<(typeof csvHeaders)[number], string>;
    try {
      if (values.length > csvHeaders.length) throw new Error("A linha tem mais colunas que o cabeçalho.");
      if (row.tipo_registro === "CONFIGURACAO") {
        if (settings) throw new Error("Há mais de uma linha CONFIGURACAO.");
        const parsed = settingsSchema.safeParse({
          initial_balance: decimal(row.saldo_inicial), initial_date: row.data_saldo_inicial,
          daily_rate: decimal(row.rendimento_diario), monthly_deposit: decimal(row.aporte_mensal),
          deposit_start: row.inicio_aportes, fgts: decimal(row.fgts),
          goal: decimal(row.meta_casa, true),
        });
        if (!parsed.success) throw new Error("Configuração inválida: " + parsed.error.issues.map((issue) => issue.message).join(", "));
        settings = parsed.data;
      } else if (row.tipo_registro === "LANCAMENTO") {
        const parsed = transactionSchema.safeParse({
          date: row.data, type: row.tipo, amount: decimal(row.valor),
          category: row.categoria || null, description: row.descricao,
        });
        if (!parsed.success) throw new Error("Lançamento inválido: " + parsed.error.issues.map((issue) => issue.message).join(", "));
        transactions.push(parsed.data);
      } else if (row.tipo_registro === "ORCAMENTO") {
        if (!monthSchema.safeParse(row.mes).success) throw new Error("Mês do orçamento inválido. Use AAAA-MM.");
        const income = decimal(row.receita_planejada);
        if (income === null || !Number.isFinite(income) || income < 0) throw new Error("Receita planejada inválida.");
        const current = budgets.get(row.mes) ?? { month: row.mes, planned_income: income, planned_expenses: {} };
        if (current.planned_income !== income) throw new Error("A receita planejada deve ser igual em todas as linhas do mesmo mês.");
        if (row.despesa_planejada) {
          const split = row.despesa_planejada.lastIndexOf("=");
          if (split < 1) throw new Error("Despesa planejada deve seguir Categoria=Valor.");
          const category = row.despesa_planejada.slice(0, split).trim();
          const amount = decimal(row.despesa_planejada.slice(split + 1));
          if (!(categories as readonly string[]).includes(category)) throw new Error("Categoria de orçamento desconhecida: " + category);
          if (amount === null || !Number.isFinite(amount) || amount < 0) throw new Error("Valor da despesa planejada inválido.");
          if (Object.hasOwn(current.planned_expenses, category)) throw new Error("Categoria repetida neste mês: " + category);
          current.planned_expenses[category] = amount;
        }
        budgets.set(row.mes, current);
      } else throw new Error("tipo_registro deve ser CONFIGURACAO, LANCAMENTO ou ORCAMENTO.");
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : "Dados inválidos." });
    }
  });
  return { settings, transactions, budgets: [...budgets.values()], errors };
}
