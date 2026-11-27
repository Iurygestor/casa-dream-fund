import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/metadata";
export const Route = createFileRoute("/reset-password")({
  head: () =>
    pageHead(
      "Redefinir senha",
      "Defina uma nova senha para acessar sua conta do Plano Casa com segurança.",
    ),
  component: Reset,
});
function Reset() {
  const [recovery, setRecovery] = useState(false),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setRecovery(params.get("type") === "recovery");
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("As senhas devem ser iguais.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage("O link pode ter expirado. Solicite um novo link de recuperação.");
    else {
      setDone(true);
      setMessage("Sua senha foi atualizada.");
    }
  }
  return (
    <section className="panel auth-page">
      <h1>Uma nova senha</h1>
      <p>Cuide da segurança da sua conta.</p>
      {done ? (
        <>
          <p role="status" className="form-message">
            {message}
          </p>
          <Button asChild>
            <Link to="/">Ir para o Início</Link>
          </Button>
        </>
      ) : recovery ? (
        <form className="form-stack" onSubmit={save}>
          <label>
            Nova senha
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirmar senha
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {message && (
            <p role="status" className="form-message">
              {message}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
        </form>
      ) : (
        <>
          <p>Abra esta página pelo link de recuperação enviado ao seu e-mail.</p>
          <Button asChild variant="outline">
            <Link to="/auth">Voltar para entrar</Link>
          </Button>
        </>
      )}
    </section>
  );
}
