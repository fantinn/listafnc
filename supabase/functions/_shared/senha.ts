/**
 * Regras da senha e geracao de senha automatica.
 *
 * Dois caminhos criam acesso e precisam concordar sobre o que e uma senha
 * valida: `ativar` (o comprador escolhe a dele) e `criar-membro` (o admin
 * cria e a senha sai pronta). Se a regra vivesse so num lado, o outro
 * aceitaria senha que o primeiro recusa.
 */

// Limite do bcrypt, que e o que o GoTrue usa por baixo: alem de 72 bytes
// ele ignora o resto em silencio - a pessoa acharia que tem uma senha
// enorme e metade dela nao valeria nada.
const MAXIMO_BYTES = 72;
export const MINIMO = 8;

/** Devolve a mensagem do problema, ou null se a senha passa. */
export function conferirSenha(senha: string): string | null {
  if (senha.length < MINIMO) return `A senha precisa ter pelo menos ${MINIMO} caracteres.`;
  if (new TextEncoder().encode(senha).length > MAXIMO_BYTES) {
    return "A senha é longa demais. Use no máximo 72 caracteres.";
  }
  if (!/[a-zA-Z]/.test(senha)) return "A senha precisa ter pelo menos uma letra.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter pelo menos um número.";
  if (!/[^a-zA-Z0-9]/.test(senha)) {
    return "A senha precisa ter pelo menos um caractere especial, como ! @ # $ ou -.";
  }
  return null;
}

// Sem i, l, 1, o, 0: some a duvida de leitura quando alguem digita a senha
// que o admin mandou.
const LETRAS = "abcdefghjkmnpqrstuvwxyz";
const DIGITOS = "23456789";
const ESPECIAIS = "!@#$%&*?-";

function sortear(alfabeto: string, quantidade: number) {
  const bytes = new Uint8Array(quantidade);
  crypto.getRandomValues(bytes);
  let saida = "";
  for (const b of bytes) saida += alfabeto[b % alfabeto.length];
  return saida;
}

export function sortearSufixo(tamanho = 4) {
  // Pelo menos um digito, por construcao. Sorteando de um alfabeto unico de
  // letras+numeros, cerca de 1 em cada 4 sufixos saia so com letras - e a
  // senha gerada nao passava na regra que exigimos do proprio comprador.
  const partes = [...sortear(DIGITOS, 1), ...sortear(LETRAS, Math.max(0, tamanho - 1))];
  for (let i = partes.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [partes[i], partes[j]] = [partes[j], partes[i]];
  }
  return partes.join("");
}

/**
 * Senha automatica, usada quando o admin cria o acesso pelo painel. Sai
 * dentro das mesmas regras acima - inclusive o caractere especial, senao o
 * comprador nao conseguiria trocar por uma igual depois.
 */
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
  return `${base || "acesso"}${sortear(ESPECIAIS, 1)}fnc${sufixo}`;
}
