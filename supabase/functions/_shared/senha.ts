/**
 * Geracao da senha de acesso do comprador.
 *
 * Fica aqui porque duas funcoes criam conta - `ativar` (compra aprovada,
 * o comprador se libera sozinho) e `criar-membro` (o admin cria na mao) -
 * e as duas precisam gerar a senha no mesmo formato. Se cada uma tivesse
 * a sua copia, um ajuste no formato entraria so de um lado e o suporte
 * passaria a ver senhas de dois tipos sem saber por que.
 */

// Sem i, l, 1, o, 0: some a duvida de leitura quando o comprador digita.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

export function sortearSufixo(tamanho = 4) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += ALFABETO[b % ALFABETO.length];
  return saida;
}

export function montarSenha(email: string, sufixo: string) {
  const base = email
    .split("@")[0]
    .normalize("NFD")
    // Tira a marca de acento que o NFD soltou do caractere. Mesmo
    // \p{Diacritic} do categorias-ui.js: escrever a faixa de combining
    // marks na mao deixaria um literal invisivel no editor.
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return `${base}fnc${sufixo}`;
}
