import { createFileRoute, Link } from '@tanstack/react-router';
import { AuthForm,usePlan } from '@/components/plan/provider';
import { Button } from '@/components/ui/button';
import { pageHead } from '@/lib/metadata';
export const Route=createFileRoute('/auth')({head:()=>pageHead('Sua conta','Entre ou crie sua conta para sincronizar o plano financeiro da sua casa entre aparelhos.'),component:Auth});
function Auth(){const p=usePlan();return <section className="panel auth-page"><img className="auth-page-icon" src="/icon-192.png" alt=""/><h1>{p.user?'Sua conta está conectada':'Bem-vindo ao Plano Casa'}</h1><p>{p.user?'Seu planejamento está salvo na sua conta.':'Sua conquista começa com um plano.'}</p>{p.user?<Button asChild><Link to="/">Ir para o Início</Link></Button>:<AuthForm/>}</section>;}
