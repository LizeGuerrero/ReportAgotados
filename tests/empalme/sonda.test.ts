import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClienteWorldOffice, type FetchLike } from '../../core/integraciones/worldoffice';
import { ejecutarSonda, LECTURAS, formaDe, describirForma } from '../../core/integraciones/worldoffice/sonda';

const TOKEN = 'eyJ.secreto-largo-de-prueba.token';

function servidor() {
  const llamadas: { url: string; method: string; body?: string }[] = [];
  const unidades = [{ id: 1, nombre: 'UN' }, { id: 2, nombre: 'KG' }, { id: 3, nombre: 'MT' }];
  const inv = [
    { id: 10, codigo: 'A-1', descripcion: 'x', impuestos: [{ impuesto: { tarifa: 19 }, inventarioTipoImpuestoVenta: { id: 7 } }] },
    { id: 11, codigo: 'a-1', descripcion: 'y', impuestos: [] },
    { id: 12, codigo: 'BAD CODE', descripcion: 'z', impuestos: [] },
  ];
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, method: init.method, body: init.body });
    const ok = (data: unknown) => ({ status: 200, text: async () => JSON.stringify(data) });
    if (init.method === 'GET') return { status: 404, text: async () => JSON.stringify({ status: 404, userMessage: 'no existe' }) };
    const b = JSON.parse(init.body ?? '{}');
    if (typeof b.canal === 'string') return { status: 400, text: async () => JSON.stringify({ userMessage: 'canal inválido' }) };
    const fuente = url.includes('inventario') && !url.includes('unidad') ? inv : unidades;
    const tam = b.registrosPorPagina ?? 20;
    const ini = b.registroInicial !== undefined ? b.registroInicial : (b.pagina ?? 0) * tam;
    const content = fuente.slice(ini, ini + tam);
    return ok({ status: 'OK', data: { content, last: ini + tam >= fuente.length, totalElements: fuente.length } });
  };
  return { fetch, llamadas };
}

test('la sonda solo lee, elige el canal que funciona y no filtra el token', async () => {
  const s = servidor();
  const informe = await ejecutarSonda({
    crearCliente: (canal) => new ClienteWorldOffice({ token: TOKEN, canal, fetch: s.fetch, esperar: async () => {} }),
  });
  assert.equal(informe.canal.elegido, 0);
  assert.equal(informe.soloLectura, true);
  assert.ok(!JSON.stringify(informe).includes(TOKEN));
  assert.ok(s.llamadas.length > 0);
  assert.ok(s.llamadas.every((l) => l.method === 'GET' || l.method === 'POST'));
  assert.ok(s.llamadas.every((l) => !/crear|editar|eliminar|delete/i.test(l.url)));
  assert.equal(informe.codigos?.duplicadosPorMayusculas.grupos, 1);
  assert.equal(informe.codigos?.noCumplenReglaLocal.total, 1);
  assert.equal(informe.impuestos?.escalaTarifa, 'porcentaje');
});

test('si ningún canal funciona la sonda se detiene sin seguir', async () => {
  const informe = await ejecutarSonda({
    crearCliente: (canal) =>
      new ClienteWorldOffice({ token: TOKEN, canal, esperar: async () => {}, fetch: async () => ({ status: 401, text: async () => '{"message":"no"}' }) }),
  });
  assert.equal(informe.canal.elegido, null);
  assert.deepEqual(informe.catalogos, {});
});

test('LECTURAS no incluye escrituras y formaDe/describirForma no exponen datos', () => {
  assert.ok(LECTURAS.every((o) => !/crear|editar|eliminar/i.test(o)));
  assert.deepEqual(formaDe({ a: 'secreto', b: [1] }), { a: 'string', b: ['arreglo', 'number'] });
  assert.equal(describirForma({ data: { content: [] } }), 'data.content: arreglo');
  assert.equal(describirForma({ content: [] }), 'content: arreglo');
});

import { normalizarInventario } from '../../core/integraciones/worldoffice';
import { observarPractica, compactarInventarios, aCsv } from '../../core/integraciones/worldoffice/practica';

test('práctica observada y exportación CSV: agrupa por combinación y escapa comillas', () => {
  const mk = (id: number, cont: number) =>
    normalizarInventario({
      id, codigo: `C${id}`, descripcion: 'Tubo "3/4"', senActivo: true,
      unidadMedida: { id: 31, codigo: 'und' }, inventarioClasificacion: { id: 1, nombre: 'Producto' },
      contabilizacion: { id: cont, codigo: `14${cont}`, nombre: 'x' }, grupo: [{ id: 11, codigo: '0101', nombreGrupo: 'LATON' }],
      impuestos: [{ valor: '0.19', inventarioTipoImpuestoVenta: { id: 1, nombre: 'Gravado' } }],
    })!;
  const invs = [mk(1, 1), mk(2, 1), mk(3, 2)];
  const p = observarPractica(invs);
  assert.equal(p.length, 2);
  assert.equal(p[0].inventarios, 2);
  assert.equal(p[0].tarifa, 0.19);
  const csv = aCsv(compactarInventarios(invs));
  assert.ok(csv.includes('"Tubo ""3/4"""'));
  assert.ok(csv.startsWith('﻿"id"') === false && csv.startsWith('﻿id,'));
});
