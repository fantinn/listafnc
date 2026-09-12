/**
 * Cadastra um comprador na area de membros.
 *
 *   node admin/criar-membro.mjs email@doexemplo.com
 *   node admin/criar-membro.mjs voce@email.com --admin
 *
 * Com --admin a conta tambem edita a lista de fornecedores em admin.html.
 *
 * A senha segue o padrao combinado: parte do e-mail antes do "@",
 * sem pontos e acentos, + "fnc" + 4 caracteres aleatorios.
 *   gabriel@gmail.com  ->  gabrielfnc7k2p
 *
 * O sufixo e aleatorio de proposito. Com numero sequencial (01, 02, 03...)
 * bastavam 99 tentativas para entrar na conta de outro comprador, e o
 * Supabase nao bloqueia tentativas repetidas de senha.
 *
 * Este arquivo NAO faz parte do site: ele usa a service_role key,
 * que da acesso total ao projeto e fica somente em admin/.env.
 */

import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const aqui = dirname(fileURLToPath(import.meta.url));

// .env minimalista: evita dependencia externa so para ler duas variaveis.
function carregarEnv() {
  const env = {};
  let bruto;
  try {
    bruto = readFileSync(join(aqui, ".env"), "utf8");
  } catch {
    console.error("Faltou o arquivo admin/.env. Copie admin/.env.example e preencha.");
    process.exit(1);
  }
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const corte = limpa.indexOf("=");
    if (corte === -1) continue;
    env[limpa.slice(0, corte).trim()] = limpa.slice(corte + 1).trim();
  }
  return env;
}

// Sem i, l, 1, o, 0: some a duvida de leitura quando o comprador digita.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

function sortearSufixo(tamanho = 4) {
  let saida = "";
  for (let i = 0; i < tamanho; i++) {
    saida += ALFABETO[randomInt(ALFABETO.length)];
  }
  return saida;
}

function montarSenha(email, sufixo) {
  const base = email
    .split("@")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return `${base}fnc${sufixo}`;
}

const argumentos = process.argv.slice(2);
const admin = argumentos.includes("--admin");
const email = (argumentos.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Uso: node admin/criar-membro.mjs email@doexemplo.com [--admin]");
  process.exit(1);
}

const env = carregarEnv();
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("admin/.env precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Ja cadastrado? Nao recria - so mostra a senha vigente.
const { data: existente, error: erroConsulta } = await supabase
  .from("membros")
  .select("sufixo, admin")
  .eq("email", email)
  .maybeSingle();

if (erroConsulta) {
  console.error("Nao consegui ler a tabela membros:", erroConsulta.message);
  process.exit(1);
}

if (existente) {
  // Promover quem ja e membro nao exige recriar a conta.
  if (admin && !existente.admin) {
    const { error } = await supabase.from("membros").update({ admin: true }).eq("email", email);
    if (error) {
      console.error("Nao consegui promover a admin:", error.message);
      process.exit(1);
    }
    console.log(`\n${email} agora e admin.\n`);
    process.exit(0);
  }
  const rotulo = existente.admin ? "Ja cadastrado (admin)." : "Ja cadastrado.";
  // sufixo "propria" = a pessoa escolheu a senha dela em ativar.html, e nao
  // da para remontar (so guardamos o hash). Imprimir montarSenha() aqui
  // ditaria ao suporte uma senha que nao funciona.
  const senha = existente.sufixo === "propria"
    ? "definida pelo proprio comprador - nao da para recuperar. Ele mesmo troca em listafnc.com.br/ativar.html"
    : montarSenha(email, existente.sufixo);
  console.log(`\n${rotulo}\n  E-mail: ${email}\n  Senha:  ${senha}\n`);
  process.exit(0);
}

const sufixo = sortearSufixo();
const senha = montarSenha(email, sufixo);

const { data: criado, error: erroAuth } = await supabase.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
});

if (erroAuth) {
  console.error("Nao consegui criar o usuario:", erroAuth.message);
  process.exit(1);
}

const { error: erroInsert } = await supabase
  .from("membros")
  .insert({ id: criado.user.id, email, sufixo, admin });

if (erroInsert) {
  // Sem a linha em membros o acesso nao funciona (a politica do Storage
  // exige o registro), entao nao vale deixar a conta orfa no Auth.
  await supabase.auth.admin.deleteUser(criado.user.id);
  console.error("Nao consegui registrar o membro:", erroInsert.message);
  process.exit(1);
}

if (admin) {
  console.log(`
Admin cadastrado.

  E-mail: ${email}
  Senha:  ${senha}
  Painel: https://listafnc.com.br/admin.html
`);
  process.exit(0);
}

console.log(`
Membro cadastrado.

  E-mail: ${email}
  Senha:  ${senha}
  Acesso: https://listafnc.com.br/login.html

Mensagem pronta para enviar:
---
Seu acesso a Lista de Fornecedores esta liberado!
Entre em https://listafnc.com.br/login.html
E-mail: ${email}
Senha: ${senha}
---
`);
