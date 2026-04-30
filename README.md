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
