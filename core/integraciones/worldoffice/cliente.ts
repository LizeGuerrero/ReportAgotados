import { errorDeRed, normalizarError, WorldOfficeError } from './errores';

/**
 * Lista CERRADA de operaciones permitidas. Todo lo que no esté aquí no se puede llamar.
 *  - Catálogos: SOLO lectura (listar). Este conector no tiene ninguna operación que cree unidades, clasificaciones,
 *    centros de costo, impuestos ni contabilizaciones.
 *  - Inventarios: listar, consultar, crear y editar. Eliminar no está habilitado.
 */
export const OPERACIONES = {
  'catalogo.unidades': { metodo: 'POST', ruta: '/api/v1/unidadesDeMedida/listarUnidadMedida', lectura: true },
  'catalogo.clasificaciones': { metodo: 'POST', ruta: '/api/v1/inventarios/clasificaciones', lectura: true },
  'catalogo.centrosCosto': { metodo: 'POST', ruta: '/api/v1/centrosDeCosto/listarCentroCosto', lectura: true },
  'catalogo.grupos': { metodo: 'POST', ruta: '/api/v1/inventarios/grupos', lectura: true },
  'catalogo.impuestosVenta': { metodo: 'POST', ruta: '/api/v1/inventarios/impuestosDeVentas', lectura: true },
  'catalogo.contabilizaciones': { metodo: 'POST', ruta: '/api/v1/contabilidad/contabilizaciones', lectura: true },
  'inventarios.listar': { metodo: 'POST', ruta: '/api/v1/inventarios/listarInventarios', lectura: true },
  'inventarios.consultarCodigo': { metodo: 'GET', ruta: '/api/v1/inventarios/consultaCodigo/{codigo}', lectura: true },
  'inventarios.consultarId': { metodo: 'GET', ruta: '/api/v1/inventarios/consultaId/{id}', lectura: true },
  'inventarios.crear': { metodo: 'POST', ruta: '/api/v1/inventarios/crearInventario', lectura: false },
  'inventarios.editar': { metodo: 'PUT', ruta: '/api/v1/inventarios/editarInventario/{id}', lectura: false },
} as const;

export type OperacionId = keyof typeof OPERACIONES;

/** Subconjunto mínimo de `fetch` que usa el cliente (facilita las pruebas). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface OpcionesCliente {
  /** Token de la organización. Puede venir con o sin el prefijo "WO ". */
  token: string;
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Reintentos SOLO para lecturas (5xx, 429, red). Las escrituras no se reintentan nunca. Por defecto 2. */
  reintentos?: number;
  /** Espera entre reintentos (ms). Se inyecta en pruebas. */
  esperar?: (ms: number) => Promise<void>;
  /** Valor del campo `canal` en los listados: la documentación muestra 0 y "WEB" (se fija con la sonda de contrato). */
  canal?: number | string;
}

export interface RespuestaWO {
  status: number;
  /** Cuerpo ya parseado (objeto JSON; o {texto} si no era JSON). */
  cuerpo: unknown;
}

export const URL_BASE_WORLD_OFFICE = 'https://api.worldoffice.cloud';

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Quita un prefijo "WO " repetido y espacios: el portal de World Office copia el token ya con el prefijo. */
export function normalizarToken(token: string): string {
  return token.trim().replace(/^WO(?:\s+|$)/i, '').trim();
}

export class ClienteWorldOffice {
  // Campo privado real (#): no aparece en JSON.stringify, console.log ni Object.keys.
  #token: string;
  readonly baseUrl: string;
  readonly canal: number | string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #reintentos: number;
  readonly #esperar: (ms: number) => Promise<void>;

  constructor(op: OpcionesCliente) {
    const t = normalizarToken(op.token ?? '');
    if (!t) throw new Error('Falta el token de World Office');
    this.#token = t;
    this.baseUrl = (op.baseUrl ?? URL_BASE_WORLD_OFFICE).replace(/\/+$/, '');
    this.canal = op.canal ?? 0;
    this.#fetch = op.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.#timeoutMs = op.timeoutMs ?? 30_000;
    this.#reintentos = op.reintentos ?? 2;
    this.#esperar = op.esperar ?? dormir;
  }

  toJSON() {
    return { baseUrl: this.baseUrl, token: '[oculto]' };
  }

  /** Construye la URL de una operación sustituyendo {codigo} / {id}. */
  construirUrl(op: OperacionId, parametros: Record<string, string | number> = {}): string {
    const ruta = OPERACIONES[op].ruta.replace(/\{(\w+)\}/g, (_m, nombre: string) => {
      const v = parametros[nombre];
      if (v === undefined || v === null || String(v) === '') throw new Error(`Falta el parámetro ${nombre} en ${op}`);
      return encodeURIComponent(String(v));
    });
    return this.baseUrl + ruta;
  }

  /**
   * Ejecuta una operación permitida. Devuelve el cuerpo en cualquier 2xx; para el resto lanza WorldOfficeError.
   * Lecturas: reintenta 5xx/429/red. Escrituras (crear/editar): UNA sola llamada, nunca se repiten
   * (la API no tiene idempotencia: ante un timeout hay que consultar por código antes de decidir).
   */
  async ejecutar(
    op: OperacionId,
    entrada: { parametros?: Record<string, string | number>; cuerpo?: unknown } = {},
  ): Promise<RespuestaWO> {
    const def = OPERACIONES[op];
    if (!def) throw new Error(`Operación no permitida: ${String(op)}`);
    const url = this.construirUrl(op, entrada.parametros);
    const maxIntentos = def.lectura ? this.#reintentos + 1 : 1;
    let ultimo: WorldOfficeError | null = null;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        return await this.#una(def.metodo, url, entrada.cuerpo);
      } catch (e) {
        if (!(e instanceof WorldOfficeError)) throw e;
        ultimo = e;
        if (!def.lectura || !e.reintentable || intento === maxIntentos) throw e;
        await this.#esperar(500 * 2 ** (intento - 1));
      }
    }
    throw ultimo as WorldOfficeError; // inalcanzable
  }

  async #una(metodo: string, url: string, cuerpo: unknown): Promise<RespuestaWO> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), this.#timeoutMs);
    let respuesta: { status: number; text(): Promise<string> };
    try {
      respuesta = await this.#fetch(url, {
        method: metodo,
        headers: {
          Authorization: `WO ${this.#token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: controlador.signal,
      });
    } catch (causa) {
      throw errorDeRed(causa, controlador.signal.aborted);
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await respuesta.text().catch(() => '');
    let parseado: unknown = null;
    if (texto.trim() !== '') {
      try {
        parseado = JSON.parse(texto);
      } catch {
        parseado = { texto: texto.slice(0, 300) };
      }
    }
    if (respuesta.status >= 200 && respuesta.status < 300) return { status: respuesta.status, cuerpo: parseado };
    throw normalizarError(respuesta.status, parseado);
  }
}
