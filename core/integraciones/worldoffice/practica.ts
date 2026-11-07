import { tarifaDeImpuesto } from './inventarios';
import type { InventarioErp } from './inventarios';

/**
 * PRÁCTICA OBSERVADA en los inventarios que ya existen en World Office: qué grupo, clasificación, tipo de impuesto,
 * tarifa y contabilización combinan hoy. Es solo EVIDENCIA para que el administrador decida las reglas de creación;
 * nunca se usa para rellenar un valor automáticamente.
 */
const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const txt = (x: unknown): string | null => (typeof x === 'string' ? x : null);

export interface FilaPractica {
  grupo: { id: number | null; codigo: string | null; nombre: string | null } | null;
  clasificacion: { id: number | null; nombre: string | null } | null;
  tipoImpuestoId: number | null;
  tarifa: number | null;
  contabilizacion: { id: number | null; codigo: string | null; nombre: string | null } | null;
  inventarios: number;
}

export interface InventarioCompacto {
  id: number | string;
  codigo: string | null;
  descripcion: string | null;
  activo: boolean | null;
  unidad: string | null;
  clasificacion: string | null;
  grupo: string | null;
  tipoImpuesto: string | null;
  tarifa: number | null;
  contabilizacion: string | null;
  centroCosto: string | null;
}

function partes(inv: InventarioErp) {
  const d = inv.datos;
  const g = Array.isArray(d.grupo) && esObjeto(d.grupo[0]) ? d.grupo[0] : null;
  const cl = esObjeto(d.inventarioClasificacion) ? d.inventarioClasificacion : null;
  const co = esObjeto(d.contabilizacion) ? d.contabilizacion : null;
  const imp = Array.isArray(d.impuestos) && d.impuestos.length === 1 ? d.impuestos[0] : null;
  const tipo = esObjeto(imp) && esObjeto(imp.inventarioTipoImpuestoVenta) ? imp.inventarioTipoImpuestoVenta : null;
  return { g, cl, co, imp, tipo, un: esObjeto(d.unidadMedida) ? d.unidadMedida : null, cc: esObjeto(d.centroCosto) ? d.centroCosto : null };
}

export function observarPractica(inventarios: InventarioErp[]): FilaPractica[] {
  const m = new Map<string, FilaPractica>();
  for (const inv of inventarios) {
    const p = partes(inv);
    const fila: FilaPractica = {
      grupo: p.g ? { id: num(p.g.id), codigo: txt(p.g.codigo), nombre: txt(p.g.nombreGrupo) } : null,
      clasificacion: p.cl ? { id: num(p.cl.id), nombre: txt(p.cl.nombre) } : null,
      tipoImpuestoId: p.tipo ? num(p.tipo.id) : null,
      tarifa: p.imp ? tarifaDeImpuesto(p.imp) : null,
      contabilizacion: p.co ? { id: num(p.co.id), codigo: txt(p.co.codigo), nombre: txt(p.co.nombre) } : null,
      inventarios: 0,
    };
    const k = JSON.stringify([fila.grupo?.id, fila.clasificacion?.id, fila.tipoImpuestoId, fila.tarifa, fila.contabilizacion?.id]);
    const e = m.get(k) ?? fila;
    e.inventarios++;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.inventarios - a.inventarios);
}

export function compactarInventarios(inventarios: InventarioErp[]): InventarioCompacto[] {
  return inventarios.map((inv) => {
    const p = partes(inv);
    return {
      id: inv.id,
      codigo: inv.codigo,
      descripcion: txt(inv.datos.descripcion),
      activo: typeof inv.datos.senActivo === 'boolean' ? inv.datos.senActivo : null,
      unidad: p.un ? txt(p.un.codigo) : null,
      clasificacion: p.cl ? txt(p.cl.nombre) : null,
      grupo: p.g ? txt(p.g.nombreGrupo) : null,
      tipoImpuesto: p.tipo ? txt(p.tipo.nombre) : null,
      tarifa: p.imp ? tarifaDeImpuesto(p.imp) : null,
      contabilizacion: p.co ? txt(p.co.codigo) : null,
      centroCosto: p.cc ? txt(p.cc.nombre) : null,
    };
  });
}

/** CSV con comillas (RFC 4180) y BOM para que Excel respete las tildes. */
export function aCsv(filas: InventarioCompacto[]): string {
  const cols: (keyof InventarioCompacto)[] = ['id', 'codigo', 'descripcion', 'activo', 'unidad', 'clasificacion', 'grupo', 'tipoImpuesto', 'tarifa', 'contabilizacion', 'centroCosto'];
  const celda = (v: unknown) => `"${(v === null || v === undefined ? '' : String(v)).replace(/"/g, '""')}"`;
  return '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => celda(f[c])).join(','))].join('\r\n') + '\r\n';
}
