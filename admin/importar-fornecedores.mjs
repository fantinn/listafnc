/**
 * Importa a lista de fornecedores de um CSV.
 *
 *   node admin/importar-fornecedores.mjs lista.csv
 *   node admin/importar-fornecedores.mjs lista.csv --substituir
 *
 * Colunas aceitas (a ordem nao importa, so o cabecalho):
 *   nome, categoria, telefone, instagram
 * Apenas "nome" e obrigatorio.
 *
 * Por padrao acrescenta ao que ja existe. Com --substituir, apaga tudo
 * antes de inserir - util para recarregar a lista inteira de uma vez.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const aqui = dirname(fileURLToPath(import.meta.url));

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

/**
 * CSV na mao para nao trazer dependencia: entende aspas duplas,
 * aspas escapadas ("") e quebra de linha dentro do campo.
 */
function lerCsv(texto) {
  const linhas = [];
  let campo = "";
  let linha = [];
  let dentroDeAspas = false;

  const conteudo = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') { campo += '"'; i++; }
        else dentroDeAspas = false;
      } else campo += c;
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === "," || c === ";") {
      linha.push(campo); campo = "";
    } else if (c === "\n") {
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha); }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

const COLUNAS = ["nome", "categoria", "telefone", "instagram"];

const argumentos = process.argv.slice(2);
const substituir = argumentos.includes("--substituir");
const arquivo = argumentos.find((a) => !a.startsWith("--"));

if (!arquivo) {
  console.error("Uso: node admin/importar-fornecedores.mjs lista.csv [--substituir]");
  process.exit(1);
}

const linhas = lerCsv(readFileSync(arquivo, "utf8"));
if (linhas.length < 2) {
  console.error("O CSV precisa de um cabecalho e ao menos uma linha.");
  process.exit(1);
}

const cabecalho = linhas[0].map((c) => c.trim().toLowerCase());
const desconhecidas = cabecalho.filter((c) => c && !COLUNAS.includes(c));
if (desconhecidas.length) {
  console.error("Colunas nao reconhecidas:", desconhecidas.join(", "));
  console.error("Esperado:", COLUNAS.join(", "));
  process.exit(1);
}
if (!cabecalho.includes("nome")) {
  console.error("Falta a coluna obrigatoria 'nome'.");
  process.exit(1);
}

const registros = [];
const ignoradas = [];

linhas.slice(1).forEach((linha, indice) => {
  const registro = {};
  cabecalho.forEach((coluna, i) => {
    if (!coluna) return;
    const valor = (linha[i] ?? "").trim();
    registro[coluna] = valor === "" ? null : valor;
  });
  if (!registro.nome) {
    ignoradas.push(indice + 2);
    return;
  }
  if (registro.instagram) registro.instagram = registro.instagram.replace(/^@+/, "").trim() || null;
  registros.push(registro);
});

if (ignoradas.length) {
  console.warn(`Linhas sem nome, ignoradas: ${ignoradas.join(", ")}`);
}
if (registros.length === 0) {
  console.error("Nada para importar.");
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

if (substituir) {
  const { count } = await supabase.from("fornecedores").select("*", { count: "exact", head: true });
  const { error } = await supabase.from("fornecedores").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error("Nao consegui limpar a tabela:", error.message);
    process.exit(1);
  }
  console.log(`Removidos ${count ?? 0} registros antigos.`);
}

// Em lotes: evita estourar o limite de tamanho da requisicao em listas grandes.
const LOTE = 200;
let inseridos = 0;
for (let i = 0; i < registros.length; i += LOTE) {
  const fatia = registros.slice(i, i + LOTE);
  const { error } = await supabase.from("fornecedores").insert(fatia);
  if (error) {
    console.error(`Falhou no lote a partir da linha ${i + 2}:`, error.message);
    process.exit(1);
  }
  inseridos += fatia.length;
  process.stdout.write(`\rImportados ${inseridos}/${registros.length}...`);
}

console.log(`\nPronto: ${inseridos} fornecedores na lista.`);
