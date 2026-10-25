import type { FilaErp, FuenteCxp, ResultadoLectura } from './tipos';

/*
 * Lector del Excel que genera el ERP actual (la hoja "R EXCEL DESDE SISTEMA").
 * Lee por NOMBRE de columna, no por posición, e ignora las columnas que se agregaron a mano
 * (REVISAR, DETAL) y las que se calculan solas (DIAS_VENC).
 */

const REQUERIDAS = ['TERCERO', 'NOMBRE / RAZON SOCIAL', 'DOCUMENTO', 'FECHA_DCTO', 'FECHA_VCTO', 'SALDO'];
// Si una hoja trae esto, es una hoja de trabajo (CXP YA FILTRADA, PAGADO...), no la exportación del ERP.
const DE_TRABAJO = ['EN SISTEMA', 'CONFIRMA PAGO'];
const NO_GUARDAR = new Set(['REVISAR', 'DETAL', 'DIAS_VENC']);
const HOJA_PREFERIDA = 'R EXCEL DESDE SISTEMA';

const normalizar = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/* eslint-disable @typescript-eslint/no-explicit-any */
function valorCelda(v: any): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return valorCelda(v.result); // fórmula
    if (Array.isArray(v.richText)) return v.richText.map((t: { text: string }) => t.text).join('');
    if ('text' in v) return v.text; // hipervínculo
    return null;
  }
  return v;
}

function aTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  const t = String(v).trim();
  return t === '' ? null : t;
}

function aFecha(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const t = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function aNumeroCelda(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.replace(/[$\s]/g, '');
    if (t === '') return null;
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** El reporte del ERP termina con una línea de guiones (----------): no es un documento. */
const esSeparador = (v: string | null) => v !== null && /^[-=_*\s]+$/.test(v);

async function huella(buffer: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface Candidata {
  hoja: any;
  nombre: string;
  filaEncabezado: number;
  columnas: Map<string, number>;
  encabezados: { texto: string; col: number }[];
}

function buscarEncabezado(hoja: any): Candidata | { faltan: string[] } | null {
  let mejorFaltan: string[] | null = null;
  const limite = Math.min(10, hoja.rowCount || 0);
  for (let r = 1; r <= limite; r++) {
    const columnas = new Map<string, number>();
    const encabezados: { texto: string; col: number }[] = [];
    hoja.getRow(r).eachCell({ includeEmpty: false }, (celda: any, col: number) => {
      const texto = aTexto(valorCelda(celda.value));
      if (!texto) return;
      const n = normalizar(texto);
      if (!columnas.has(n)) columnas.set(n, col);
      encabezados.push({ texto, col });
    });
    const faltan = REQUERIDAS.filter((c) => !columnas.has(c));
    if (faltan.length === 0) {
      if (DE_TRABAJO.some((c) => columnas.has(c))) return null; // hoja de trabajo
      return { hoja, nombre: hoja.name, filaEncabezado: r, columnas, encabezados };
    }
    if (columnas.size >= 5 && (mejorFaltan === null || faltan.length < mejorFaltan.length)) mejorFaltan = faltan;
  }
  return mejorFaltan ? { faltan: mejorFaltan } : null;
}

export const fuenteExcelErp: FuenteCxp<File> = {
  nombre: 'Excel del ERP',

  async leer(archivo: File): Promise<ResultadoLectura> {
    const buffer = await archivo.arrayBuffer();
    const hash = await huella(buffer);

    const mod: any = await import('exceljs'); // se carga solo al usarlo
    const ExcelJS = mod.default ?? mod;
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer);

    const candidatas: Candidata[] = [];
    let faltan: string[] | null = null;
    for (const hoja of libro.worksheets) {
      const r = buscarEncabezado(hoja);
      if (!r) continue;
      if ('faltan' in r) faltan = faltan ?? r.faltan;
      else candidatas.push(r);
    }

    if (candidatas.length === 0) {
      const detalle = faltan
        ? `Faltan estas columnas: ${faltan.join(', ')}.`
        : 'No encontré una hoja con el formato del ERP (columnas TERCERO, DOCUMENTO, FECHA_VCTO, SALDO...).';
      return { fuente: 'excel', archivo: archivo.name, hash, hoja: '', filas: [], problemas: [detalle] };
    }
    let elegida = candidatas[0];
    if (candidatas.length > 1) {
      const preferida = candidatas.find((c) => normalizar(c.nombre) === HOJA_PREFERIDA);
      if (!preferida) {
        return {
          fuente: 'excel', archivo: archivo.name, hash, hoja: '', filas: [],
          problemas: [
            `Hay varias hojas con formato del ERP (${candidatas.map((c) => c.nombre).join(', ')}). ` +
              `Deja solo la hoja que se copió del ERP, o llámala "R EXCEL DESDE SISTEMA".`,
          ],
        };
      }
      elegida = preferida;
    }

    const { hoja, columnas, encabezados, filaEncabezado } = elegida;
    const col = (nombre: string) => columnas.get(nombre);
    const leer = (fila: any, nombre: string): unknown => {
      const c = col(nombre);
      return c ? valorCelda(fila.getCell(c).value) : null;
    };

    const filas: FilaErp[] = [];
    const problemas: string[] = [];
    for (let r = filaEncabezado + 1; r <= hoja.rowCount; r++) {
      const fila = hoja.getRow(r);
      const tvTercero = leer(fila, 'TERCERO');
      const tercero = typeof tvTercero === 'number' ? String(Math.trunc(tvTercero)) : aTexto(tvTercero);
      const documento = aTexto(leer(fila, 'DOCUMENTO'));
      const nombre = aTexto(leer(fila, 'NOMBRE / RAZON SOCIAL'));
      if (!tercero && !documento && !nombre) continue; // fila vacía
      if (esSeparador(tercero) || esSeparador(documento) || esSeparador(nombre)) continue; // línea de guiones

      const vCo = leer(fila, 'C.O.');
      const coCodigo = typeof vCo === 'number' ? String(Math.trunc(vCo)).padStart(3, '0') : aTexto(vCo);
      const dcto = aFecha(leer(fila, 'FECHA_DCTO'));
      const vcto = aFecha(leer(fila, 'FECHA_VCTO'));
      const saldo = aNumeroCelda(leer(fila, 'SALDO'));

      const faltantes: string[] = [];
      if (!tercero) faltantes.push('TERCERO');
      if (!documento) faltantes.push('DOCUMENTO');
      if (!nombre) faltantes.push('NOMBRE / RAZON SOCIAL');
      if (!vcto) faltantes.push('FECHA_VCTO');
      if (saldo === null) faltantes.push('SALDO');
      if (faltantes.length) problemas.push(`Fila ${r}: falta o no se entiende ${faltantes.join(', ')}.`);

      const raw: Record<string, string | number> = {};
      for (const { texto, col: c } of encabezados) {
        if (NO_GUARDAR.has(normalizar(texto))) continue;
        const v = valorCelda(fila.getCell(c).value);
        if (v === null || v === undefined || v === '') continue;
        raw[texto] = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? v : String(v);
      }

      const plazo = aNumeroCelda(leer(fila, 'PLAZO'));
      filas.push({
        fila: r,
        empresa: aTexto(leer(fila, 'EMPRESA')),
        tercero: tercero ?? '',
        nombre: nombre ?? '',
        co_codigo: coCodigo,
        co_nombre: aTexto(leer(fila, 'DESCRIPCION C.O.')),
        cond_pago: aTexto(leer(fila, 'COND_PAGO')),
        docto_proveedor: aTexto(leer(fila, 'DOCTO PROVEEDOR')),
        documento_erp: documento ?? '',
        fecha_dcto: dcto,
        fecha_vcto: vcto,
        plazo: plazo === null ? null : Math.round(plazo),
        saldo,
        detalle: aTexto(leer(fila, 'DETALLE')),
        raw,
      });
    }

    if (filas.length === 0 && problemas.length === 0) problemas.push('La hoja no tiene filas con datos.');
    return { fuente: 'excel', archivo: archivo.name, hash, hoja: elegida.nombre, filas, problemas };
  },
};
