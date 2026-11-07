import type { ResultadoPaso, Transformacion } from './tipos';
import { esVacio, numeroCanonico } from './utiles';

const ok = (valor: unknown): ResultadoPaso => ({ ok: true, valor });
const fallo = (error: string): ResultadoPaso => ({ ok: false, error });

/** Transformaciones reutilizables por cualquier diccionario. Cada una es una función pura. */
export const TRANSFORMACIONES_BASE: Record<string, Transformacion> = {
  /** Texto recortado; vacío → null. */
  texto: (v, _p, { campo }) => {
    if (esVacio(v)) return ok(null);
    if (typeof v === 'string') return ok(v.trim());
    if (typeof v === 'number' || typeof v === 'boolean') return ok(String(v));
    return fallo(`${campo}: se esperaba un texto`);
  },

  entero: (v, _p, { campo }) => {
    if (esVacio(v)) return ok(null);
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    return Number.isInteger(n) ? ok(n) : fallo(`${campo}: se esperaba un número entero`);
  },

  numero: (v, _p, { campo }) => {
    if (esVacio(v)) return ok(null);
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    return Number.isFinite(n) ? ok(n) : fallo(`${campo}: se esperaba un número`);
  },

  booleano: (v, _p, { campo }) => {
    if (typeof v === 'boolean') return ok(v);
    if (esVacio(v)) return ok(null);
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'si', 'sí', 'verdadero'].includes(s)) return ok(true);
    if (['false', '0', 'no', 'falso'].includes(s)) return ok(false);
    return fallo(`${campo}: se esperaba verdadero/falso`);
  },

  /** Número como cadena canónica ("0.19"), para usarlo como clave de equivalencia. params.decimales (def. 4). */
  numeroNormalizado: (v, p, { campo }) => {
    if (esVacio(v)) return ok(null);
    const c = numeroCanonico(v, typeof p.decimales === 'number' ? p.decimales : 4);
    return c === null ? fallo(`${campo}: se esperaba un número`) : ok(c);
  },

  /** Cadena numérica → número. Inversa de numeroNormalizado. */
  cadenaANumero: (v, _p, { campo }) => {
    if (esVacio(v)) return ok(null);
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? ok(n) : fallo(`${campo}: "${String(v)}" no es un número`);
  },

  /**
   * Valor nuestro → identificador del ERP usando la equivalencia CONFIRMADA de la organización.
   * Una equivalencia solo propuesta, ausente o por revisar NO se usa: se reporta como faltante.
   * params.catalogo (obligatorio), params.nombreCatalogo (para el mensaje).
   */
  equivalencia: (v, p, { ctx, campo }) => {
    if (esVacio(v)) return ok(null);
    const catalogo = String(p.catalogo);
    const etiqueta = String(p.nombreCatalogo ?? catalogo);
    const valorLocal = String(v).trim();
    const r = ctx.equivalencias.aErp(catalogo, valorLocal);
    if (r.estado === 'CONFIRMADA' && r.idErp !== undefined) return ok(r.idErp);
    const detalle =
      r.estado === 'PROPUESTA'
        ? 'tiene una equivalencia propuesta que aún no está confirmada'
        : r.estado === 'REVISAR'
          ? 'tiene una equivalencia que apunta a un registro que ya no está vigente en el ERP'
          : 'no tiene equivalencia en el ERP';
    return {
      ok: false,
      faltante: {
        tipo: 'equivalencia',
        catalogo,
        valorLocal,
        mensaje: `${campo}: el valor "${valorLocal}" (${etiqueta}) ${detalle}. Un administrador debe resolverlo.`,
      },
    };
  },

  /** Identificador del ERP → valor nuestro, con la equivalencia CONFIRMADA. */
  equivalenciaInversa: (v, p, { ctx, campo }) => {
    if (esVacio(v)) return ok(null);
    const catalogo = String(p.catalogo);
    const etiqueta = String(p.nombreCatalogo ?? catalogo);
    const r = ctx.equivalencias.aLocal(catalogo, v as string | number);
    if (r.estado === 'CONFIRMADA' && r.valorLocal !== undefined) return ok(r.valorLocal);
    const detalle =
      r.estado === 'PROPUESTA'
        ? 'tiene una equivalencia propuesta sin confirmar'
        : r.estado === 'REVISAR'
          ? 'tiene una equivalencia que debe revisarse'
          : 'no tiene equivalencia en nuestra aplicación';
    return {
      ok: false,
      faltante: {
        tipo: 'equivalencia',
        catalogo,
        valorLocal: String(v),
        mensaje: `${campo}: el registro ${String(v)} del ERP (${etiqueta}) ${detalle}. Un administrador debe resolverlo.`,
      },
    };
  },
};
