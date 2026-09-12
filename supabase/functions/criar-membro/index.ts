/**
 * Cria o acesso de um comprador na mao, pelo painel do admin.
 *
 * Existe para a venda que nao passou pelo fluxo automatico: pagamento por
 * fora da PerfectPay, cortesia, ou comprador que digitou o e-mail errado na
 * compra e por isso nunca consegue se ativar sozinho em `ativar`.
 *
 * So cria comprador. O corpo nem aceita um campo `admin`: quem vira admin
 * continua sendo promovido a mao no banco, de proposito. Assim nem um erro
 * no painel, nem um XSS nele, consegue fabricar um administrador.
 *
 * Autenticacao em duas camadas:
 *   1. verify_jwt ligado - sem sessao valida a requisicao nem chega aqui;
 *   2. conferencia de admin aqui dentro - porque o verify_jwt aceita o JWT
 *      de QUALQUER usuario, inclusive o de um comprador comum.
 *
 * Publicar: supabase functions deploy criar-membro
 */

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

const FALE_COM_SUPORTE = "Não consegui criar o acesso. Tente de novo.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ erro: "não autorizado" }, 401);

  const supabase = clienteServico();

  const user = await confirmarAdmin(supabase, token);
  if (!user) return json({ erro: "não autorizado" }, 403);

  let corpo: { email?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  const email = String(corpo.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ erro: "Informe um e-mail válido." }, 400);
  }

  const { data: existente } = await supabase
    .from("membros")
    .select("ativo")
    .eq("email", email)
    .maybeSingle();

  if (existente) {
    return json({
      erro: existente.ativo
        ? "Esse e-mail já tem acesso."
        : "Esse e-mail já teve acesso, mas está bloqueado. Reative em vez de criar de novo.",
    }, 409);
  }

  const sufixo = sortearSufixo();
  const senha = montarSenha(email, sufixo);

  // A senha gerada tem de passar nas mesmas regras que exigimos do
  // comprador. Se um dia deixar de passar, e melhor descobrir aqui do que
  // o comprador descobrir na hora de trocar por uma igual.
  const problema = conferirSenha(senha);
  if (problema) {
    console.error("senha gerada nao passa nas proprias regras:", problema);
    return json({ erro: FALE_COM_SUPORTE }, 500);
  }

  const { data: criado, error: erroAuth } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !criado?.user) {
    // Conta no Auth sem linha em `membros`: sobra de uma criacao que falhou
    // no meio. O admin nao tem como resolver pelo painel, entao a mensagem
    // precisa dizer que o caso e outro, nao um "tente de novo" que nunca vai
    // funcionar.
    if (erroAuth?.message?.toLowerCase().includes("already")) {
      console.error("e-mail ja existe no Auth mas nao em membros:", email);
      return json({
        erro: "Esse e-mail já existe no login, mas sem cadastro de comprador. Precisa ser resolvido no banco.",
      }, 409);
    }
    console.error("falha ao criar usuario:", erroAuth?.message);
    return json({ erro: FALE_COM_SUPORTE }, 500);
  }

  const { error: erroMembro } = await supabase
    .from("membros")
    .insert({ id: criado.user.id, email, sufixo, admin: false, ativo: true });

  if (erroMembro) {
    // Sem a linha em `membros` o acesso nao funciona, entao nao vale deixar
    // a conta orfa no Auth: o comprador tentaria entrar e nao veria nada.
    await supabase.auth.admin.deleteUser(criado.user.id);
    console.error("falha ao registrar membro:", erroMembro.message);
    return json({ erro: FALE_COM_SUPORTE }, 500);
  }

  console.log("acesso criado manualmente por", user.email, "para", email);
  return json({ email, senha });
});
