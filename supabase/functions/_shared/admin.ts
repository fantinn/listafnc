/**
 * Autenticacao repetida em toda funcao que so admin pode chamar:
 * confere o JWT e depois confere que o dono dele e admin ativo.
 *
 * O verify_jwt do Supabase (ligado nessas funcoes) so garante um token
 * valido de QUALQUER usuario, inclusive comprador comum - por isso a
 * segunda conferencia, aqui dentro, e obrigatoria.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function clienteServico(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Devolve o usuario do token se ele for admin ativo, ou null. */
export async function confirmarAdmin(supabase: SupabaseClient, token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: perfil } = await supabase
    .from("membros")
    .select("admin, ativo")
    .eq("id", user.id)
    .maybeSingle();

  // Admin desativado tambem perde o direito: desativar a conta precisa
  // tirar todos os poderes, nao so a leitura da lista.
  if (!perfil?.admin || !perfil.ativo) return null;

  return user;
}
