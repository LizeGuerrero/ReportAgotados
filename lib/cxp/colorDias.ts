/**
 * Color de la casilla "Días venc.": blanca (sin color) si no está vencida, y cada vez más roja
 * entre más días de vencida (llega al rojo más fuerte a los 90 días). El color del texto se elige
 * solo (negro o blanco) para que siempre se lea bien (contraste mínimo 4,6:1).
 */
type RGB = [number, number, number];

export const DIAS_ROJO_MAXIMO = 90;

// De rosado muy claro a rojo oscuro.
const PARADAS: [number, RGB][] = [
  [0, [254, 226, 226]],
  [0.45, [248, 113, 113]],
  [0.65, [220, 38, 38]],
  [1, [127, 29, 29]],
];

const TEXTO_OSCURO: RGB = [0, 0, 0];
const TEXTO_CLARO: RGB = [255, 255, 255];

function lineal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminancia([r, g, b]: RGB): number {
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

export function contraste(a: RGB, b: RGB): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

function mezclar(t: number): RGB {
  for (let i = 1; i < PARADAS.length; i++) {
    const [t1, c1] = PARADAS[i];
    if (t <= t1) {
      const [t0, c0] = PARADAS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as RGB;
    }
  }
  return PARADAS[PARADAS.length - 1][1];
}

export interface ColorCelda {
  fondo: string;
  texto: string;
  rgb: RGB;
  textoRgb: RGB;
}

/** null = no está vencida: la casilla queda como las demás. */
export function colorDias(dias: number): ColorCelda | null {
  if (!(dias > 0)) return null;
  const rgb = mezclar(Math.min(dias, DIAS_ROJO_MAXIMO) / DIAS_ROJO_MAXIMO);
  const textoRgb = contraste(rgb, TEXTO_OSCURO) >= contraste(rgb, TEXTO_CLARO) ? TEXTO_OSCURO : TEXTO_CLARO;
  return {
    fondo: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    texto: `rgb(${textoRgb[0]}, ${textoRgb[1]}, ${textoRgb[2]})`,
    rgb,
    textoRgb,
  };
}
