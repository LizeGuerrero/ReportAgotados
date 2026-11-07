import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ClienteWorldOffice,
  OPERACIONES,
  WorldOfficeError,
  normalizarToken,
  descargarCatalogo,
  descargarTodo,
  extraerPagina,
  listarInventarios,
  consultarPorCodigo,
  crearInventario,
  editarInventario,
  normalizarInventario,
  tarifaDeImpuesto,
  combinarParaEdicion,
  cuerpoEscrituraDesde,
  observarTarifasPorTipoImpuesto,
  candidatosParaTarifaLocal,
  type FetchLike,
} from '../../core/integraciones/worldoffice';

type Llamada = { url: string; method: string; headers: Record<string, string>; body?: string };

/** fetch simulado: una cola de respuestas; registra cada llamada. */
function simulado(respuestas: Array<{ status: number; cuerpo?: unknown } | Error>) {
  const llamadas: Llamada[] = [];
  const fetch: FetchLike = async (url, init) => {
    llamadas.push({ url, method: init.method, headers: init.headers, body: init.body });
    const r = respuestas.shift();
    if (!r) throw new Error('sin respuesta simulada');
    if (r instanceof Error) throw r;
    const texto = r.cuerpo === undefined ? '' : typeof r.cuerpo === 'string' ? r.cuerpo : JSON.stringify(r.cuerpo);
    return { status: r.status, text: async () => texto };
  };
  return { fetch, llamadas };
}
const cliente = (f: FetchLike, extra: Record<string, unknown> = {}) =>
  new ClienteWorldOffice({ token: 'WO eyJ.secreto.token', fetch: f, esperar: async () => {}, ...extra });

const pagina = (content: unknown[], p: Partial<{ last: boolean; totalPages: number; totalElements: number }> = {}) => ({
  status: 200,
  cuerpo: { status: 'OK', data: { content, last: false, ...p } },
});

// ------------------------------------------------------------ cliente, token y seguridad
test('el token se normaliza y se envía como "Authorization: WO <token>"', async () => {
  assert.equal(normalizarToken('WO abc'), 'abc');
  assert.equal(normalizarToken('  wo   abc '), 'abc');
  const s = simulado([{ status: 200, cuerpo: {} }]);
  await cliente(s.fetch).ejecutar('inventarios.consultarCodigo', { parametros: { codigo: 'A/1 2' } });
  assert.equal(s.llamadas[0].headers.Authorization, 'WO eyJ.secreto.token');
  assert.equal(s.llamadas[0].headers['Content-Type'], 'application/json');
  assert.equal(s.llamadas[0].method, 'GET');
  assert.equal(s.llamadas[0].url, 'https://api.worldoffice.cloud/api/v1/inventarios/consultaCodigo/A%2F1%202');
});

test('el token nunca aparece al serializar el cliente ni en los mensajes de error', async () => {
  const c = cliente(simulado([{ status: 401, cuerpo: { status: 401, error: 'Unauthorized', message: 'No tiene permisos para acceder' } }]).fetch);
  assert.ok(!JSON.stringify(c).includes('secreto'));
  assert.ok(!Object.keys(c).some((k) => String(Object.getOwnPropertyDescriptor(c, k)?.value ?? '').includes('secreto')));
  await assert.rejects(c.ejecutar('inventarios.listar', { cuerpo: {} }), (e: unknown) => {
    assert.ok(e instanceof WorldOfficeError);
    assert.equal(e.status, 401);
    assert.ok(!e.message.includes('secreto') && !JSON.stringify(e).includes('secreto'));
    assert.match(e.message, /token/i);
    return true;
  });
  assert.throws(() => new ClienteWorldOffice({ token: '  WO  ' }), /Falta el token/);
});

test('lista cerrada de operaciones: los catálogos son solo de lectura y no hay forma de crear catálogos ni eliminar', () => {
  const ids = Object.keys(OPERACIONES);
  for (const id of ids.filter((i) => i.startsWith('catalogo.'))) {
    const op = OPERACIONES[id as keyof typeof OPERACIONES];
    assert.equal(op.lectura, true, id);
    assert.ok(/listar|clasificaciones|grupos|impuestosDeVentas|contabilizaciones/.test(op.ruta), id);
  }
  assert.ok(!ids.some((i) => /crear|eliminar|borrar/i.test(i) && !i.startsWith('inventarios.crear')));
  assert.ok(!Object.values(OPERACIONES).some((o) => (o.metodo as string) === 'DELETE'));
  assert.deepEqual(ids.filter((i) => !OPERACIONES[i as keyof typeof OPERACIONES].lectura).sort(), ['inventarios.crear', 'inventarios.editar']);
});

test('lecturas se reintentan ante 503 y red; las escrituras NUNCA', async () => {
  const lectura = simulado([{ status: 503, cuerpo: { userMessage: 'caído' } }, new Error('ECONNRESET'), { status: 200, cuerpo: { data: {} } }]);
  const r = await cliente(lectura.fetch).ejecutar('catalogo.unidades', { cuerpo: {} });
  assert.equal(r.status, 200);
  assert.equal(lectura.llamadas.length, 3);

  const escritura = simulado([{ status: 503, cuerpo: { userMessage: 'caído' } }, { status: 201, cuerpo: {} }]);
  await assert.rejects(cliente(escritura.fetch).ejecutar('inventarios.crear', { cuerpo: { codigo: 'X' } }));
  assert.equal(escritura.llamadas.length, 1, 'un POST de creación no puede repetirse');

  const tiempo = simulado([new Error('abort')]);
  await assert.rejects(cliente(tiempo.fetch).ejecutar('inventarios.editar', { parametros: { id: 1 }, cuerpo: {} }), (e: unknown) => e instanceof WorldOfficeError && e.formato === 'red');
  assert.equal(tiempo.llamadas.length, 1);
});

test('un 4xx no se reintenta', async () => {
  const s = simulado([{ status: 400, cuerpo: { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'campo inválido' } }]);
  await assert.rejects(cliente(s.fetch).ejecutar('catalogo.unidades', { cuerpo: {} }));
  assert.equal(s.llamadas.length, 1);
});

test('se entienden los DOS formatos de error (ApiResponse y ProblemDetail) y los códigos de negocio', async () => {
  const api = simulado([{ status: 400, cuerpo: { status: 'BAD_REQUEST', userMessage: 'x', errorCode: 'ERROR_UNIDAD_INVENTARIO', moreInfo: 'unidad 99' } }]);
  await assert.rejects(cliente(api.fetch).ejecutar('inventarios.crear', { cuerpo: {} }), (e: unknown) => {
    const err = e as WorldOfficeError;
    assert.equal(err.formato, 'ApiResponse');
    assert.equal(err.codigo, 'ERROR_UNIDAD_INVENTARIO');
    assert.match(err.message, /unidad de medida/);
    assert.equal(err.detalle, 'unidad 99');
    return true;
  });
  const pd = simulado([{ status: 409, cuerpo: { type: 't', title: 'Conflict', status: 409, detail: 'ya existe' } }]);
  await assert.rejects(cliente(pd.fetch).ejecutar('inventarios.crear', { cuerpo: {} }), (e: unknown) => {
    const err = e as WorldOfficeError;
    assert.equal(err.formato, 'ProblemDetail');
    assert.equal(err.detalle, 'ya existe');
    return true;
  });
  const txt = simulado([{ status: 502, cuerpo: '<html>Bad gateway</html>' }, { status: 502, cuerpo: '<html>Bad gateway</html>' }, { status: 502, cuerpo: '<html>Bad gateway</html>' }]);
  await assert.rejects(cliente(txt.fetch).ejecutar('catalogo.unidades', { cuerpo: {} }), (e: unknown) => (e as WorldOfficeError).reintentable === true);
});

// ------------------------------------------------------------ paginación
test('extraerPagina acepta ApiResponse+Page y Page sin envoltorio; rechaza lo inesperado', () => {
  assert.equal(extraerPagina({ data: { content: [1, 2], last: true } }, 'x').content.length, 2);
  assert.equal(extraerPagina({ content: [1], totalPages: 3 }, 'x').totalPages, 3);
  assert.throws(() => extraerPagina({ data: { algo: 1 } }, 'x'), /content/);
  assert.throws(() => extraerPagina(null, 'x'));
});

test('descargarTodo recorre páginas hasta last=true y envía el cuerpo estándar de paginación', async () => {
  const s = simulado([pagina([{ id: 1 }, { id: 2 }], { totalElements: 5 }), pagina([{ id: 3 }, { id: 4 }]), pagina([{ id: 5 }], { last: true })]);
  const avances: number[] = [];
  const r = await descargarTodo(cliente(s.fetch), 'inventarios.listar', { registrosPorPagina: 2, alAvanzar: (p) => avances.push(p.acumulados) });
  assert.equal(r.registros.length, 5);
  assert.equal(r.paginas, 3);
  assert.deepEqual(avances, [2, 4, 5]);
  const cuerpos = s.llamadas.map((l) => JSON.parse(l.body as string));
  // Por omisión avanza con `registroInicial` (confirmado con la sonda real); `pagina` queda en 0.
  assert.deepEqual(cuerpos.map((c) => c.registroInicial), [0, 2, 4]);
  assert.deepEqual(cuerpos[0], { columnaOrdenar: 'id', pagina: 0, registrosPorPagina: 2, orden: 'ASC', filtros: [], canal: 0, registroInicial: 0 });
});

test('paginación por registroInicial y canal configurable (para fijarlos con la sonda)', async () => {
  const s = simulado([pagina([{ id: 1 }, { id: 2 }]), pagina([{ id: 3 }], { last: true })]);
  await descargarTodo(cliente(s.fetch, { canal: 'WEB' }), 'catalogo.unidades', { registrosPorPagina: 2, modo: 'registroInicial' });
  const c = s.llamadas.map((l) => JSON.parse(l.body as string));
  assert.deepEqual(c.map((x) => [x.pagina, x.registroInicial, x.canal]), [[0, 0, 'WEB'], [0, 2, 'WEB']]);
});

test('descargarTodo se detiene por totalPages, por página vacía y detecta un ERP que no avanza', async () => {
  const porTotal = simulado([pagina([{ id: 1 }], { totalPages: 2 }), pagina([{ id: 2 }], { totalPages: 2 })]);
  assert.equal((await descargarTodo(cliente(porTotal.fetch), 'catalogo.unidades')).registros.length, 2);

  const vacia = simulado([pagina([{ id: 1 }]), pagina([])]);
  assert.equal((await descargarTodo(cliente(vacia.fetch), 'catalogo.unidades')).registros.length, 1);

  const atascado = simulado([pagina([{ id: 1 }]), pagina([{ id: 1 }])]);
  await assert.rejects(descargarTodo(cliente(atascado.fetch), 'catalogo.unidades'), /idéntica/);

  const infinito = simulado(Array.from({ length: 5 }, (_, i) => pagina([{ id: i }])));
  await assert.rejects(descargarTodo(cliente(infinito.fetch), 'catalogo.unidades', { maxPaginas: 3 }), /tope/);
});

// ------------------------------------------------------------ catálogos
test('descargarCatalogo normaliza cada catálogo y descarta registros sin id', async () => {
  const s = simulado([
    pagina([{ id: 1, nombre: 'Centro A', codigo: 'CA', folder: true, senActivo: true, borrador: false }, { id: 2, nombre: 'B', codigo: 'CB', folder: false, senActivo: false }, { nombre: 'sin id' }, { id: 2, nombre: 'B', codigo: 'CB' }], { last: true }),
  ]);
  const r = await descargarCatalogo(cliente(s.fetch), 'centro_costo');
  assert.equal(r.entradas.length, 2);
  assert.equal(r.descartados, 1);
  // El último registro con id 2 (sin senActivo ni folder) reemplaza al anterior: sin duplicados por id
  assert.deepEqual(r.entradas.map((e) => [e.idErp, e.codigo, e.activo, e.esCarpeta]), [[1, 'CA', true, true], [2, 'CB', null, undefined]]);
  assert.equal(s.llamadas[0].url.endsWith('/api/v1/centrosDeCosto/listarCentroCosto'), true);
});

test('el catálogo de grupos usa nombreGrupo; todos los catálogos se consultan con POST de solo lectura', async () => {
  const s = simulado([pagina([{ id: 5, codigo: 'G1', nombreGrupo: 'Tubería', senActivo: true, folder: false, borrador: false }], { last: true })]);
  const r = await descargarCatalogo(cliente(s.fetch), 'grupo');
  assert.equal(r.entradas[0].nombre, 'Tubería');
  assert.equal(s.llamadas[0].method, 'POST');
});

// ------------------------------------------------------------ inventarios
const inv = (over: Record<string, unknown> = {}) => ({
  id: 10,
  codigo: 'T-004',
  descripcion: 'Tubo',
  unidadMedida: { id: 7, nombre: 'Unidad' },
  senActivo: true,
  inventarioClasificacion: { id: 11 },
  centroCosto: { id: 22 },
  grupo: { id: 33 },
  contabilizacion: { id: 44 },
  impuestos: [{ valor: 19, impuesto: { id: 1, tarifa: 19, tipo: 'IVA' }, inventarioTipoImpuestoVenta: { id: 3, nombre: 'IVA 19' } }],
  ...over,
});

test('normalizarInventario deriva el tipo de impuesto único y detecta ambigüedad', () => {
  assert.equal(normalizarInventario(inv())?.datos.tipoImpuestoVentaId, 3);
  const varios = normalizarInventario(inv({ impuestos: [{ impuesto: { tarifa: 19 }, inventarioTipoImpuestoVenta: { id: 3 } }, { impuesto: { tarifa: 8 }, inventarioTipoImpuestoVenta: { id: 4 } }] }));
  assert.equal(varios?.datos.tipoImpuestoVentaId, null);
  assert.equal(varios?.datos.impuestosAmbiguos, true);
  assert.equal(normalizarInventario(inv({ impuestos: [] }))?.datos.tipoImpuestoVentaId, null);
  assert.equal(normalizarInventario({ codigo: 'sin id' }), null);
});

test('consultarPorCodigo: devuelve el inventario (data objeto, data arreglo o content arreglo) y null solo en 404', async () => {
  for (const cuerpo of [{ data: inv() }, { data: [inv()] }, { content: [inv()] }, { data: { content: [inv()] } }]) {
    const s = simulado([{ status: 202, cuerpo }]);
    assert.equal((await consultarPorCodigo(cliente(s.fetch), 'T-004'))?.id, 10);
  }
  assert.equal(await consultarPorCodigo(cliente(simulado([{ status: 404, cuerpo: { userMessage: 'no existe' } }]).fetch), 'NO'), null);
  await assert.rejects(consultarPorCodigo(cliente(simulado([{ status: 403, cuerpo: { userMessage: 'sin permiso' } }]).fetch), 'T'), (e: unknown) => (e as WorldOfficeError).status === 403);
});

test('listarInventarios descarga todo y normaliza', async () => {
  const s = simulado([pagina([inv(), inv({ id: 11, codigo: 'T-005' })], { last: true })]);
  const r = await listarInventarios(cliente(s.fetch));
  assert.deepEqual(r.inventarios.map((i) => i.codigo), ['T-004', 'T-005']);
});

test('crearInventario: no admite id, una sola llamada, y si no se puede leer la respuesta avisa que verifique (no que falló)', async () => {
  await assert.rejects(crearInventario(cliente(simulado([]).fetch), { id: 5, codigo: 'X' }), /no se envía id/);
  const ok = simulado([{ status: 201, cuerpo: { data: inv() } }]);
  const r = await crearInventario(cliente(ok.fetch), { codigo: 'T-004' });
  assert.equal(r.inventario?.id, 10);
  assert.equal(ok.llamadas[0].method, 'POST');
  assert.equal(ok.llamadas[0].url.endsWith('/api/v1/inventarios/crearInventario'), true);

  const raro = simulado([{ status: 201, cuerpo: { algo: 'distinto' } }]);
  const r2 = await crearInventario(cliente(raro.fetch), { codigo: 'T-004' });
  assert.equal(r2.status, 201);
  assert.equal(r2.inventario, null); // la escritura ocurrió: el llamador debe verificar con consultarPorCodigo
});

test('editar: parte del inventario actual y envía el objeto COMPLETO; rechaza claves ajenas y cambio de id', async () => {
  const actual = normalizarInventario(inv())!;
  assert.deepEqual(cuerpoEscrituraDesde(actual), {
    id: 10, codigo: 'T-004', descripcion: 'Tubo', idUnidadMedida: 7, senActivo: true,
    idInventarioClasificacion: 11, idCentroCosto: 22, idInventarioGrupo: 33, idInventarioTipoImpuestoVenta: 3, idContabilizacion: 44,
  });
  const cuerpo = combinarParaEdicion(actual, { descripcion: 'Tubo nuevo' });
  assert.equal(cuerpo.descripcion, 'Tubo nuevo');
  assert.equal(cuerpo.idCentroCosto, 22); // lo que no se cambia se conserva
  assert.throws(() => combinarParaEdicion(actual, { linea: 'x' }), /no permitido/);
  assert.throws(() => combinarParaEdicion(actual, { id: 99 }), /No se puede cambiar el id/);

  const s = simulado([{ status: 201, cuerpo: { data: inv({ descripcion: 'Tubo nuevo' }) } }]);
  const r = await editarInventario(cliente(s.fetch), 10, cuerpo);
  assert.equal(s.llamadas[0].method, 'PUT');
  assert.equal(s.llamadas[0].url.endsWith('/api/v1/inventarios/editarInventario/10'), true);
  assert.equal(r.inventario?.datos.descripcion, 'Tubo nuevo');
});

// ------------------------------------------------------------ impuestos (evidencia para la equivalencia del IVA)
test('observarTarifasPorTipoImpuesto: muestra qué tarifas usa cada tipo y marca lo ambiguo', () => {
  const mk = (id: number, tipo: number, nombre: string, tarifa: number | null) =>
    normalizarInventario({ id, codigo: `C${id}`, impuestos: [{ impuesto: tarifa === null ? {} : { tarifa }, inventarioTipoImpuestoVenta: { id: tipo, nombre } }] })!;
  const obs = observarTarifasPorTipoImpuesto([
    mk(1, 3, 'IVA 19', 19), mk(2, 3, 'IVA 19', 19), mk(3, 3, 'IVA 19', 19),
    mk(4, 1, 'Exento', 0), mk(5, 2, 'Excluido', 0),
    mk(6, 9, 'Mixto', 19), mk(7, 9, 'Mixto', 5),
    mk(8, 8, 'Sin dato', null),
  ]);
  const por = Object.fromEntries(obs.map((o) => [o.tipoId, o.veredicto]));
  assert.deepEqual(por, { '3': 'UNICA_TARIFA', '1': 'UNICA_TARIFA', '2': 'UNICA_TARIFA', '9': 'VARIAS_TARIFAS', '8': 'SIN_TARIFA_OBSERVADA' });
  assert.equal(obs.find((o) => o.tipoId === '3')?.inventarios, 3);
  // 0 % tiene DOS candidatos (exento y excluido): no se resuelve solo, lo decide un administrador
  assert.deepEqual(candidatosParaTarifaLocal(0, obs, 'porcentaje').map((o) => o.tipoId).sort(), ['1', '2']);
  assert.deepEqual(candidatosParaTarifaLocal(0.19, obs, 'porcentaje').map((o) => o.tipoId).sort(), ['3', '9']);
  assert.deepEqual(candidatosParaTarifaLocal(0.19, obs, 'fraccion'), []); // escala equivocada: no encuentra
});

// ------------------------------------------------------------ guardas de arquitectura
function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

test('el motor genérico no conoce World Office, ITEMS, React, Supabase ni la red', () => {
  const raiz = join(process.cwd(), 'core/integraciones/empalme');
  for (const f of archivos(raiz)) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/worldoffice|world office|supabase|from 'react'|use client|fetch\(/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), f);
    assert.ok(!/\b(items|inventario)\b/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${f} menciona un módulo concreto`);
  }
});

test('el conector es solo de servidor: sin "use client", sin React y sin importar el cliente de Supabase', () => {
  const raiz = join(process.cwd(), 'core/integraciones/worldoffice');
  for (const f of archivos(raiz)) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/['"]use client['"]/.test(src), f);
    assert.ok(!/from 'react'|@\/core\/supabase/.test(src), f);
  }
});

test('la tarifa se lee de `valor` (texto, fracción) como en el World Office real; 0 es una tarifa, no ausencia', () => {
  const mk = (id: number, tipo: number, nombre: string, valor: string) =>
    normalizarInventario({ id, codigo: `C${id}`, impuestos: [{ valor, impuesto: { id: 1, tipo: 'IVA', tarifa: null }, inventarioTipoImpuestoVenta: { id: tipo, nombre } }] })!;
  const obs = observarTarifasPorTipoImpuesto([mk(1, 1, 'Gravado', '0.19'), mk(2, 1, 'Gravado', '0.19'), mk(3, 1, 'Gravado', '0.05'), mk(4, 3, 'Excluido', '0')]);
  const g = obs.find((o) => o.tipoId === '1')!;
  assert.deepEqual(g.tarifas, [{ tarifa: 0.19, inventarios: 2 }, { tarifa: 0.05, inventarios: 1 }]);
  assert.equal(g.veredicto, 'VARIAS_TARIFAS');
  const e = obs.find((o) => o.tipoId === '3')!;
  assert.deepEqual(e.tarifas, [{ tarifa: 0, inventarios: 1 }]);
  assert.equal(e.veredicto, 'UNICA_TARIFA');
  assert.equal(tarifaDeImpuesto({ valor: 'abc', impuesto: { tarifa: 8 } }), 8);
  assert.equal(tarifaDeImpuesto({ valor: '' }), null);
});
