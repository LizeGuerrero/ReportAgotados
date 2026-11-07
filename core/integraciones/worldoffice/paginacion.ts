import type { ClienteWorldOffice, OperacionId } from './cliente';
import { respuestaInesperada } from './errores';

/** Cómo se avanza de página. La documentación no aclara si `registroInicial` y `pagina` se combinan: se fija con la sonda. */
export type ModoPaginacion = 'pagina' | 'registroInicial';

export interface OpcionesListado {
  registrosPorPagina?: number;
  modo?: ModoPaginacion;
  /** Tope de seguridad contra bucles (por defecto 2000 páginas). */
  maxPaginas?: number;
  /** Filtros del ERP (por defecto ninguno). Su formato (enteros vs cadenas) se confirma con la sonda. */
  filtros?: unknown[];
  columnaOrdenar?: string;
  orden?: 'ASC' | 'DESC';
  /** Se llama tras cada página (para mostrar avance). */
  alAvanzar?: (p: { pagina: number; acumulados: number; total: number | null }) => void;
}

export interface Pagina {
  content: unknown[];
  totalElements: number | null;
  totalPages: number | null;
  last: boolean | null;
}

export function construirCuerpoListado(
  cliente: Pick<ClienteWorldOffice, 'canal'>,
  indicePagina: number,
  o: OpcionesListado,
): Record<string, unknown> {
  const tam = o.registrosPorPagina ?? 100;
  // Confirmado con la sonda de contrato (nov-2026): el ERP avanza con `registroInicial`; `pagina` no avanza.
  const modo = o.modo ?? 'registroInicial';
  return {
    columnaOrdenar: o.columnaOrdenar ?? 'id',
    pagina: modo === 'pagina' ? indicePagina : 0,
    registrosPorPagina: tam,
    orden: o.orden ?? 'ASC',
    filtros: o.filtros ?? [],
    canal: cliente.canal,
    registroInicial: modo === 'registroInicial' ? indicePagina * tam : 0,
  };
}

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Extrae la página de un listado. Acepta las dos formas que muestra la documentación:
 * ApiResponse { data: Page } y Page sin envoltorio.
 */
export function extraerPagina(cuerpo: unknown, operacion: string): Pagina {
  const candidata = esObjeto(cuerpo) && esObjeto(cuerpo.data) && Array.isArray(cuerpo.data.content) ? cuerpo.data : cuerpo;
  if (!esObjeto(candidata) || !Array.isArray(candidata.content)) throw respuestaInesperada(operacion, 'no trae `content[]`');
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    content: candidata.content,
    totalElements: num(candidata.totalElements),
    totalPages: num(candidata.totalPages),
    last: typeof candidata.last === 'boolean' ? candidata.last : null,
  };
}

/**
 * Descarga TODAS las páginas de un listado. Se detiene cuando el ERP indica `last`, cuando se alcanza
 * `totalPages`/`totalElements`, cuando una página llega vacía, o por el tope de seguridad.
 * Si una página repite exactamente la anterior (el ERP ignoró el avance) lanza error en vez de ciclar.
 */
export async function descargarTodo(
  cliente: ClienteWorldOffice,
  operacion: OperacionId,
  o: OpcionesListado = {},
): Promise<{ registros: unknown[]; paginas: number; total: number | null }> {
  const maxPaginas = o.maxPaginas ?? 2000;
  const registros: unknown[] = [];
  let total: number | null = null;
  let previa = '';

  for (let i = 0; i < maxPaginas; i++) {
    const { cuerpo } = await cliente.ejecutar(operacion, { cuerpo: construirCuerpoListado(cliente, i, o) });
    const pagina = extraerPagina(cuerpo, operacion);
    total = pagina.totalElements ?? total;
    if (pagina.content.length === 0) return { registros, paginas: i, total };

    const huella = JSON.stringify(pagina.content[0]) + '|' + pagina.content.length;
    if (i > 0 && huella === previa) {
      throw respuestaInesperada(operacion, 'la página siguiente es idéntica a la anterior (el ERP no está avanzando); revisar el modo de paginación');
    }
    previa = huella;

    registros.push(...pagina.content);
    o.alAvanzar?.({ pagina: i, acumulados: registros.length, total });

    if (pagina.last === true) return { registros, paginas: i + 1, total };
    if (pagina.totalPages !== null && i + 1 >= pagina.totalPages) return { registros, paginas: i + 1, total };
    if (total !== null && registros.length >= total) return { registros, paginas: i + 1, total };
  }
  throw respuestaInesperada(operacion, `se superó el tope de ${maxPaginas} páginas`);
}
