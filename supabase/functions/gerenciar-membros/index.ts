/**
 * Lista os compradores cadastrados e deixa bloquear/reativar o acesso de
 * um deles, pelo painel do admin.
 *
 * So admin ativo chama (mesma dupla checagem de `criar-membro`: verify_jwt
 * ligado + conferencia de admin aqui dentro). Conta de admin nunca aparece
 * como alvo de bloqueio por aqui - quem tira poder de outro admin faz isso
 * direto no banco, de proposito, para um erro no painel nunca travar quem
 * administra.
 *
 * Publicar: supabase functions deploy gerenciar-membros
 */

import { clienteServico, confirmarAdmin } from "../_shared/admin.ts";

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

  if (corpo.acao === "alternar") {
    const email = String(corpo.email ?? "").trim().toLowerCase();
    if (!email) return json({ erro: "Informe o e-mail." }, 400);

    const { data: alvo, error: erroConsulta } = await supabase
      .from("membros")
      .select("admin, ativo")
      .eq("email", email)
      .maybeSingle();

    if (erroConsulta || !alvo) return json({ erro: "Comprador não encontrado." }, 404);

    // Bloquear/reativar admin fica de fora do painel de proposito: um erro
    // aqui, ou um XSS nele, nao pode conseguir travar quem administra.
    if (alvo.admin) return json({ erro: "Contas de admin não se gerenciam por aqui." }, 403);

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

  return json({ erro: "ação inválida" }, 400);
});
