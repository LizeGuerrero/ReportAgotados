import type { CompraDetalle } from '@/components/pedidos/tipos';
import { numeroDeTexto, ofertaDe } from '@/components/pedidos/reglas';

/**
 * PEGAR PRECIOS: las cotizaciones suelen llegar como texto (correo, WhatsApp) o como filas de Excel. Esto las
 * interpreta y las empata con los productos de la compra para registrar muchas ofertas de una vez.
 * Formato: una línea por producto. Primero cómo se identifica (referencia del proveedor, código interno o
 * nombre), luego el costo unitario SIN IVA y, opcional, los días de entrega:   TL-12   38.000   3
 */
export interface FilaPegada {
  original: string;
  clave: string;
  costo?: number;
  dias?: number;
  lineaId?: string;
  producto?: string;
  estado: 'ok' | 'sin_coincidencia' | 'sin_costo' | 'repetida';
}

const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Separa una línea en identificador + números finales (costo y, opcional, días). */
function partir(linea: string): { clave: string; numeros: string[] } {
  const trozos = linea.includes('\t') || linea.includes(';') || linea.includes('|')
    ? linea.split(/[\t;|]+/).map((x) => x.trim()).filter(Boolean)
    : linea.trim().split(/\s{2,}/).map((x) => x.trim()).filter(Boolean);
  const partes = trozos.length > 1 ? trozos : linea.trim().split(/\s+/);
  const numeros: string[] = [];
  while (partes.length > 1 && numeros.length < 2 && numeroDeTexto(partes[partes.length - 1]) !== undefined) {
    numeros.unshift(partes.pop() as string);
  }
  return { clave: partes.join(' ').trim(), numeros };
}

export function analizarPegado(d: CompraDetalle, proveedorId: number, texto: string): FilaPegada[] {
  const filas: FilaPegada[] = [];
  const usadas = new Set<string>();
  for (const original of texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const { clave, numeros } = partir(original);
    const fila: FilaPegada = { original, clave, estado: 'sin_coincidencia' };
    const k = normalizar(clave);

    const candidatas = d.lineas.filter((l) => !l.ordenada).map((l) => {
      const refs = (ofertaDe(l, proveedorId)?.referencia ?? '').split('/').map((x) => x.trim()).filter(Boolean);
      return {
        l,
        exactas: [...refs, l.codigo, l.nombre].filter((x): x is string => !!x).map(normalizar),
        nombres: [l.nombre].map(normalizar),
      };
    });
    let hallada = candidatas.find((x) => k !== '' && x.exactas.includes(k));
    if (!hallada && k.length >= 3) hallada = candidatas.find((x) => x.nombres.some((n) => n.includes(k) || k.includes(n)));

    if (hallada) {
      fila.lineaId = hallada.l.id;
      fila.producto = hallada.l.nombre;
      const costo = numeros.length > 0 ? numeroDeTexto(numeros[0]) : undefined;
      const dias = numeros.length > 1 ? numeroDeTexto(numeros[1]) : undefined;
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
  return filas;
}
