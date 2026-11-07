import type { EstadoEquivalencia, ResolutorEquivalencias, ResultadoEquivalencia } from './tipos';
import { normalizarTexto } from './utiles';

/** Una fila de la tabla de equivalencias de UNA organización. */
export interface FilaEquivalencia {
  catalogo: string;
  valorLocal: string;
  idErp: string | number;
  estado: Exclude<EstadoEquivalencia, 'SIN_EQUIVALENCIA'>;
}

/** Entrada normalizada de un catálogo del ERP (unidades, impuestos, etc.). */
export interface EntradaCatalogo {
  idErp: string | number;
  codigo: string | null;
  nombre: string | null;
  /** false = el ERP la marca inactiva. */
  activo: boolean | null;
  /** Elemento "carpeta"/borrador de un árbol (centros de costo, grupos). */
  esCarpeta?: boolean;
  borrador?: boolean;
  /** Registro original del ERP, por si luego se necesita otro dato. */
  payload?: unknown;
}

const clave = (catalogo: string, valorLocal: string) => `${catalogo}|${normalizarTexto(valorLocal)}`;

/** Resolutor sobre filas ya cargadas (las que devuelve la base de datos para la organización). */
export function resolutorEnMemoria(filas: FilaEquivalencia[]): ResolutorEquivalencias {
  const directo = new Map<string, FilaEquivalencia>();
  const inverso = new Map<string, FilaEquivalencia[]>();
  for (const f of filas) {
    directo.set(clave(f.catalogo, f.valorLocal), f);
    const k = `${f.catalogo}|${String(f.idErp)}`;
    inverso.set(k, [...(inverso.get(k) ?? []), f]);
  }
  return {
    aErp(catalogo, valorLocal): ResultadoEquivalencia {
      const f = directo.get(clave(catalogo, valorLocal));
      return f ? { estado: f.estado, idErp: f.idErp } : { estado: 'SIN_EQUIVALENCIA' };
    },
    aLocal(catalogo, idErp): ResultadoEquivalencia {
      const candidatas = inverso.get(`${catalogo}|${String(idErp)}`) ?? [];
      // Si varias filas locales apuntan al mismo id del ERP no se adivina cuál usar: se prefiere la confirmada
      // solo cuando es única.
      const confirmadas = candidatas.filter((c) => c.estado === 'CONFIRMADA');
      if (confirmadas.length === 1) return { estado: 'CONFIRMADA', valorLocal: confirmadas[0].valorLocal };
      if (confirmadas.length > 1) return { estado: 'REVISAR', valorLocal: confirmadas[0].valorLocal };
      if (candidatas.length > 0) return { estado: candidatas[0].estado, valorLocal: candidatas[0].valorLocal };
      return { estado: 'SIN_EQUIVALENCIA' };
    },
  };
}

export interface PropuestaEquivalencia {
  valorLocal: string;
  /** Cuántos registros locales usan ese valor (para priorizar). */
  usos: number;
  resultado: 'UNICO_CANDIDATO' | 'VARIOS_CANDIDATOS' | 'SIN_CANDIDATO';
  candidatos: EntradaCatalogo[];
}

/**
 * Sugiere equivalencias comparando el valor local con el código o nombre del catálogo del ERP
 * (coincidencia exacta normalizada: sin tildes, sin mayúsculas, espacios colapsados).
 * SOLO propone: nada se confirma sin que un administrador lo decida. Ignora entradas inactivas y carpetas.
 */
export function proponerEquivalencias(
  valoresLocales: { valor: string; usos: number }[],
  catalogo: EntradaCatalogo[],
): PropuestaEquivalencia[] {
  const vigentes = catalogo.filter((e) => e.activo !== false && !e.esCarpeta && !e.borrador);
  return valoresLocales.map(({ valor, usos }) => {
    const k = normalizarTexto(valor);
    const candidatos = k === '' ? [] : vigentes.filter((e) => normalizarTexto(e.codigo) === k || normalizarTexto(e.nombre) === k);
    return {
      valorLocal: valor,
      usos,
      candidatos,
      resultado: candidatos.length === 1 ? 'UNICO_CANDIDATO' : candidatos.length > 1 ? 'VARIOS_CANDIDATOS' : 'SIN_CANDIDATO',
    };
  });
}

/** Valores locales (con su número de usos) que todavía no tienen una equivalencia CONFIRMADA. */
export function valoresSinEquivalencia(
  catalogo: string,
  valoresLocales: { valor: string; usos: number }[],
  resolutor: ResolutorEquivalencias,
): { valor: string; usos: number; estado: EstadoEquivalencia }[] {
  return valoresLocales
    .map((v) => ({ ...v, estado: resolutor.aErp(catalogo, v.valor).estado }))
    .filter((v) => v.estado !== 'CONFIRMADA')
    .sort((a, b) => b.usos - a.usos);
}

/** Equivalencias confirmadas cuyo registro del ERP ya no está vigente en el catálogo descargado → deben revisarse. */
export function equivalenciasAfectadasPorCatalogo(filas: FilaEquivalencia[], catalogo: EntradaCatalogo[]): FilaEquivalencia[] {
  const vigentes = new Set(catalogo.filter((e) => e.activo !== false).map((e) => String(e.idErp)));
  return filas.filter((f) => f.estado === 'CONFIRMADA' && !vigentes.has(String(f.idErp)));
}
