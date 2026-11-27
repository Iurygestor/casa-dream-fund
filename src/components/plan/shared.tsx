import type { ReactNode } from "react";
import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Plus,
  Landmark,
  ChartNoAxesCombined,
  CreditCard,
  Settings2,
  ArrowUpRight,
  ArrowLeft,
  ShieldCheck,
  Cloud,
  LogIn,
  Trash2,
  ArrowDownLeft,
  ArrowUpLeft,
  Gift,
  Wallet,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePlan } from "./provider";
import {
  money,
  typeLabels,
  dateValue,
  type Transaction,
  type TransactionType,
} from "@/lib/finance";
import { toast } from "sonner";

const navigation = [
  { to: "/", label: "Início", icon: Home },
  { to: "/lancar", label: "Lançar", icon: Plus },
  { to: "/faturas", label: "Faturas", icon: CreditCard },
  { to: "/reserva", label: "Reserva", icon: Landmark },
  { to: "/projecao", label: "Projeção", icon: ChartNoAxesCombined },
  { to: "/ajustes", label: "Ajustes", icon: Settings2 },
] as const;
export const transactionIcons: Record<TransactionType, typeof Home> = {
  despesa: ArrowUpLeft,
  recebimento: ArrowDownLeft,
  bonus: Gift,
  aporte: Landmark,
  retirada: Wallet,
};
export function AppShell({ children }: { children: ReactNode }) {
  const p = usePlan(),
    pathname = useLocation({ select: (l) => l.pathname });
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          <img src="/grana-logo.svg" alt="" />
          <span>
            Grana<span className="brand-sub">CONTROLE FINANCEIRO</span>
          </span>
        </Link>
        <div className="header-actions">
          <span className="privacy-label">
            <ShieldCheck size={15} />
            Seu plano é só seu
          </span>
          <Button
            variant={p.user ? "secondary" : "outline"}
            onClick={() => (p.user ? undefined : p.setAuthOpen(true))}
            asChild={!!p.user}
          >
            {p.user ? (
              <Link to="/ajustes">
                <span className="avatar">
                  {(p.displayName || p.user.email || "P").slice(0, 1).toUpperCase()}
                </span>
                <span className="account-label">{p.displayName || "Minha conta"}</span>
              </Link>
            ) : (
              <>
                <LogIn />
                <span>Entrar</span>
              </>
            )}
          </Button>
        </div>
      </header>
      <main className="main-content">
        {pathname !== "/" && (
          <div className="page-back-wrap">
            <Button variant="ghost" size="sm" asChild className="page-back-button">
              <Link to="/">
                <ArrowLeft size={17} />
                Voltar ao início
              </Link>
            </Button>
          </div>
        )}
        {p.loading ? (
          <div className="status-banner">
            <span className="loading-dot" />
            Carregando seu plano…
          </div>
        ) : p.error ? (
          <div className="status-banner error-banner">
            Não foi possível carregar seu plano.
            <Button variant="link" onClick={p.refetch}>
              Tentar novamente
            </Button>
          </div>
        ) : null}
        {children}
      </main>
      <footer className="disclaimer">
        <ShieldCheck size={15} />
        <p>
          Valores estimados, não garantidos. O rendimento pode variar, ser bruto e sofrer
          tributação. O uso do FGTS depende das regras aplicáveis.
        </p>
      </footer>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {navigation.map(({ to, label, icon: Icon }) => (
          <Button key={to} variant="nav" asChild className={pathname === to ? "nav-active" : ""}>
            <Link to={to}>
              <span className={`nav-icon ${to === "/lancar" ? "launch-icon" : ""}`}>
                <Icon size={21} />
              </span>
              <span>{label}</span>
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="heading-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {aside}
    </div>
  );
}
export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`progress-track ${className}`}>
      <progress value={Math.min(100, Math.max(0, value))} max={100} />
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Wallet size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function CloudNotice() {
  const p = usePlan();
  return !p.user && !p.authLoading ? (
    <div className="cloud-notice">
      <span>
        <Cloud size={17} />
        Seu plano ainda não está salvo
      </span>
      <Button variant="link" onClick={() => p.setAuthOpen(true)}>
        Entrar para sincronizar
        <ArrowUpRight />
      </Button>
    </div>
  ) : null;
}
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  label = "Excluir",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="confirm-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <div className="confirm-actions">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                toast.error("Não foi possível concluir. Tente novamente.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Aguarde…" : label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function TransactionList({
  rows,
  emptyAction = true,
}: {
  rows: Transaction[];
  emptyAction?: boolean;
}) {
  const p = usePlan(),
    [deleting, setDeleting] = useState<Transaction | null>(null);
  return (
    <>
      <div className="transaction-list">
        {rows.length ? (
          rows.map((t) => {
            const Icon = transactionIcons[t.type],
              positive = ["recebimento", "bonus"].includes(t.type);
            return (
              <div className="transaction-row" key={t.id}>
                <span className={`transaction-icon tone-${t.type}`}>
                  <Icon size={19} />
                </span>
                <div className="transaction-info">
                  <strong>{t.description || t.category || typeLabels[t.type]}</strong>
                  <span>
                    {t.type === "despesa" ? t.category : typeLabels[t.type]}
                    <i>·</i>
                    {dateValue(t.date).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                <strong className={`transaction-value ${positive ? "text-income" : ""}`}>
                  {positive ? "+" : t.type === "despesa" || t.type === "retirada" ? "−" : ""}
                  {money(t.amount)}
                </strong>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Excluir lançamento"
                  aria-label={`Excluir ${t.description || t.category || typeLabels[t.type]}`}
                  onClick={() => setDeleting(t)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            );
          })
        ) : (
          <Empty
            title="Nenhum lançamento por aqui"
            description="Um novo mês, uma página em branco."
            action={
              emptyAction ? (
                <Button variant="outline" asChild>
                  <Link to="/lancar">
                    <Plus />
                    Novo lançamento
                  </Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
      <Confirm
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
        title="Excluir lançamento?"
        description={
          deleting
            ? `${money(deleting.amount)} • ${deleting.description || typeLabels[deleting.type]}. Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={async () => {
          if (deleting) await p.remove(deleting.id);
        }}
      />
    </>
  );
}
export function DepositStatus({ actual, planned }: { actual: number; planned: number }) {
  return actual >= planned ? (
    <span className="deposit-check">
      <Check size={15} />
      {planned === 0 ? "Sem aporte" : "Cumprido"}
    </span>
  ) : (
    <span className="deposit-diff">Faltam {money(planned - actual)}</span>
  );
}
