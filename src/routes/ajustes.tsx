import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  UserRound,
  SlidersHorizontal,
  Download,
  Upload,
  Trash2,
  Smartphone,
  Share,
  PlusSquare,
  Save,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/components/plan/provider";
import { PageHeading, Confirm, CloudNotice } from "@/components/plan/shared";
import { parseDecimal, settingsSchema, isoDate, type Settings } from "@/lib/finance";
import { pageHead } from "@/lib/metadata";
import { createCsv, csvHeaders, parseCsvImport, type CsvImportData } from "@/lib/csv";
import { toast } from "sonner";
export const Route = createFileRoute("/ajustes")({
  head: () =>
    pageHead(
      "Ajustes",
      "Edite o perfil e os parâmetros do plano, importe e exporte seus dados em CSV e adicione o Plano Casa à tela inicial do iPhone.",
    ),
  component: SettingsPage,
});
function SettingsPage() {
  const p = usePlan();
  return (
    <SettingsForm key={`${p.user?.id ?? "guest"}-${JSON.stringify(p.settings)}-${p.displayName}`} />
  );
}
function SettingsForm() {
  const p = usePlan(),
    csvInput = useRef<HTMLInputElement>(null),
    [name, setName] = useState(p.displayName),
    [fields, setFields] = useState<Record<keyof Settings, string>>({
      initial_balance: String(p.settings.initial_balance).replace(".", ","),
      initial_date: p.settings.initial_date,
      daily_rate: String(p.settings.daily_rate).replace(".", ","),
      monthly_deposit: String(p.settings.monthly_deposit).replace(".", ","),
      deposit_start: p.settings.deposit_start,
      fgts: String(p.settings.fgts).replace(".", ","),
      goal: p.settings.goal === null ? "" : String(p.settings.goal).replace(".", ","),
    }),
    [busy, setBusy] = useState(false),
    [clearOpen, setClearOpen] = useState(false),
    [csvPreview, setCsvPreview] = useState<CsvImportData | null>(null),
    [csvBusy, setCsvBusy] = useState(false);
  const set = (key: keyof Settings, value: string) => setFields((f) => ({ ...f, [key]: value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = settingsSchema.safeParse({
      initial_balance: parseDecimal(fields.initial_balance),
      initial_date: fields.initial_date,
      daily_rate: parseDecimal(fields.daily_rate),
      monthly_deposit: parseDecimal(fields.monthly_deposit),
      deposit_start: fields.deposit_start,
      fgts: parseDecimal(fields.fgts),
      goal: fields.goal.trim() ? parseDecimal(fields.goal) : null,
    });
    if (!result.success) {
      toast.error(
        "Confira os valores e as datas. A meta deve ser maior que zero; os demais valores não podem ser negativos.",
      );
      return;
    }
    setBusy(true);
    await p.saveSettings(result.data, name);
    setBusy(false);
  }
  function downloadCsv(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  function downloadCsvTemplate() {
    downloadCsv("\uFEFF" + csvHeaders.join(";") + "\r\n", "modelo-plano-casa.csv");
  }
  function exportCsv() {
    if (!p.user) { p.setAuthOpen(true); return; }
    downloadCsv(createCsv(p.settings, p.transactions, p.budgets, p.displayName), `plano-casa-${isoDate()}.csv`);
    toast.success("Planilha CSV exportada");
  }
  async function readCsv(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseCsvImport(await file.text());
      setCsvPreview(parsed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o CSV.");
    }
    if (csvInput.current) csvInput.current.value = "";
  }
  async function confirmCsvImport() {
    if (!csvPreview) return;
    setCsvBusy(true);
    try {
      const result = await p.importCsv(csvPreview);
      toast.success(`Importação concluída: ${result.inserted} lançamentos novos; ${result.duplicates} duplicados ignorados.`);
      setCsvPreview(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar a planilha.");
      throw error;
    } finally { setCsvBusy(false); }
  }
  return (
    <>
      <PageHeading eyebrow="DO SEU JEITO" title="Ajustes do plano" />
      <div className="settings-layout">
        <form onSubmit={save} className="panel settings-panel">
          <h2>
            <UserRound size={17} />
            Seu perfil
          </h2>
          <div className="settings-fields">
            <label className="full">
              Nome de exibição
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                maxLength={100}
                autoComplete="name"
              />
            </label>
            {p.user && <p className="full subtle-note">{p.user.email}</p>}
          </div>
          <h2 className="mt-8">
            <SlidersHorizontal size={17} />
            Parâmetros financeiros
          </h2>
          <div className="settings-fields">
            <label>
              Saldo inicial da reserva (R$)
              <input
                inputMode="decimal"
                required
                value={fields.initial_balance}
                onChange={(e) => set("initial_balance", e.target.value)}
              />
            </label>
            <label>
              Data do saldo inicial
              <input
                type="date"
                required
                value={fields.initial_date}
                onChange={(e) => set("initial_date", e.target.value)}
              />
            </label>
            <label>
              Rendimento diário (%)
              <input
                inputMode="decimal"
                required
                value={fields.daily_rate}
                onChange={(e) => set("daily_rate", e.target.value)}
              />
              <small>Taxa diária, não mensal.</small>
            </label>
            <label>
              Depósito mensal (R$)
              <input
                inputMode="decimal"
                required
                value={fields.monthly_deposit}
                onChange={(e) => set("monthly_deposit", e.target.value)}
              />
            </label>
            <label>
              Início dos depósitos
              <input
                type="month"
                required
                value={fields.deposit_start}
                onChange={(e) => set("deposit_start", e.target.value)}
              />
            </label>
            <label>
              Saldo do FGTS (R$)
              <input
                inputMode="decimal"
                required
                value={fields.fgts}
                onChange={(e) => set("fgts", e.target.value)}
              />
            </label>
            <label className="full">
              Meta da casa (R$)
              <input
                inputMode="decimal"
                value={fields.goal}
                onChange={(e) => set("goal", e.target.value)}
                placeholder="Valor total da entrada"
              />
              <small>Opcional · reserva e FGTS serão considerados juntos na meta.</small>
            </label>
          </div>
          <div className="settings-save">
            <Button type="submit" disabled={busy || p.loading}>
              <Save />
              {busy ? "Salvando…" : "Salvar ajustes"}
            </Button>
          </div>
        </form>
        <div className="settings-side">
          <section className="panel settings-panel">
            <h2>
              <ShieldCheck size={17} />
              Seus dados
            </h2>
            <div className="mt-4 border-t pt-4">
              <h3 className="font-semibold">Planilha CSV — Plano Casa</h3>
              <p className="subtle-note">Preencha no Excel ou Google Planilhas. Adicione uma linha CONFIGURACAO, linhas LANCAMENTO, ORCAMENTO e RECEITA_PLANEJADA conforme necessário. Use datas AAAA-MM-DD, meses AAAA-MM, valores em reais, despesas no formato Categoria=Valor e origens de receita com nome e valor. A soma das origens deve bater com a receita planejada mensal. Receitas planejadas não viram lançamentos realizados.</p>
              <p className="subtle-note">Colunas: CONFIGURACAO preenche B–H e Q (nome); LANCAMENTO usa I=data, J=tipo, K=valor, L=categoria e M=descrição; ORCAMENTO usa N=mês, O=receita total e P=Categoria=Valor; RECEITA_PLANEJADA usa N=mês, R=origem e S=valor (uma linha por origem). Tipos de lançamento real: despesa, recebimento, bonus, aporte ou retirada. Reserva usa aporte/retirada.</p>
              {csvPreview && csvPreview.errors.length > 0 && (
                <div className="mt-3 rounded-lg border border-destructive/40 p-3" role="alert">
                  <strong className="text-sm">A planilha contém {csvPreview.errors.length} erro(s). Corrija e importe novamente.</strong>
                  <ul className="mt-2 list-disc pl-5 text-sm">
                    {csvPreview.errors.slice(0, 30).map((error) => <li key={error.line}>Linha {error.line}: {error.message}</li>)}
                  </ul>
                  {csvPreview.errors.length > 30 && <p className="subtle-note">Exibindo os primeiros 30 erros.</p>}
                  <Button className="mt-3" variant="outline" size="sm" onClick={() => setCsvPreview(null)}>Fechar</Button>
                </div>
              )}
              {csvPreview && csvPreview.errors.length === 0 && (
                <p className="subtle-note mt-2">Prévia: {csvPreview.settings ? "1 configuração; " : ""}{csvPreview.transactions.length} lançamento(s); {csvPreview.budgets.length} orçamento(s) mensal(is); {csvPreview.budgets.reduce((sum, budget) => sum + Object.keys(budget.planned_income_sources).length, 0)} origem(ns) de receita prevista.</p>
              )}
              <div className="settings-action">
                <Download size={19} />
                <div><strong>Baixar modelo CSV</strong><p>Modelo padrão para preencher.</p></div>
                <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>Baixar modelo</Button>
              </div>
              <div className="settings-action">
                <Upload size={19} />
                <div><strong>Importar planilha preenchida</strong><p>Validar antes de gravar.</p></div>
                <Button variant="outline" size="sm" onClick={() => { if (!p.user) { p.setAuthOpen(true); return; } csvInput.current?.click(); }}>Importar CSV</Button>
                <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void readCsv(e.target.files?.[0])} />
              </div>
              <div className="settings-action">
                <Download size={19} />
                <div><strong>Exportar todos os dados em CSV</strong><p>Configurações, lançamentos e orçamentos.</p></div>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={p.loading}>Exportar CSV</Button>
              </div>
            </div>
            <div className="settings-action">
              <Trash2 size={19} className="danger-action" />
              <div>
                <strong>Apagar lançamentos</strong>
                <p>Mantém seu perfil e os ajustes.</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Apagar todos os lançamentos"
                aria-label="Apagar todos os lançamentos"
                onClick={() => {
                  if (!p.user) {
                    p.setAuthOpen(true);
                    return;
                  }
                  setClearOpen(true);
                }}
              >
                <Trash2 size={18} className="danger-action" />
              </Button>
            </div>
          </section>
          <section className="panel settings-panel">
            <h2>
              <Smartphone size={17} />
              No seu iPhone
            </h2>
            <div className="install-step">
              <span>1</span>
              <p>Abra o Plano Casa no Safari.</p>
            </div>
            <div className="install-step">
              <span>2</span>
              <p>
                Toque em Compartilhar <Share size={15} />.
              </p>
            </div>
            <div className="install-step">
              <span>3</span>
              <p>
                Escolha “Adicionar à Tela de Início” <PlusSquare size={15} /> e confirme.
              </p>
            </div>
          </section>
          {p.user && (
            <Button variant="outline" size="lg" onClick={() => void p.signOut()}>
              <LogOut />
              Sair da conta
            </Button>
          )}
        </div>
      </div>
      <CloudNotice />
      <Confirm
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Apagar todos os lançamentos?"
        description="Seus lançamentos serão excluídos da nuvem em todos os aparelhos. Exporte seus dados em CSV antes de continuar. Os ajustes e o perfil serão mantidos."
        label="Apagar lançamentos"
        onConfirm={p.clear}
      />
      <Confirm
        open={csvPreview !== null && csvPreview.errors.length === 0}
        onOpenChange={(v) => { if (!v && !csvBusy) setCsvPreview(null); }}
        title="Confirmar importação da planilha?"
        description={csvPreview ? `Encontrados: ${csvPreview.settings ? "1 configuração, " : ""}${csvPreview.transactions.length} lançamentos, ${csvPreview.budgets.length} orçamentos mensais e ${csvPreview.budgets.reduce((sum, budget) => sum + Object.keys(budget.planned_income_sources).length, 0)} origens de receita. Os dados atuais serão mantidos; lançamentos idênticos serão ignorados e orçamentos do mesmo mês serão atualizados.` : ""}
        label={csvBusy ? "Importando…" : "Importar dados"}
        onConfirm={confirmCsvImport}
      />
    </>
  );
}
