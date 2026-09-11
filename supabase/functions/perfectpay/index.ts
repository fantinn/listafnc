/**
 * Recebe o postback de venda da PerfectPay.
 *
 * verify_jwt fica desligado de proposito: quem chama e a PerfectPay, que
 * nao tem JWT do Supabase. A autenticacao e feita aqui dentro, comparando
 * o campo `token` do corpo com o segredo PERFECTPAY_TOKEN. Sem isso, a URL
 * seria publica e qualquer POST criaria acesso de graca.
 *
 * Comportamento:
 *   - registra/atualiza a compra na tabela `compras` (sempre);
 *   - em reembolso ou chargeback, desativa o membro daquele e-mail.
 *
 * A criacao de conta NAO acontece aqui: quem cria e a pagina de ativacao,
 * onde o comprador confirma e-mail e CPF. Assim uma venda com e-mail errado
 * nao vira conta orfa, e nao dependemos de enviar e-mail.
 *
 * Configurar o segredo (nunca commitar):
 *   supabase secrets set PERFECTPAY_TOKEN=... --project-ref syikoanvfyhzyefptbtn
 * Publicar:
 *   supabase functions deploy perfectpay --no-verify-jwt
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

// 2 = approved. Os outros abaixo tiram o acesso.
const APROVADO = 2;
const REVOGA = new Set([
  6, // refund_requested / em devolucao
  7, // refunded
  9, // charged_back
  10, // canceled
]);

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Compara sem vazar o tempo de comparacao. */
function igualSeguro(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

async function hashCpf(bruto: string) {
  const digitos = (bruto ?? "").replace(/[^0-9]/g, "");
  if (digitos.length !== 11) return null;
  const dados = new TextEncoder().encode(digitos);
  const resumo = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "metodo nao permitido" }, 405);

  const segredo = Deno.env.get("PERFECTPAY_TOKEN");
  if (!segredo) {
    // Falha fechada: sem segredo configurado, nao processa nada.
    console.error("PERFECTPAY_TOKEN nao configurado");
    return json({ erro: "nao configurado" }, 503);
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo invalido" }, 400);
  }

  const token = String(corpo.token ?? "");
  if (!igualSeguro(token, segredo)) {
    console.warn("postback recusado: token nao confere");
    return json({ erro: "nao autorizado" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const cliente = (corpo.customer ?? {}) as Record<string, string>;
  const produto = (corpo.product ?? {}) as Record<string, string>;
  const email = String(cliente.email ?? "").trim().toLowerCase();
  const status = Number(corpo.sale_status_enum ?? 0);
  const codigo = String(corpo.code ?? corpo.sale_code ?? "") || null;

  if (!email) {
    // Registra mesmo assim: serve para diagnosticar o mapeamento.
    await supabase.from("compras").insert({
      email: "(sem email no payload)",
      status_enum: status,
      payload: corpo,
    });
    return json({ ok: true, aviso: "payload sem customer.email" });
  }

  const registro = {
    email,
    cpf_hash: await hashCpf(String(cliente.identification_number ?? cliente.cpf ?? "")),
    codigo_venda: codigo,
    status_enum: status,
    status_texto: String(corpo.sale_status_detail ?? ""),
    produto: String(produto.name ?? ""),
    valor: Number(corpo.sale_amount ?? 0) || null,
    payload: corpo,
    atualizado_em: new Date().toISOString(),
  };

  // onConflict no codigo da venda: a PerfectPay reenvia o mesmo postback a
  // cada mudanca de status, e nao pode virar linha nova toda vez.
  const { error } = codigo
    ? await supabase.from("compras").upsert(registro, { onConflict: "codigo_venda" })
    : await supabase.from("compras").insert(registro);

  if (error) {
    console.error("falha ao gravar compra:", error.message);
    return json({ erro: "falha ao gravar" }, 500);
  }

  // Reembolso/chargeback tira o acesso de quem ja ativou.
  if (REVOGA.has(status)) {
    const { error: erroRevoga } = await supabase
      .from("membros")
      .update({
        ativo: false,
        desativado_em: new Date().toISOString(),
        motivo_desativacao: `postback status ${status}`,
      })
      .eq("email", email);
    if (erroRevoga) console.error("falha ao revogar:", erroRevoga.message);
  }

  return json({ ok: true, status, liberado: status === APROVADO });
});
