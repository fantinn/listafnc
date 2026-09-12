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
import { montarSenha, sortearSufixo } from "../_shared/senha.ts";

const APROVADO = 2;
const LIMITE_TENTATIVAS = 4;
const JANELA_MINUTOS = 15;

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

  let corpo: { email?: string; cpf?: string; redefinir?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  // Redefinir e um pedido explicito do comprador ("perdi minha senha"), nunca
  // automatico: quem so voltou aqui para conferir nao pode perder, sem querer,
  // a senha que ja estava funcionando.
  const querRedefinir = corpo.redefinir === true;

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

  const anotar = (sucesso: boolean) =>
    supabase.from("tentativas_ativacao").insert({ ip, email, sucesso });

  // O cliente do Supabase nao lanca excecao em erro de banco: ele resolve
  // com { error }. Um insert perdido aqui passava despercebido e sumia com
  // a tentativa - ou seja, com o incremento do limitador logo acima.
  const registrar = async (sucesso: boolean) => {
    const { error } = await anotar(sucesso);
    if (error) console.error("falha ao registrar tentativa:", error.message);
    return !error;
  };

  // Toda recusa passa por aqui. Se a tentativa nao ficou registrada, o
  // limitador nao enxergou o chute e ele sairia de graca - entao a resposta
  // vira um erro neutro, que nao conta nada sobre o e-mail nem sobre o CPF.
  const recusar = async (resposta: Response) => {
    if (await registrar(false)) return resposta;
    return json(
      { erro: "Não consegui processar agora. Tente de novo em instantes." },
      503,
    );
  };

  // 1. A compra existe, esta aprovada e o CPF confere?
  const { data: compras } = await supabase
    .from("compras")
    .select("id, cpf_hash, status_enum")
    .eq("email", email)
    .eq("status_enum", APROVADO);

  const compra = (compras ?? []).find((c) => c.cpf_hash === cpfHash);

  if (!compra) {
    // Compra existe mas sem CPF gravado: mapeamento do payload errado.
    // Vale avisar diferente, porque e problema nosso, nao do comprador.
    const semCpf = (compras ?? []).some((c) => !c.cpf_hash);
    if (semCpf) {
      console.error("compra aprovada sem cpf_hash para", email);
      return await recusar(json(
        {
          erro:
            "Achamos sua compra, mas não conseguimos conferir o CPF. " +
            "Fale com o suporte que liberamos na hora.",
        },
        409,
      ));
    }
    return await recusar(json({ erro: NAO_ENCONTRADO }, 404));
  }

  // 2. Ja tem conta?
  const { data: membro } = await supabase
    .from("membros")
    .select("id, ativo, admin")
    .eq("email", email)
    .maybeSingle();

  if (membro) {
    // Cada saida daqui registra a sua propria tentativa. Marcar sucesso
    // logo na entrada, como era antes, fazia toda recusa abaixo entrar no
    // log como acerto - e, pior, ficar de fora do limitador, que so conta
    // tentativa falha. Dava para bater nas recusas sem limite nenhum.
    if (!membro.ativo) {
      return await recusar(json(
        {
          erro:
            "Esse acesso está bloqueado. Fale com o suporte para entender o motivo.",
        },
        403,
      ));
    }

    // Conta de admin nunca troca de senha por aqui. Esta porta se abre com
    // e-mail + CPF, dados que circulam; o painel inteiro nao pode depender
    // disso. A recusa usa mensagem generica, igual a de uma falha qualquer,
    // e a resposta de quem so consultou e identica a de um comprador comum:
    // nada no retorno conta que aquele e-mail e de um administrador.
    if (membro.admin && querRedefinir) {
      return await recusar(
        json({ erro: "Não foi possível gerar uma senha nova. Fale com o suporte." }, 403),
      );
    }

    if (!querRedefinir) {
      await registrar(true);
      return json({
        ja_existia: true,
        email,
        mensagem:
          "Sua conta já está ativa. Entre com o e-mail e a senha que você recebeu na ativação.",
      });
    }

    // 2b. Senha perdida: gera outra. A antiga deixa de valer na hora - e o
    // mesmo e-mail e CPF da compra que ja autorizaram criar a conta.
    const sufixoNovo = sortearSufixo();
    const senhaNova = montarSenha(email, sufixoNovo);

    const { error: erroSenha } = await supabase.auth.admin.updateUserById(membro.id, {
      password: senhaNova,
    });
    if (erroSenha) {
      console.error("falha ao redefinir senha:", erroSenha.message);
      return await recusar(json({ erro: FALE_COM_SUPORTE }, 500));
    }

    // Guarda o sufixo novo: sem isso a linha em `membros` continuaria
    // descrevendo a senha antiga. Isso importa porque admin/criar-membro.mjs
    // remonta a senha a partir desse campo para o suporte ditar ao comprador.
    const { error: erroSufixo } = await supabase
      .from("membros")
      .update({ sufixo: sufixoNovo })
      .eq("id", membro.id);

    // Falhou aqui: a senha nova JA vale, entao devolver erro deixaria o
    // comprador trancado do lado de fora sem nunca ver a credencial. Melhor
    // entregar a senha e gritar no log, que e o suficiente para consertar a
    // linha na mao depois.
    if (erroSufixo) {
      console.error(
        "senha redefinida mas sufixo nao gravado para", email,
        "- membros.sufixo esta desatualizado:", erroSufixo.message,
      );
    }

    await registrar(true);
    return json({ redefinida: true, email, senha: senhaNova });
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
    return await recusar(json({ erro: FALE_COM_SUPORTE }, 500));
  }

  const { error: erroMembro } = await supabase
    .from("membros")
    .insert({ id: criado.user.id, email, sufixo, admin: false, ativo: true });

  if (erroMembro) {
    // Sem a linha em membros o acesso nao funciona, entao nao vale deixar a
    // conta orfa no Auth: o comprador tentaria entrar e nao veria nada.
    await supabase.auth.admin.deleteUser(criado.user.id);
    console.error("falha ao registrar membro:", erroMembro.message);
    return await recusar(json({ erro: FALE_COM_SUPORTE }, 500));
  }

  await registrar(true);
  return json({ ja_existia: false, email, senha });
});
