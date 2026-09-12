// Compartilhado entre admin.html e membros.html: precisa desenhar os mesmos
// icones e aplicar a mesma normalizacao/deteccao de bonus nas duas telas,
// senao o admin e o comprador veem coisas diferentes para a mesma categoria.

export function normalizar(texto) {
  return (texto ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function ehBonus(nomeOuCategoria) {
  return normalizar(nomeOuCategoria).includes("bonus");
}

// Icones desenhados aqui, em traco, no lugar dos do Font Awesome. Os solidos
// do FA tem pesos muito diferentes entre si - a estrela e um bloco cheio, o
// "shoe-prints" sao duas manchas - e lado a lado na grade isso fica
// desalinhado. Mesma espessura em todos resolve. As formas sao constantes
// nossas, nunca vem do banco.
export const DESENHOS = {
  // Coroa
  "pecas de grife": [["path", "M3.5 18.5 L5 7 L9.5 11.5 L12 5 L14.5 11.5 L19 7 L20.5 18.5 Z"], ["path", "M3.5 18.5 H20.5"]],
  // Camiseta
  "camisas/bermudas street": [
    ["path", "M8.5 3 L4.5 5 L2.5 9 L5.5 10.8 V21 H18.5 V10.8 L21.5 9 L19.5 5 L15.5 3"],
    ["path", "M8.5 3 C9.6 5.9 14.4 5.9 15.5 3"],
  ],
  // Floco de neve
  "pecas de frio": [
    ["path", "M12 2.5 V21.5 M3.8 7.2 L20.2 16.8 M20.2 7.2 L3.8 16.8"],
    ["path", "M9.2 4.6 L12 6.8 L14.8 4.6 M9.2 19.4 L12 17.2 L14.8 19.4"],
  ],
  // Bola
  "camisas de time": [
    ["circle", 12, 12, 9],
    ["path", "M12 7 L16 9.9 L14.5 14.6 H9.5 L8 9.9 Z"],
    ["path", "M12 7 V3 M16 9.9 L19.8 8.7 M14.5 14.6 L17 18 M9.5 14.6 L7 18 M8 9.9 L4.2 8.7"],
  ],
  // Tenis de perfil. A sola em barra e o que faz ler como calcado: sem ela o
  // desenho vira uma cunha sem significado.
  "calcados": [
    ["path", "M2.6 16.9 H21.4 C21.4 18.4 20.2 19.5 18.7 19.5 H5.3 C3.8 19.5 2.6 18.4 2.6 16.9 Z"],
    ["path", "M4.3 16.9 V11.3 C4.3 10.5 4.9 9.9 5.7 9.9 H8.3 C8.8 9.9 9.3 10.2 9.5 10.6 L10.7 12.9 C11 13.4 11.5 13.8 12.1 13.9 L17.7 15.2 C18.9 15.5 19.8 16 20.3 16.9"],
    ["path", "M6.6 12.7 H9.2"],
  ],
  // Oculos
  "acessorios": [
    ["circle", 6.3, 14, 3.6],
    ["circle", 17.7, 14, 3.6],
    ["path", "M9.9 13.4 C11 12.6 13 12.6 14.1 13.4"],
    ["path", "M2.9 12.4 L4.6 8 M21.1 12.4 L19.4 8"],
  ],
  // Escudo com visto
  "originais": [
    ["path", "M12 2.5 L20 5.6 V11.8 C20 16.5 16.6 20 12 21.5 C7.4 20 4 16.5 4 11.8 V5.6 Z"],
    ["path", "M8.8 11.9 L11.1 14.2 L15.3 10"],
  ],
  // Calca
  "jeans": [
    ["path", "M7 2.8 H17 L18 21.2 H13.8 L12 11.4 L10.2 21.2 H6 Z"],
    ["path", "M7.1 6.4 H16.9"],
  ],
  // Estrela
  "contatos bonus": [
    ["path", "M12 2.8 L14.8 8.7 L21.2 9.6 L16.6 14.2 L17.7 20.6 L12 17.6 L6.3 20.6 L7.4 14.2 L2.8 9.6 L9.2 8.7 Z"],
  ],
};

// Etiqueta: categoria nova criada no admin cai aqui.
export const DESENHO_PADRAO = [
  ["path", "M20.6 12.8 L12.8 20.6 C12 21.4 10.8 21.4 10 20.6 L3.6 14.2 C3.2 13.8 3 13.3 3 12.8 V5.4 C3 4.3 3.9 3.4 5 3.4 H12.4 C12.9 3.4 13.4 3.6 13.8 4 L20.6 10.8 C21.4 11.6 21.4 12.8 20.6 12.8 Z"],
  ["circle", 7.6, 7.6, 1.3],
];

export const SVG_NS = "http://www.w3.org/2000/svg";

export function montarIcone(categoria) {
  const formas = DESENHOS[normalizar(categoria)] ?? DESENHO_PADRAO;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const forma of formas) {
    if (forma[0] === "circle") {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", forma[1]);
      c.setAttribute("cy", forma[2]);
      c.setAttribute("r", forma[3]);
      svg.appendChild(c);
    } else {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", forma[1]);
      svg.appendChild(p);
    }
  }
  return svg;
}
