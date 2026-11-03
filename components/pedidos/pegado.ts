import type { CompraDetalle } from '@/components/pedidos/tipos';
import type { CampoPegado, ConfigPegado } from '@/components/pedidos/ajustes';
import { numeroDeTexto, ofertaDe } from '@/components/pedidos/reglas';

/**
 * PEGAR PRECIOS: las cotizaciones llegan como texto (correo, WhatsApp) o filas de Excel. El usuario decide cómo se
 * separan las columnas (tabulador, espacio, coma, punto y coma, barra o el carácter que prefiera) y qué es cada
 * columna: producto (referencia, código o nombre), costo sin IVA, días, observación, o la referencia del proveedor
 * (que actualiza el catálogo). Una línea "flete 25000" fija el flete que cotizó el proveedor.
 */
export interface FilaPegada {
  original: string;
  celdas: string[];
  lineaId?: string;
  producto?: string;
  costo?: number;
  dias?: number;
  observacion?: string;
  referencia?: string;
  estado: 'ok' | 'sin_coincidencia' | 'sin_costo' | 'repetida' | 'sin_producto';
}
export interface ResultadoPegado { filas: FilaPegada[]; flete?: number; columnas: number }

const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function dividirLinea(linea: string, cfg: ConfigPegado): string[] {
  const l = linea.trim();
  const por = (sep: string | RegExp) => l.split(sep).map((x) => x.trim());
  switch (cfg.separador) {
    case 'tab': return por('\t');
    case 'coma': return por(',');
    case 'punto_coma': return por(';');
    case 'barra': return por('|');
    case 'otro': return cfg.otro ? por(cfg.otro) : [l];
    case 'espacio': return agruparEspacios(l.split(/\s+/), cfg.columnas);
    default: {
      if (l.includes('\t')) return por('\t');
      if (l.includes(';')) return por(';');
      if (l.includes('|')) return por('|');
      if (/\s{2,}/.test(l)) return por(/\s{2,}/);
      return agruparEspacios(l.split(/\s+/), cfg.columnas);
    }
  }
}

/** Con espacios, un nombre puede tener varias palabras: el primer campo toma las que sobren. */
function agruparEspacios(tokens: string[], columnas: CampoPegado[]): string[] {
  const resto = columnas.length - 1;
  if (tokens.length > columnas.length && resto >= 0) return [tokens.slice(0, tokens.length - resto).join(' '), ...tokens.slice(tokens.length - resto)];
  return tokens;
}

export function analizarPegado(d: CompraDetalle, proveedorId: number, texto: string, cfg: ConfigPegado): ResultadoPegado {
  const lineas = texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (cfg.primeraEsEncabezado) lineas.shift();
  const filas: FilaPegada[] = [];
  const usadas = new Set<string>();
  let flete: number | undefined;
  let columnas = 0;

  for (const original of lineas) {
    const celdas = dividirLinea(original, cfg);
    columnas = Math.max(columnas, celdas.length);
    const primera = normalizar(celdas[0] ?? '');
    if (primera === 'flete' || primera.startsWith('flete ')) {
      const num = celdas.slice(1).map((x) => numeroDeTexto(x)).find((x) => x !== undefined) ?? numeroDeTexto(primera.replace('flete', ''));
      if (num !== undefined) { flete = num; continue; }
    }
    const campo = (c: CampoPegado) => { const i = cfg.columnas.indexOf(c); return i >= 0 ? (celdas[i] ?? '').trim() : ''; };
    const fila: FilaPegada = { original, celdas, estado: 'sin_producto' };
    const clave = normalizar(campo('producto'));
    if (clave === '') { filas.push(fila); continue; }

    const candidatas = d.lineas.filter((l) => !l.ordenada).map((l) => ({
      l,
      exactas: [...(ofertaDe(l, proveedorId)?.referencia ?? '').split('/').map((x) => x.trim()), l.codigo ?? '', l.nombre].filter(Boolean).map(normalizar),
    }));
    let hallada = candidatas.find((x) => x.exactas.includes(clave));
    if (!hallada && clave.length >= 3) hallada = candidatas.find((x) => normalizar(x.l.nombre).includes(clave) || clave.includes(normalizar(x.l.nombre)));

    fila.estado = 'sin_coincidencia';
    if (hallada) {
      fila.lineaId = hallada.l.id;
      fila.producto = hallada.l.nombre;
      const costo = campo('costo') ? numeroDeTexto(campo('costo')) : undefined;
      const dias = campo('dias') ? numeroDeTexto(campo('dias')) : undefined;
      fila.observacion = campo('observacion') || undefined;
      fila.referencia = campo('referencia') || undefined;
      if (costo === undefined || costo <= 0) fila.estado = 'sin_costo';
      else if (usadas.has(hallada.l.id)) fila.estado = 'repetida';
      else {
        fila.estado = 'ok';
        fila.costo = costo;
        fila.dias = dias !== undefined && Number.isInteger(dias) && dias >= 0 && dias <= 365 ? dias : undefined;
        usadas.add(hallada.l.id);
      }
    }
    filas.push(fila);
  }
  return { filas, flete, columnas };
}
