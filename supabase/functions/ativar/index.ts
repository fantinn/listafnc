/**
 * Ativa o acesso de quem comprou.
 *
 * O comprador cai aqui vindo da pagina de obrigado da PerfectPay, informa
 * e-mail e CPF da compra e ESCOLHE a propria senha. Antes ela era gerada e
 * mostrada uma unica vez: quem fechasse a aba perdia o acesso para sempre,
 * porque so guardamos o hash. Senha escolhida e senha que a pessoa lembra -
 * ou que o gerenciador dela guarda sozinho.
 *
 * A mesma porta serve para quem ja tem conta e esqueceu a senha: com o
 * mesmo e-mail e CPF da compra, define outra. A prova e a mesma que
 * autorizou criar a conta, entao isso nao abre porta nova.
 *
 * verify_jwt desligado de proposito: quem chama ainda nao tem conta. O que
 * autoriza e existir uma compra aprovada, gravada pelo postback, com o
 * mesmo e-mail E o mesmo CPF. So o e-mail seria fraco: quem soubesse que
 * alguem comprou poderia ativar a conta dessa pessoa antes dela.
 *
 * Publicar: supabase functions deploy ativar --no-verify-jwt
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { conferirSenha } from "../_shared/senha.ts";

// O comprador escolhe a propria senha, entao nao ha sufixo para guardar.
// A coluna e NOT NULL, e esta marca deixa claro para quem for olhar a linha
// (ou para o admin/criar-membro.mjs) que aqui nao da para remontar senha.
const SEM_SUFIXO = "propria";

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

  let corpo: { email?: string; cpf?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "corpo inválido" }, 400);
  }

  const email = String(corpo.email ?? "").trim().toLowerCase();
  const cpfHash = await hashCpf(String(corpo.cpf ?? ""));
  const senha = String(corpo.senha ?? "");

  if (!email.includes("@")) return json({ erro: "Informe um e-mail válido." }, 400);
  if (!cpfHash) return json({ erro: "Informe o CPF com 11 dígitos." }, 400);

  // Conferida antes de qualquer consulta: nao ha motivo para ir ao banco
  // (nem gastar tentativa do limitador) se a senha nem serve.
  const problemaSenha = conferirSenha(senha);
  if (problemaSenha) return json({ erro: problemaSenha }, 400);

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
    // disso. A recusa usa mensagem generica, igual a de uma falha qualquer:
    // nada no retorno conta que aquele e-mail e de um administrador.
    if (membro.admin) {
      return await recusar(
        json({ erro: "Não foi possível definir a senha dessa conta. Fale com o suporte." }, 403),
      );
    }

    // Conta que ja existe: o comprador esta trocando a senha. E o mesmo
    // e-mail e CPF da compra que autorizaram cria-la, entao a prova e a
    // mesma - e assim quem perdeu a senha se resolve sozinho.
    const { error: erroSenha } = await supabase.auth.admin.updateUserById(membro.id, {
      password: senha,
    });
    if (erroSenha) {
      console.error("falha ao definir senha:", erroSenha.message);
      return await recusar(json({ erro: FALE_COM_SUPORTE }, 500));
    }

    const { error: erroSufixo } = await supabase
      .from("membros")
      .update({ sufixo: SEM_SUFIXO })
      .eq("id", membro.id);

    // A senha nova JA vale neste ponto. Falhar aqui so deixa a marca do
    // sufixo desatualizada, o que nao tranca ninguem - entao registra no
    // log e segue, em vez de devolver erro para quem ja trocou a senha.
    if (erroSufixo) {
      console.error("senha trocada mas sufixo nao marcado para", email, "-", erroSufixo.message);
    }

    await registrar(true);
    return json({ trocada: true, email });
  }

  // 3. Cria a conta com a senha que o comprador escolheu.
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
    .insert({ id: criado.user.id, email, sufixo: SEM_SUFIXO, admin: false, ativo: true });

  if (erroMembro) {
    // Sem a linha em membros o acesso nao funciona, entao nao vale deixar a
    // conta orfa no Auth: o comprador tentaria entrar e nao veria nada.
    await supabase.auth.admin.deleteUser(criado.user.id);
    console.error("falha ao registrar membro:", erroMembro.message);
    return await recusar(json({ erro: FALE_COM_SUPORTE }, 500));
  }

  await registrar(true);
  return json({ criada: true, email });
});
