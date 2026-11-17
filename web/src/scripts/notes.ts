import katex from "katex";

const TEX = [
  "E(S)=E_{\\mathrm{mat}}+E_{\\mathrm{flux}}+E_{\\mathrm{terr}}+E_{\\mathrm{ex}}+E_{\\mathrm{king}}+E_{\\mathrm{trop}}+E_{\\mathrm{pawn}}+E_{\\mathrm{conf}}+E_{\\mathrm{tempo}}",
  "\\varphi=\\min\\left(1,\\frac{N_{N}+N_{B}+2N_{R}+4N_{Q}}{24}\\right)",
  "E(\\mathcal{F}S)=-E(S)",
];

export function renderNotes(): void {
  document.querySelectorAll<HTMLElement>(".math").forEach((node, index) => {
    katex.render(TEX[index] ?? "", node, { throwOnError: false, displayMode: true });
  });
}
