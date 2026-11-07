import type { ReglaValidacion } from './tipos';
import { esVacio } from './utiles';

/**
 * Evalúa reglas de validación y devuelve los mensajes de error (lista vacía = válido).
 * `fase: 'pre'` evalúa solo "obligatorio" sobre el dato de origen; `fase: 'post'` evalúa el resto sobre el dato transformado.
 * Nunca recorta ni corrige: un dato que no cabe es un error, no se modifica en silencio.
 */
export function validar(
  valor: unknown,
  reglas: ReglaValidacion[] | undefined,
  etiqueta: string,
  fase: 'pre' | 'post',
): string[] {
  const errores: string[] = [];
  for (const r of reglas ?? []) {
    if (fase === 'pre') {
      if (r.tipo === 'obligatorio' && esVacio(valor)) errores.push(r.mensaje ?? `${etiqueta}: es obligatorio`);
      continue;
    }
    if (r.tipo === 'obligatorio' || esVacio(valor)) continue;
    switch (r.tipo) {
      case 'longitudMax': {
        const largo = String(valor).length;
        if (largo > r.max) {
          errores.push(r.mensaje ?? `${etiqueta}: tiene ${largo} caracteres y el máximo es ${r.max} (no se recorta automáticamente)`);
        }
        break;
      }
      case 'patron':
        if (!new RegExp(r.patron).test(String(valor))) errores.push(r.mensaje);
        break;
      case 'rango': {
        const n = Number(valor);
        if (!Number.isFinite(n) || (r.min !== undefined && n < r.min) || (r.max !== undefined && n > r.max)) {
          errores.push(r.mensaje ?? `${etiqueta}: debe estar entre ${r.min ?? '-∞'} y ${r.max ?? '∞'}`);
        }
        break;
      }
      case 'entero':
        if (!Number.isInteger(Number(valor))) errores.push(r.mensaje ?? `${etiqueta}: debe ser un número entero`);
        break;
    }
  }
  return errores;
}
