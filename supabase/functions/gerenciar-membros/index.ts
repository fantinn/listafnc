/**
 * Lista os compradores cadastrados e deixa bloquear/reativar, redefinir a
 * senha ou excluir o acesso de um deles, pelo painel do admin.
 *
 * So admin ativo chama (mesma dupla checagem de `criar-membro`: verify_jwt
 * ligado + conferencia de admin aqui dentro). Conta de admin nunca aparece
 * como alvo dessas acoes por aqui - quem tira poder, senha ou a conta de
 * outro admin faz isso direto no banco, de proposito, para um erro no
 * painel (ou um XSS nele) nunca conseguir travar ou apagar quem administra.
 *
 * Publicar: supabase functions deploy gerenciar-membros
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { clienteServico, confirmarAdmin } from "../_shared/admin.ts";
import { conferirSenha, montarSenha, sortearSufixo } from "../_shared/senha.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const FALE_COM_SUPORTE = "Não consegui fazer isso agora. Tente de novo.";

// Usado por alternar/redefinir-senha/excluir: todas exigem o mesmo alvo
// (comprador existente, nunca admin), so a acao depois disso muda.
async function acharAlvo(supabase: SupabaseClient, email: string) {
  const { data: alvo, error } = await supabase
    .from("membros")
    .select("id, admin, ativo")
    .eq("email", email)
    .maybeSingle();

  if (error || !alvo) return { erro: json({ erro: "Comprador não encontrado." }, 404) };
  if (alvo.admin) return { erro: json({ erro: "Contas de admin não se gerenciam por aqui." }, 403) };
  return { alvo };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ erro: "não autorizado" }, 401);

  const supabase = clienteServico();
  const user = await confirmarAdmin(supabase, token);
  if (!user) return json({ erro: "não autorizado" }, 403);

  let corpo: { acao?: string; email?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  if (corpo.acao === "listar") {
    const { data, error } = await supabase
      .from("membros")
      .select("email, admin, ativo, criado_em, ultimo_acesso, desativado_em, motivo_desativacao")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error("falha ao listar membros:", error.message);
      return json({ erro: FALE_COM_SUPORTE }, 500);
    }
    return json({ membros: data ?? [] });
  }

  const email = String(corpo.email ?? "").trim().toLowerCase();

  if (corpo.acao === "alternar") {
    if (!email) return json({ erro: "Informe o e-mail." }, 400);
    const { alvo, erro } = await acharAlvo(supabase, email);
    if (erro) return erro;

    const novoAtivo = !alvo.ativo;
    const { error: erroUpdate } = await supabase
      .from("membros")
      .update({
        ativo: novoAtivo,
        desativado_em: novoAtivo ? null : new Date().toISOString(),
        motivo_desativacao: novoAtivo ? null : `bloqueado manualmente por ${user.email}`,
      })
      .eq("email", email);

    if (erroUpdate) {
      console.error("falha ao alternar membro:", erroUpdate.message);
      return json({ erro: FALE_COM_SUPORTE }, 500);
    }

    console.log((novoAtivo ? "acesso reativado" : "acesso bloqueado"), "por", user.email, "para", email);
    return json({ email, ativo: novoAtivo });
  }

  if (corpo.acao === "redefinir-senha") {
    if (!email) return json({ erro: "Informe o e-mail." }, 400);
    const { alvo, erro } = await acharAlvo(supabase, email);
    if (erro) return erro;

    const sufixo = sortearSufixo();
    const senha = montarSenha(email, sufixo);

    // Mesma conferencia que criar-membro faz: a senha sorteada tem de
    // passar nas proprias regras, senao o comprador nem consegue manter
    // essa senha na primeira troca.
    const problema = conferirSenha(senha);
    if (problema) {
      console.error("senha gerada nao passa nas proprias regras:", problema);
      return json({ erro: FALE_COM_SUPORTE }, 500);
    }

    const { error: erroSenha } = await supabase.auth.admin.updateUserById(alvo.id, { password: senha });
    if (erroSenha) {
      console.error("falha ao redefinir senha:", erroSenha.message);
      return json({ erro: FALE_COM_SUPORTE }, 500);
    }

    // Senha voltou a ser gerada por aqui (nao mais "propria" do comprador),
    // entao o sufixo passa a valer de novo se um dia precisar reconstruir.
    const { error: erroSufixo } = await supabase.from("membros").update({ sufixo }).eq("id", alvo.id);
    if (erroSufixo) {
      console.error("senha redefinida mas sufixo nao marcado para", email, "-", erroSufixo.message);
    }

    console.log("senha redefinida por", user.email, "para", email);
    return json({ email, senha });
  }

  if (corpo.acao === "excluir") {
    if (!email) return json({ erro: "Informe o e-mail." }, 400);
    const { alvo, erro } = await acharAlvo(supabase, email);
    if (erro) return erro;

    // Apaga direto no Auth: a linha em `membros` cai sozinha, pela mesma
    // FK em cascata que o postback de reembolso ja depende.
    const { error: erroExclusao } = await supabase.auth.admin.deleteUser(alvo.id);
    if (erroExclusao) {
      console.error("falha ao excluir membro:", erroExclusao.message);
      return json({ erro: FALE_COM_SUPORTE }, 500);
    }

    console.log("acesso excluido por", user.email, "para", email);
    return json({ email, excluido: true });
  }

  return json({ erro: "ação inválida" }, 400);
});
