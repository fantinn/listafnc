/**
 * Ativa o acesso de quem comprou.
 *
 * O comprador cai aqui vindo da pagina de obrigado da PerfectPay (ou volta
 * depois, se perdeu o acesso), informa e-mail e CPF da compra, e a conta e
 * criada na hora. A senha aparece na tela - nao dependemos de e-mail, que
 * e o maior gerador de suporte nesse tipo de entrega.
 *
 * verify_jwt desligado de proposito: quem chama ainda nao tem conta. O que
 * autoriza e existir uma compra aprovada, gravada pelo postback, com o
 * mesmo e-mail E o mesmo CPF. So o e-mail seria fraco: quem soubesse que
 * alguem comprou poderia ativar a conta dessa pessoa antes dela.
 *
 * Publicar: supabase functions deploy ativar --no-verify-jwt
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const APROVADO = 2;
const LIMITE_TENTATIVAS = 10;
const JANELA_MINUTOS = 15;

// Sem i, l, 1, o, 0: some a duvida de leitura quando o comprador digita.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function sortearSufixo(tamanho = 4) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

function montarSenha(email: string, sufixo: string) {
  const base = email
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return `${base}fnc${sufixo}`;
}

async function hashCpf(bruto: string) {
  const digitos = (bruto ?? "").replace(/[^0-9]/g, "");
  if (digitos.length !== 11) return null;
  const dados = new TextEncoder().encode(digitos);
  const resumo = await crypto.subtle.digest("SHA-256", dados);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mensagem unica para todos os casos de "nao achei": nao conta para quem
// esta tentando se aquele e-mail comprou ou nao.
const NAO_ENCONTRADO =
  "Não encontramos uma compra aprovada com esse e-mail e CPF. " +
  "Confira se são exatamente os dados que você usou na compra.";

const FALE_COM_SUPORTE = "Não consegui criar seu acesso. Fale com o suporte.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);

  let corpo: { email?: string; cpf?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  const email = String(corpo.email ?? "").trim().toLowerCase();
  const cpfHash = await hashCpf(String(corpo.cpf ?? ""));

  if (!email.includes("@")) return json({ erro: "Informe um e-mail válido." }, 400);
  if (!cpfHash) return json({ erro: "Informe o CPF com 11 dígitos." }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();

  const { count } = await supabase
    .from("tentativas_ativacao")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("sucesso", false)
    .gte("quando", desde);

  if ((count ?? 0) >= LIMITE_TENTATIVAS) {
    return json(
      { erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
      429,
    );
  }

  const registrar = (sucesso: boolean) =>
    supabase.from("tentativas_ativacao").insert({ ip, email, sucesso });

  // 1. A compra existe, esta aprovada e o CPF confere?
  const { data: compras } = await supabase
    .from("compras")
    .select("id, cpf_hash, status_enum")
    .eq("email", email)
    .eq("status_enum", APROVADO);

  const compra = (compras ?? []).find((c) => c.cpf_hash === cpfHash);

  if (!compra) {
    await registrar(false);
    // Compra existe mas sem CPF gravado: mapeamento do payload errado.
    // Vale avisar diferente, porque e problema nosso, nao do comprador.
    const semCpf = (compras ?? []).some((c) => !c.cpf_hash);
    if (semCpf) {
      console.error("compra aprovada sem cpf_hash para", email);
      return json(
        {
          erro:
            "Achamos sua compra, mas não conseguimos conferir o CPF. " +
            "Fale com o suporte que liberamos na hora.",
        },
        409,
      );
    }
    return json({ erro: NAO_ENCONTRADO }, 404);
  }

  // 2. Ja tem conta?
  const { data: membro } = await supabase
    .from("membros")
    .select("id, ativo")
    .eq("email", email)
    .maybeSingle();

  if (membro) {
    await registrar(true);
    if (!membro.ativo) {
      return json(
        {
          erro:
            "Esse acesso está bloqueado. Fale com o suporte para entender o motivo.",
        },
        403,
      );
    }
    return json({
      ja_existia: true,
      email,
      mensagem:
        "Sua conta já está ativa. Entre com o e-mail e a senha que você recebeu na ativação.",
    });
  }

  // 3. Cria a conta.
  const sufixo = sortearSufixo();
  const senha = montarSenha(email, sufixo);

  const { data: criado, error: erroAuth } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !criado?.user) {
    console.error("falha ao criar usuario:", erroAuth?.message);
    await registrar(false);
    return json({ erro: FALE_COM_SUPORTE }, 500);
  }

  const { error: erroMembro } = await supabase
    .from("membros")
    .insert({ id: criado.user.id, email, sufixo, admin: false, ativo: true });

  if (erroMembro) {
    // Sem a linha em membros o acesso nao funciona, entao nao vale deixar a
    // conta orfa no Auth: o comprador tentaria entrar e nao veria nada.
    await supabase.auth.admin.deleteUser(criado.user.id);
    console.error("falha ao registrar membro:", erroMembro.message);
    await registrar(false);
    return json({ erro: FALE_COM_SUPORTE }, 500);
  }

  await registrar(true);
  return json({ ja_existia: false, email, senha });
});
