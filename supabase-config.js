// Configuracao publica do Supabase.
// A chave publishable e publica por design: quem protege o material sao as
// politicas de RLS (bucket "material" privado, leitura so para autenticados).
// A service_role key NUNCA entra aqui - ela fica apenas em admin/.env, local.
export const SUPABASE_URL = "https://syikoanvfyhzyefptbtn.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ftY-qFYAz4bQ8QxVTCHfhw_KweqVk-_";

// Caminho do PDF dentro do bucket privado.
export const BUCKET = "material";
export const ARQUIVO = "lista.pdf";

// Validade do link assinado, em segundos.
export const VALIDADE_LINK = 60;

// Suporte (numero proprio - diferente do botao flutuante da landing,
// que continua com o numero de vendas em index.html).
export const WHATSAPP = "https://wa.me/5527997282508?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20meu%20acesso";
