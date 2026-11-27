import { categories, monthSchema, settingsSchema, transactionSchema, type Settings, type Transaction } from "@/lib/finance";

export const csvHeaders = [
  "tipo_registro", "saldo_inicial", "data_saldo_inicial", "rendimento_diario",
  "aporte_mensal", "inicio_aportes", "fgts", "meta_casa", "data", "tipo",
  "valor", "categoria", "descricao", "mes", "receita_planejada", "despesa_planejada", "nome_exibicao",
  "origem_receita", "valor_receita",
] as const;

export type CsvBudget = {
  month: string;
  planned_income: number;
  planned_expenses: Record<string, number>;
  planned_income_sources: Record<string, number>;
};
export type CsvImportData = {
  settings?: Settings;
  transactions: Omit<Transaction, "id">[];
  budgets: CsvBudget[];
  displayName?: string;
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
export function createCsv(settings: Settings, transactions: Transaction[], budgets: CsvBudget[], displayName = "") {
  const rows: unknown[][] = [[...csvHeaders]];
  rows.push(["CONFIGURACAO", settings.initial_balance, settings.initial_date, settings.daily_rate, settings.monthly_deposit, settings.deposit_start, settings.fgts, settings.goal ?? "", "", "", "", "", "", "", "", "", displayName, "", ""]);
  for (const transaction of transactions) rows.push([
    "LANCAMENTO", "", "", "", "", "", "", "", transaction.date, transaction.type,
    transaction.amount, transaction.category ?? "", transaction.description, "", "", "", "", "",
  ]);
  for (const budget of budgets) {
    const entries = Object.entries(budget.planned_expenses);
    if (!entries.length) rows.push(["ORCAMENTO", "", "", "", "", "", "", "", "", "", "", "", "", budget.month, budget.planned_income, "", "", "", ""]);
    else for (const [category, amount] of entries) rows.push([
      "ORCAMENTO", "", "", "", "", "", "", "", "", "", "", "", "", budget.month, budget.planned_income, category + "=" + amount, "", "", "",
    ]);
    for (const [origin, amount] of Object.entries(budget.planned_income_sources ?? {})) rows.push([
      "RECEITA_PLANEJADA", "", "", "", "", "", "", "", "", "", "", "", "", budget.month, "", "", "", origin, amount,
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}
export function parseCsvImport(source: string): CsvImportData {
  const rows = parseRows(source);
  if (rows.length < 2) throw new Error("Adicione ao menos um registro depois do cabeçalho.");
  const headerRow = rows[0];
  if (!headerRow) throw new Error("Cabeçalho CSV ausente.");
  const headers = headerRow.map((h) => h.trim().toLowerCase());
  if (headers.join("|") !== csvHeaders.join("|")) throw new Error("Cabeçalho incompatível. Baixe o modelo CSV atualizado do Plano Casa.");
  const errors: CsvImportData["errors"] = [];
  let settings: Settings | undefined;
  let displayName: string | undefined;
  const transactions: CsvImportData["transactions"] = [];
  const budgets = new Map<string, CsvBudget>();
  const incomeSources = new Map<string, { sources: Record<string, number>; lines: number[] }>();
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
        displayName = row.nome_exibicao || undefined;
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
        const current = budgets.get(row.mes) ?? { month: row.mes, planned_income: income, planned_expenses: {}, planned_income_sources: {} };
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
      } else if (row.tipo_registro === "RECEITA_PLANEJADA") {
        if (!monthSchema.safeParse(row.mes).success) throw new Error("Mês da receita planejada inválido. Use AAAA-MM.");
        const origin = row.origem_receita.trim();
        if (!origin || origin.length > 100) throw new Error("Informe a origem da receita (até 100 caracteres).");
        const amount = decimal(row.valor_receita);
        if (amount === null || !Number.isFinite(amount) || amount <= 0) throw new Error("Valor da receita planejada deve ser maior que zero.");
        const current = incomeSources.get(row.mes) ?? { sources: {}, lines: [] };
        if (Object.hasOwn(current.sources, origin)) throw new Error("Origem de receita repetida neste mês: " + origin);
        current.sources[origin] = amount;
        current.lines.push(line);
        incomeSources.set(row.mes, current);
      } else throw new Error("tipo_registro deve ser CONFIGURACAO, LANCAMENTO, ORCAMENTO ou RECEITA_PLANEJADA.");
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : "Dados inválidos." });
    }
  });
  for (const [month, entry] of incomeSources) {
    const budget = budgets.get(month);
    if (!budget) {
      errors.push({ line: entry.lines[0] ?? 2, message: "Cadastre também uma linha ORCAMENTO para o mês desta receita." });
      continue;
    }
    const sourceTotal = Object.values(entry.sources).reduce((sum, amount) => sum + amount, 0);
    if (Math.round(sourceTotal * 100) !== Math.round(budget.planned_income * 100)) {
      errors.push({
        line: entry.lines[0] ?? 2,
        message: `A soma das origens de receita (${sourceTotal.toFixed(2)}) deve ser igual à receita planejada do mês (${budget.planned_income.toFixed(2)}).`,
      });
      continue;
    }
    budget.planned_income_sources = entry.sources;
  }
  return {
    ...(settings ? { settings } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    transactions,
    budgets: [...budgets.values()],
    errors,
  };
}
