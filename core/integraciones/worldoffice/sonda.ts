import { ClienteWorldOffice, type OperacionId } from './cliente';
import { CATALOGOS, type ClaveCatalogo } from './catalogos';
import { WorldOfficeError } from './errores';
import { consultarPorCodigo, extraerEntidad, normalizarInventario, type InventarioErp } from './inventarios';
import { observarTarifasPorTipoImpuesto, type ObservacionTipoImpuesto } from './impuestos';
import { observarPractica, compactarInventarios, type FilaPractica, type InventarioCompacto } from './practica';
import { construirCuerpoListado, extraerPagina, type ModoPaginacion } from './paginacion';

/**
 * SONDA DE CONTRATO — SOLO LECTURA.
 *
 * Confirma, contra el World Office real, lo que la documentación deja en duda: tipo de `canal`, cómo avanza la
 * paginación, tamaño máximo de página, forma real de las respuestas, tarifa de cada tipo de impuesto y si los
 * códigos existentes caben en las reglas de código de nuestra aplicación.
 *
 * Garantías:
 *  - Solo usa operaciones de la lista LECTURAS (listados y consultas). No puede crear, editar ni eliminar nada.
 *  - El informe nunca contiene el token.
 *  - Cada paso es independiente: si uno falla se registra y los demás continúan.
 */

/** Únicas operaciones que la sonda puede ejecutar. */
export const LECTURAS: readonly OperacionId[] = [
  'catalogo.unidades',
  'catalogo.clasificaciones',
  'catalogo.centrosCosto',
  'catalogo.grupos',
  'catalogo.impuestosVenta',
  'catalogo.contabilizaciones',
  'inventarios.listar',
  'inventarios.consultarCodigo',
  'inventarios.consultarId',
];

type Forma = string | Forma[] | { [k: string]: Forma };

/** Describe la ESTRUCTURA de un valor (tipos, no datos) hasta cierta profundidad. */
export function formaDe(v: unknown, prof = 4): Forma {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length === 0 ? 'arreglo vacío' : ['arreglo', formaDe(v[0], prof - 1)];
  if (typeof v === 'object') {
    if (prof <= 0) return 'objeto';
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, formaDe(x, prof - 1)]));
  }
  return typeof v;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** En qué forma vino una entidad (la documentación muestra tres, INC-05). */
export function describirForma(cuerpo: unknown): string {
  if (!esObjeto(cuerpo)) return 'otro';
  if (Array.isArray(cuerpo.data)) return 'data: arreglo';
  if (esObjeto(cuerpo.data) && Array.isArray(cuerpo.data.content)) return 'data.content: arreglo';
  if (esObjeto(cuerpo.data)) return 'data: objeto';
  if (Array.isArray(cuerpo.content)) return 'content: arreglo';
  if ('id' in cuerpo || 'codigo' in cuerpo) return 'plano';
  return 'otro';
}

export interface ErrorResumido {
  status?: number;
  codigo?: string | null;
  formato?: string;
  mensaje: string;
  detalle?: string | null;
}

export type Intento<T> = ({ ok: true } & T) | { ok: false; error: ErrorResumido };

function resumenError(e: unknown): ErrorResumido {
  if (e instanceof WorldOfficeError) return { status: e.status, codigo: e.codigo, formato: e.formato, mensaje: e.message, detalle: e.detalle };
  return { mensaje: e instanceof Error ? e.message : String(e) };
}

async function intentar<T extends object>(fn: () => Promise<T>): Promise<Intento<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    return { ok: false, error: resumenError(e) };
  }
}

export interface OpcionesSonda {
  /** Crea un cliente con el canal indicado (el token lo conoce quien llama; la sonda nunca lo ve). */
  crearCliente: (canal: number | string) => ClienteWorldOffice;
  /** Canales a probar. Por defecto [0, "WEB"] (INC-02). */
  canales?: (number | string)[];
  /** Máximo de inventarios a descargar para el análisis de impuestos y códigos. Por defecto 300. */
  maxInventarios?: number;
  /** Cuántos registros de muestra (datos reales) incluir por catálogo / inventario. Por defecto 2. 0 = solo estructura. */
  muestras?: number;
  /** Regla local de código: patrón y longitud (las de nuestra aplicación). */
  reglaCodigo?: { patron: RegExp; max: number };
  /** Incluir los inventarios compactos en el informe (para exportar CSV). */
  incluirInventarios?: boolean;
}

export interface InformeSonda {
  generadoEn: string;
  baseUrl: string;
  soloLectura: true;
  canal: { probados: { canal: number | string; resultado: Intento<{ status: number; forma: Forma; paginaValida: boolean }> }[]; elegido: number | string | null };
  paginacion: {
    catalogo: string;
    total: number | null;
    pagina0: unknown;
    avanzaPorPagina: boolean | null;
    avanzaPorRegistroInicial: boolean | null;
    modoRecomendado: ModoPaginacion | null;
    nota: string;
  } | { ok: false; error: ErrorResumido };
  tamanoPagina: { solicitado: number; resultado: Intento<{ devueltos: number }> }[];
  tamanoElegido: number;
  catalogos: Record<string, Intento<{ total: number | null; descargados: number; descartados: number; activos: number; carpetas: number; forma: Forma; muestras: unknown[]; verificar?: string }>>;
  inventarios: Intento<{
    descargados: number;
    total: number | null;
    forma: Forma;
    muestras: unknown[];
    consultaPorCodigo: Intento<{ forma: string; formaDatos: Forma; entidadLegible: boolean }> | null;
    consultaPorCodigoInexistente: Intento<{ status: number }> | { ok: false; error: ErrorResumido } | null;
  }>;
  impuestos: { observaciones: ObservacionTipoImpuesto[]; escalaTarifa: 'porcentaje' | 'fraccion' | 'indeterminada'; sinImpuestos: number; conVariosTipos: number } | null;
  codigos: {
    analizados: number;
    noCumplenReglaLocal: { total: number; ejemplos: { codigo: string; motivo: string }[] };
    duplicadosPorMayusculas: { grupos: number; ejemplos: string[] };
  } | null;
  /** Combinaciones grupo/clasificación/impuesto/tarifa → contabilización que ya usan los inventarios de WO (evidencia, no decisión). */
  practica: FilaPractica[];
  /** Solo si se pide: los inventarios en forma compacta, para exportarlos a CSV. */
  inventariosCompactos?: InventarioCompacto[];
  notas: string[];
}

const TAMANOS = [100, 500, 1000];

async function descargarHasta(
  c: ClienteWorldOffice,
  op: OperacionId,
  maximo: number,
  tam: number,
  modo: ModoPaginacion,
): Promise<{ registros: unknown[]; total: number | null }> {
  if (!LECTURAS.includes(op)) throw new Error(`La sonda no puede ejecutar ${op}`);
  const registros: unknown[] = [];
  let total: number | null = null;
  let previa = '';
  for (let i = 0; i < 1000 && registros.length < maximo; i++) {
    const { cuerpo } = await c.ejecutar(op, { cuerpo: construirCuerpoListado(c, i, { registrosPorPagina: tam, modo }) });
    const p = extraerPagina(cuerpo, op);
    total = p.totalElements ?? total;
    if (p.content.length === 0) break;
    const huella = JSON.stringify(p.content[0]);
    if (i > 0 && huella === previa) throw new Error('La paginación no avanza con este modo');
    previa = huella;
    registros.push(...p.content);
    if (p.last === true || (p.totalPages !== null && i + 1 >= p.totalPages) || (total !== null && registros.length >= total)) break;
  }
  return { registros: registros.slice(0, maximo), total };
}

/** Primer inventario de cada tipo de impuesto de venta distinto, para ver la estructura real de `impuestos`. */
export function muestrasPorTipoImpuesto(registros: unknown[], max: number): unknown[] {
  const vistos = new Set<string>();
  const out: unknown[] = [];
  for (const r of registros) {
    if (!esObjeto(r) || !Array.isArray(r.impuestos)) continue;
    const tipo = r.impuestos.map((i) => (esObjeto(i) && esObjeto(i.inventarioTipoImpuestoVenta) ? String(i.inventarioTipoImpuestoVenta.id) : '?')).join('|');
    if (vistos.has(tipo)) continue;
    vistos.add(tipo);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

const primerId = (registros: unknown[]) => (esObjeto(registros[0]) ? registros[0].id : undefined);

export async function ejecutarSonda(o: OpcionesSonda): Promise<InformeSonda> {
  const muestras = o.muestras ?? 2;
  const maxInv = o.maxInventarios ?? 300;
  const regla = o.reglaCodigo ?? { patron: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, max: 40 };
  const notas: string[] = [];
  const canales = o.canales ?? [0, 'WEB'];

  // ---- 1. canal
  const probados: InformeSonda['canal']['probados'] = [];
  for (const canal of canales) {
    const c = o.crearCliente(canal);
    const resultado = await intentar(async () => {
      const r = await c.ejecutar('catalogo.unidades', { cuerpo: construirCuerpoListado(c, 0, { registrosPorPagina: 5 }) });
      let paginaValida = true;
      try {
        extraerPagina(r.cuerpo, 'catalogo.unidades');
      } catch {
        paginaValida = false;
      }
      return { status: r.status, forma: formaDe(r.cuerpo, 3), paginaValida };
    });
    probados.push({ canal, resultado });
  }
  const buenos = probados.filter((p) => p.resultado.ok && p.resultado.paginaValida);
  const elegido = buenos.length > 0 ? buenos[0].canal : null;
  if (elegido === null) {
    notas.push('Ningún valor de `canal` funcionó: revisar token, permisos y la sección canal del informe. No se continuó con las demás pruebas.');
    return {
      generadoEn: new Date().toISOString(),
      baseUrl: o.crearCliente(canales[0]).baseUrl,
      soloLectura: true,
      canal: { probados, elegido },
      paginacion: { ok: false, error: { mensaje: 'No ejecutada: no hay canal válido' } },
      tamanoPagina: [],
      tamanoElegido: 0,
      catalogos: {},
      inventarios: { ok: false, error: { mensaje: 'No ejecutada: no hay canal válido' } },
      impuestos: null,
      codigos: null,
      practica: [],
      notas,
    };
  }
  if (buenos.length > 1) notas.push(`Funcionaron varios valores de canal (${buenos.map((b) => JSON.stringify(b.canal)).join(', ')}); se usó el primero.`);
  const cliente = o.crearCliente(elegido);

  // ---- 2. paginación (con un catálogo pequeño y tamaño 2)
  let modoRecomendado: ModoPaginacion | null = null;
  const paginacion: InformeSonda['paginacion'] = await (async () => {
    const r = await intentar(async () => {
      const ped = async (indice: number, modo: ModoPaginacion) => {
        const { cuerpo } = await cliente.ejecutar('catalogo.unidades', { cuerpo: construirCuerpoListado(cliente, indice, { registrosPorPagina: 2, modo }) });
        return extraerPagina(cuerpo, 'catalogo.unidades');
      };
      const p0 = await ped(0, 'pagina');
      const total = p0.totalElements;
      if (p0.content.length < 2 || (total !== null && total <= 2)) {
        return { total, pagina0: formaDe(p0.content[0], 2), avanzaPorPagina: null, avanzaPorRegistroInicial: null, nota: 'El catálogo tiene 2 registros o menos: no se puede comprobar cómo avanza la paginación. Repetir con un catálogo más grande.' };
      }
      const p1 = await ped(1, 'pagina');
      const r1 = await ped(1, 'registroInicial');
      const base = primerId(p0.content);
      const avanzaPorPagina = p1.content.length > 0 && primerId(p1.content) !== base;
      const avanzaPorRegistroInicial = r1.content.length > 0 && primerId(r1.content) !== base;
      return {
        total,
        pagina0: formaDe(p0.content[0], 2),
        avanzaPorPagina,
        avanzaPorRegistroInicial,
        nota: avanzaPorPagina ? 'La paginación avanza con `pagina`.' : avanzaPorRegistroInicial ? 'La paginación avanza con `registroInicial` (no con `pagina`).' : 'Ninguno de los dos modos avanzó: revisar manualmente.',
      };
    });
    if (!r.ok) return r;
    modoRecomendado = r.avanzaPorPagina ? 'pagina' : r.avanzaPorRegistroInicial ? 'registroInicial' : null;
    return { catalogo: 'unidades', total: r.total, pagina0: r.pagina0, avanzaPorPagina: r.avanzaPorPagina, avanzaPorRegistroInicial: r.avanzaPorRegistroInicial, modoRecomendado, nota: r.nota };
  })();
  const modo: ModoPaginacion = modoRecomendado ?? 'pagina';
  if (modoRecomendado === null) notas.push('No se pudo determinar el modo de paginación; se usó `pagina` por omisión.');

  // ---- 3. tamaño de página
  const tamanoPagina: InformeSonda['tamanoPagina'] = [];
  for (const solicitado of TAMANOS) {
    const resultado = await intentar(async () => {
      const { cuerpo } = await cliente.ejecutar('catalogo.unidades', { cuerpo: construirCuerpoListado(cliente, 0, { registrosPorPagina: solicitado, modo }) });
      return { devueltos: extraerPagina(cuerpo, 'catalogo.unidades').content.length };
    });
    tamanoPagina.push({ solicitado, resultado });
  }
  const aceptados = tamanoPagina.filter((t) => t.resultado.ok).map((t) => t.solicitado);
  const tamanoElegido = aceptados.length > 0 ? Math.min(Math.max(...aceptados), 100) : 20;

  // ---- 4. catálogos (descarga completa; solo lectura)
  const catalogos: InformeSonda['catalogos'] = {};
  for (const clave of Object.keys(CATALOGOS) as ClaveCatalogo[]) {
    const def = CATALOGOS[clave];
    catalogos[clave] = await intentar(async () => {
      const { registros, total } = await descargarHasta(cliente, def.operacion, 5000, tamanoElegido, modo);
      const entradas = registros.map((r) => def.mapear(r)).filter((e): e is NonNullable<typeof e> => e !== null);
      return {
        total,
        descargados: registros.length,
        descartados: registros.length - entradas.length,
        activos: entradas.filter((e) => e.activo !== false).length,
        carpetas: entradas.filter((e) => e.esCarpeta === true).length,
        forma: formaDe(registros[0], 3),
        muestras: muestras > 0 ? registros.slice(0, muestras) : [],
        verificar: def.verificar,
      };
    });
  }

  // ---- 5. inventarios
  let normalizados: InventarioErp[] = [];
  const inventarios: InformeSonda['inventarios'] = await intentar(async () => {
    const { registros, total } = await descargarHasta(cliente, 'inventarios.listar', maxInv, Math.min(tamanoElegido, 50), modo);
    normalizados = registros.map((r) => (esObjeto(r) ? normalizarInventario(r) : null)).filter((x): x is InventarioErp => x !== null);

    const primero = normalizados[0];
    const consultaPorCodigo = primero?.codigo
      ? await intentar(async () => {
          const r = await cliente.ejecutar('inventarios.consultarCodigo', { parametros: { codigo: primero.codigo as string } });
          const e = extraerEntidad(r.cuerpo);
          return { forma: describirForma(r.cuerpo), formaDatos: formaDe(r.cuerpo, 2), entidadLegible: e !== null && normalizarInventario(e) !== null };
        })
      : null;

    // Código que no debería existir: muestra cómo responde World Office cuando NO hay ítem (¿404?)
    const codigoInexistente = 'ZZ-SONDA-NO-EXISTE-0001';
    const inexistente = await intentar(async () => {
      try {
        const r = await consultarPorCodigo(cliente, codigoInexistente);
        return { status: r === null ? 404 : 200 };
      } catch (e) {
        throw e;
      }
    });

    return {
      descargados: registros.length,
      total,
      forma: formaDe(registros[0], 4),
      // Muestras: el primer inventario de CADA tipo de impuesto (para ver cómo viene `valor` y `tipoCobro`), máx. 5.
      muestras: muestras > 0 ? muestrasPorTipoImpuesto(registros, Math.min(muestras, 5)) : [],
      consultaPorCodigo,
      consultaPorCodigoInexistente: inexistente,
    };
  });

  // ---- 6. impuestos (evidencia para la equivalencia del IVA)
  let impuestos: InformeSonda['impuestos'] = null;
  if (normalizados.length > 0) {
    const observaciones = observarTarifasPorTipoImpuesto(normalizados);
    const todas = observaciones.flatMap((o2) => o2.tarifas.map((t) => t.tarifa)).filter((t): t is number => t !== null);
    const escalaTarifa = todas.some((t) => t > 1) ? 'porcentaje' : todas.some((t) => t > 0 && t < 1) ? 'fraccion' : 'indeterminada';
    impuestos = {
      observaciones,
      escalaTarifa,
      sinImpuestos: normalizados.filter((i) => Array.isArray(i.datos.impuestos) && i.datos.impuestos.length === 0).length,
      conVariosTipos: normalizados.filter((i) => i.datos.impuestosAmbiguos === true).length,
    };
    if (escalaTarifa === 'indeterminada') notas.push('No se pudo determinar la escala de las tarifas (todas 0 o ausentes).');
  }

  // ---- 7. compatibilidad de los códigos con nuestras reglas
  let codigos: InformeSonda['codigos'] = null;
  if (normalizados.length > 0) {
    const malos: { codigo: string; motivo: string }[] = [];
    const grupos = new Map<string, string[]>();
    for (const i of normalizados) {
      const cod = i.codigo;
      if (cod === null) {
        malos.push({ codigo: '(vacío)', motivo: 'sin código' });
        continue;
      }
      if (cod.trim().length > regla.max) malos.push({ codigo: cod, motivo: `más de ${regla.max} caracteres` });
      else if (!regla.patron.test(cod.trim())) malos.push({ codigo: cod, motivo: 'caracteres no admitidos' });
      const k = cod.trim().toLowerCase();
      grupos.set(k, [...(grupos.get(k) ?? []), cod]);
    }
    const dup = [...grupos.values()].filter((g) => g.length > 1);
    codigos = {
      analizados: normalizados.length,
      noCumplenReglaLocal: { total: malos.length, ejemplos: malos.slice(0, 10) },
      duplicadosPorMayusculas: { grupos: dup.length, ejemplos: dup.slice(0, 5).map((g) => g.join(' / ')) },
    };
  }

  if (inventarios.ok && inventarios.total !== null && inventarios.descargados < inventarios.total) {
    notas.push(`Se analizaron ${inventarios.descargados} de ${inventarios.total} inventarios (límite de la sonda). Los porcentajes de códigos y tarifas son una muestra.`);
  }

  return {
    generadoEn: new Date().toISOString(),
    baseUrl: cliente.baseUrl,
    soloLectura: true,
    canal: { probados, elegido },
    paginacion,
    tamanoPagina,
    tamanoElegido,
    catalogos,
    inventarios,
    impuestos,
    codigos,
    practica: observarPractica(normalizados),
    ...(o.incluirInventarios ? { inventariosCompactos: compactarInventarios(normalizados) } : {}),
    notas,
  };
}
