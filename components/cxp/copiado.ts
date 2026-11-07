import { copiarAlPortapapeles } from '@/lib/tablaCopia';
import type { ModoCopiado } from './hoja/tipos';
import { moneda } from './tipos';

/** Entero en pesos, sin símbolo, separadores ni decimales: «1500000». Redondea al peso más cercano. */
export function aEntero(n: number): string {
  const r = Math.sign(n) * Math.round(Math.abs(n));
  return String(r === 0 ? 0 : r);
}

/** Cómo se copia un valor de pago según la preferencia del usuario. */
export function textoDeValor(n: number, modo: ModoCopiado): string {
  return modo === 'entero' ? aEntero(n) : moneda(n);
}

// «$ 1.500.000», «-$ 850.500», «$ 1.234,5» (formato es-CO de moneda(); el espacio puede ser el irrompible U+00A0).
const PATRON_MONEDA = /(-)?\$\s*(-)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/g;

/** Cambia cada valor en pesos que aparezca dentro de un texto copiado por su versión entera. El resto del texto no se toca. */
export function monedaAEnteroEnTexto(texto: string): string {
  return texto.replace(PATRON_MONEDA, (_todo, s1: string | undefined, s2: string | undefined, enteros: string, dec: string | undefined) => {
    const n = Number(`${enteros.replace(/\./g, '')}.${dec ?? '0'}`);
    return aEntero(s1 || s2 ? -n : n);
  });
}

const soloDigitos = (t: string) => t.replace(/\D/g, '');

/**
 * Lo que debe quedar en el portapapeles cuando el usuario copia (Ctrl+C) dentro de la tabla con «entero» activo.
 * Devuelve null si no hay nada que cambiar (se deja el copiado normal del navegador).
 */
export function copiaEnteraDeSeleccion(sel: Selection): string | null {
  const original = sel.toString();
  if (!original) return null;
  const convertido = monedaAEnteroEnTexto(original);
  if (convertido !== original) return convertido;

  // Selección parcial de una celda de dinero (p. ej. doble clic sobre «1.500.000», sin el «$»).
  const nodo = sel.anchorNode;
  const el = nodo instanceof Element ? nodo : nodo?.parentElement;
  const celda = el?.closest('td[data-copia]') as HTMLElement | null | undefined;
  if (celda && sel.focusNode && celda.contains(sel.focusNode) && /^[\s\d.,$-]+$/.test(original)) {
    const mostrado = soloDigitos(celda.textContent ?? '');
    if (mostrado !== '' && soloDigitos(original) === mostrado) return celda.getAttribute('data-copia');
  }
  return null;
}

/** Botón «Copiar total»: usa el mismo formato elegido en la configuración. */
export function copiarValor(n: number, modo: ModoCopiado): Promise<void> {
  const t = textoDeValor(n, modo);
  return copiarAlPortapapeles(Promise.resolve({ html: t, texto: t }));
}

const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Copia un texto de celda al portapapeles (texto plano, sin formato de tabla). */
export function copiarTexto(texto: string): Promise<void> {
  return copiarAlPortapapeles(Promise.resolve({ html: escaparHtml(texto), texto }));
}
