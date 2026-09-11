Esta é uma versão do README.md com abordagem estritamente profissional e técnica, estruturada para documentar o repositório como um projeto de desenvolvimento de software de alta qualidade.

Landing Page de Alta Conversão - Estrutura de Vendas de Ativos Digitais
Este repositório contém o código-fonte de uma solução de front-end focada em performance e conversão para o mercado de infoprodutos. O projeto foi arquitetado para oferecer uma experiência de usuário (UX) premium, utilizando uma estética de interface escura (Dark UI) e elementos dinâmicos de persuasão.

1. Visão Geral do Projeto
A aplicação consiste em uma Landing Page estática de página única, otimizada para dispositivos móveis e desktops. O objetivo principal é a comercialização de uma base de dados de fornecedores, integrando gatilhos psicológicos de escassez e autoridade por meio de componentes técnicos de interface.

2. Especificações Técnicas
A stack tecnológica foi selecionada para garantir baixa latência de carregamento e facilidade de manutenção:

Front-end: HTML5 semântico e Tailwind CSS para estilização utilitária.

Engine de Estilo: CSS3 customizado para efeitos de iluminação radial (Glow Effects) e animações de shimmer.

Interatividade: JavaScript Vanilla (ECMAScript 6+).

Tipografia: Integração via Google Fonts (Inter e Space Grotesk).

Iconografia: Font Awesome 6.4.

3. Arquitetura de Recursos e Implementações
O projeto implementa funcionalidades avançadas para otimização de conversão:

3.1. Sistema de Persistência de Escassez
O contador regressivo (Timer) não é meramente visual. Foi implementada uma lógica em JavaScript que utiliza a API localStorage para armazenar o timestamp de expiração. Isso garante que a contagem seja mantida mesmo após atualizações de página ou fechamento do navegador pelo usuário, aumentando a integridade do gatilho de oferta limitada.

3.2. Gerenciamento de Animações de Scroll
Utilização da API IntersectionObserver para o monitoramento de viewport. Os elementos são renderizados com efeitos de transição (Reveal) apenas quando entram na área visível do usuário, o que reduz o consumo de recursos de hardware e torna a navegação mais fluida.

3.3. Responsividade e Mobile-First
A interface foi projetada sob o conceito de Mobile-First, garantindo que a hierarquia de informações e os botões de ação (CTA) mantenham a ergonomia em telas menores, sem comprometer a visualização em resoluções Ultra-Wide.

4. Requisitos de Ativos
Para a correta renderização da interface, o diretório raiz deve conter os seguintes ativos de imagem:

logo.png: Identidade visual da marca.

seuNegocio.png: Ativo principal da Hero Section.

transforma.jpg: Mídia de suporte para a seção de bônus.

listaCompleta.png: Representação visual do produto final.

5. Instruções para Implementação e Customização
5.1. Configuração de Links de Venda
Os pontos de saída para o checkout estão centralizados em elementos de âncora com a classe btn-blue. Para configurar o destino, altere o atributo href para a URL da sua plataforma de pagamentos (Ex: PerfectPay, Hotmart, Kiwify).

5.2. Alteração de Dados de Contato
O suporte via WhatsApp está configurado no botão flutuante. A URL deve ser ajustada seguindo o padrão da API do WhatsApp: [https://wa.me/SEUNUMERO?text=SUAMENSAGEM](https://wa.me/SEUNUMERO?text=SUAMENSAGEM).

5.3. Variáveis de Cor
As cores globais do projeto podem ser ajustadas no bloco :root dentro do arquivo principal, permitindo a rápida adaptação para diferentes identidades visuais sem a necessidade de reescrever o CSS utilitário.

6. Considerações de Performance
A página foi desenvolvida para atingir altos índices em métricas de Web Vitals, como LCP (Largest Contentful Paint) e CLS (Cumulative Layout Shift), garantindo que o tempo de resposta não seja um impeditivo para a conversão de leads.

7. Licença e Autoria
Projeto desenvolvido por fantinn. Uso permitido para fins de implementação comercial e estudo de arquitetura de front-end.

## 8. Área de Membros

A entrega deixou de ser um link do Canva repassado à mão. A lista de fornecedores virou **dados**, não arquivo: fica numa tabela do Supabase, atrás de login, com busca para o comprador e edição item a item para o admin.

### 8.1. Componentes

| Arquivo | Função |
| --- | --- |
| `login.html` | Autenticação (e-mail + senha). |
| `membros.html` | Lista do comprador: busca, filtro por categoria, botão de WhatsApp. |
| `admin.html` | Painel do admin: adicionar, editar, ocultar e remover fornecedores. |
| `area.css` | Estilos compartilhados pelas três páginas. |
| `supabase-config.js` | URL e chave pública do projeto. |
| `admin/criar-membro.mjs` | Cadastra comprador (ou admin, com `--admin`). |
| `admin/importar-fornecedores.mjs` | Importa a lista inteira de um CSV. |

O front continua 100% estático no GitHub Pages. A validação acontece no Supabase, porque o Pages não executa código de servidor nem guarda segredo.

### 8.2. Modelo de acesso

Três camadas, todas no banco — a interface só reflete o que a RLS já decide:

- **anon** (não logado): não lê nada. Nem fornecedores, nem membros.
- **comprador**: lê apenas fornecedores com `ativo = true`. Não insere, não altera, não remove. Da própria linha em `membros` só pode escrever `ultimo_acesso` — o corte é por `GRANT` de coluna, porque RLS controla linhas, não colunas. Sem isso ele se promoveria a admin com um `PATCH`.
- **admin** (`membros.admin = true`): lê tudo, inclusive os ocultos, e é o único que escreve.

Estar logado **não** basta em lugar nenhum: toda política exige linha em `membros`. Sem isso, qualquer pessoa criaria conta pelo signup público do Supabase e leria a lista sem comprar.

A senha segue `<parte antes do @>` + `fnc` + 4 caracteres aleatórios (`gabriel@gmail.com` → `gabrielfnc7k2p`). O sufixo é sorteado, não sequencial: com numeração previsível bastavam 99 tentativas para entrar na conta de outro comprador, e o Supabase não bloqueia tentativas repetidas de senha.

### 8.3. Liberar um comprador

```bash
cd admin
npm install                        # apenas na primeira vez
cp .env.example .env               # cole a service_role key
node criar-membro.mjs comprador@email.com
```

O script imprime a mensagem pronta para enviar. Para criar ou promover um admin, acrescente `--admin`.

A `service_role` key fica somente em `admin/.env` (ignorado pelo Git) e nunca pode aparecer em arquivo publicado.

### 8.4. Manter a lista

Edição do dia a dia é em `admin.html`: trocar um telefone leva segundos e o comprador vê no acesso seguinte, sem publicar nada. Para carregar a lista inteira de uma vez:

```bash
node admin/importar-fornecedores.mjs lista.csv --substituir
```

Colunas aceitas: `nome` (obrigatória), `categoria`, `telefone`, `instagram`, `cidade`, `estado`, `observacoes`.

Use **ocultar** em vez de remover quando a saída for temporária: o registro some para o comprador e continua no painel.

### 8.5. Limites conhecidos

1. **Repasse do próprio login.** Nada impede um comprador de dar e-mail e senha para outra pessoa. Não há limite de dispositivo nem detecção de sessão simultânea.
2. **Cópia do conteúdo.** Quem tem acesso legítimo consegue copiar os dados da tela ou pela aba Network. Vale para qualquer área de membros.

Ou seja: protege contra estranhos, não contra o próprio comprador.

### 8.6. Bucket `material`

O bucket privado continua provisionado, com política de leitura restrita a membros, mas nenhuma página o usa desde que a lista virou tabela. Está disponível caso volte a fazer sentido distribuir um arquivo.
