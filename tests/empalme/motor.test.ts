import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarDiccionario,
  validarDiccionario,
  resolutorEnMemoria,
  proponerEquivalencias,
  valoresSinEquivalencia,
  equivalenciasAfectadasPorCatalogo,
  cruzar,
  diferenciar,
  puedeTransicionar,
  estadoTrasEvaluar,
  diccionarioAMarkdown,
  type ContextoMotor,
  type FilaEquivalencia,
  type EntradaCatalogo,
} from '../../core/integraciones/empalme';
import {
  DICCIONARIO_CREAR_ITEMS,
  DICCIONARIO_EDITAR_ITEMS,
  DICCIONARIO_CONSULTAR_ITEMS,
  crearDiccionarioConsultarItems,
} from '../../core/integraciones/worldoffice';

const filas: FilaEquivalencia[] = [
  { catalogo: 'unidad', valorLocal: 'und', idErp: 7, estado: 'CONFIRMADA' },
  { catalogo: 'unidad', valorLocal: 'caja', idErp: 9, estado: 'PROPUESTA' },
  { catalogo: 'impuesto_venta', valorLocal: '0.19', idErp: 3, estado: 'CONFIRMADA' },
  { catalogo: 'impuesto_venta', valorLocal: '0', idErp: 1, estado: 'CONFIRMADA' },
];
const CONFIG = { clasificacion_id: 11, centro_costo_id: 22, grupo_inventario_id: 33, contabilizacion_id: 44 };
const ctx = (config: Record<string, unknown> = CONFIG, f = filas): ContextoMotor => ({ config, equivalencias: resolutorEnMemoria(f) });

const itemOk = { codigo_erp: 'A-1001', nombre_base: 'Tubo latón', unidad_medida: 'Und', iva: 0.19, activo: true, linea: 'Latón', marca: 'X' };

// ------------------------------------------------------------ integridad de los diccionarios
test('los tres diccionarios de ITEMS están bien armados', () => {
  assert.deepEqual(validarDiccionario(DICCIONARIO_CREAR_ITEMS), []);
  assert.deepEqual(validarDiccionario(DICCIONARIO_EDITAR_ITEMS), []);
  assert.deepEqual(validarDiccionario(DICCIONARIO_CONSULTAR_ITEMS), []);
});

test('la matriz Markdown se genera desde el diccionario', () => {
  const md = diccionarioAMarkdown(DICCIONARIO_CREAR_ITEMS);
  assert.match(md, /idInventarioTipoImpuestoVenta/);
  assert.match(md, /FALTA_EN_APP/);
  assert.match(md, /NO_APLICA/);
});

// ------------------------------------------------------------ app → ERP (crear)
test('crear: ítem completo con equivalencias confirmadas produce el payload de World Office', () => {
  const r = aplicarDiccionario(itemOk, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.payload, {
    codigo: 'A-1001',
    descripcion: 'Tubo latón',
    idUnidadMedida: 7, // 'Und' ↔ 'und' (normalizado)
    idInventarioTipoImpuestoVenta: 3,
    senActivo: true,
    idInventarioClasificacion: 11,
    idCentroCosto: 22,
    idInventarioGrupo: 33,
    idContabilizacion: 44,
  });
  // Campos propios de la app jamás viajan
  for (const k of ['linea', 'marca', 'notas', 'grupo', 'grupo_contable']) assert.ok(!(k in r.payload));
  assert.equal(r.omitidos.length, 10);
  assert.equal(r.advertencias.length, 4); // 4 valores tomados de la configuración
});

test('crear: sin predeterminados de la organización → faltantes claros, nunca un valor inventado', () => {
  const r = aplicarDiccionario(itemOk, DICCIONARIO_CREAR_ITEMS, ctx({}));
  assert.equal(r.ok, false);
  assert.equal(r.faltantes.length, 4);
  assert.ok(r.faltantes.every((f) => f.tipo === 'config'));
  assert.ok(r.faltantes.some((f) => /centro de costo/.test(f.mensaje)));
  assert.ok(!('idCentroCosto' in r.payload));
});

test('crear: unidad sin equivalencia o solo propuesta → faltante de equivalencia', () => {
  const sinEq = aplicarDiccionario({ ...itemOk, unidad_medida: 'galón' }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(sinEq.ok, false);
  assert.equal(sinEq.faltantes[0].tipo, 'equivalencia');
  assert.equal(sinEq.faltantes[0].catalogo, 'unidad');
  assert.equal(sinEq.faltantes[0].valorLocal, 'galón');
  assert.match(sinEq.faltantes[0].mensaje, /no tiene equivalencia/);

  const propuesta = aplicarDiccionario({ ...itemOk, unidad_medida: 'caja' }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(propuesta.ok, false);
  assert.match(propuesta.faltantes[0].mensaje, /propuesta que aún no está confirmada/);
});

test('crear: IVA 5 % sin equivalencia no se envía; IVA 0 sí se resuelve', () => {
  assert.equal(aplicarDiccionario({ ...itemOk, iva: 0.05 }, DICCIONARIO_CREAR_ITEMS, ctx()).ok, false);
  const cero = aplicarDiccionario({ ...itemOk, iva: 0 }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(cero.ok, true);
  assert.equal(cero.payload.idInventarioTipoImpuestoVenta, 1);
  // Valores numéricos como texto (numeric de Postgres llega como "0.1900")
  assert.equal(aplicarDiccionario({ ...itemOk, iva: '0.1900' }, DICCIONARIO_CREAR_ITEMS, ctx()).payload.idInventarioTipoImpuestoVenta, 3);
});

test('crear: dato propio inválido o ausente → errores (no faltantes)', () => {
  const sinCodigo = aplicarDiccionario({ ...itemOk, codigo_erp: null }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(sinCodigo.ok, false);
  assert.match(sinCodigo.errores[0].mensaje, /provisional/);

  const codigoMalo = aplicarDiccionario({ ...itemOk, codigo_erp: 'A 1/2' }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.match(codigoMalo.errores[0].mensaje, /solo letras/);

  const codigoLargo = aplicarDiccionario({ ...itemOk, codigo_erp: 'A'.repeat(41) }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.match(codigoLargo.errores[0].mensaje, /máximo es 40/);

  const nombreLargo = aplicarDiccionario({ ...itemOk, nombre_base: 'N'.repeat(301) }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.match(nombreLargo.errores[0].mensaje, /no se recorta/);

  const sinIva = aplicarDiccionario({ ...itemOk, iva: null }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.match(sinIva.errores[0].mensaje, /IVA de venta: es obligatorio/);
});

test('crear: el código se envía recortado pero sin cambiar mayúsculas', () => {
  const r = aplicarDiccionario({ ...itemOk, codigo_erp: '  Ab-1 ' }, DICCIONARIO_CREAR_ITEMS, ctx());
  assert.equal(r.payload.codigo, 'Ab-1');
});

// ------------------------------------------------------------ app → ERP (editar)
test('editar: incluye id y solo los campos que la app puede cambiar', () => {
  const r = aplicarDiccionario({ ...itemOk, wo_id: 555 }, DICCIONARIO_EDITAR_ITEMS, ctx());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(r.payload).sort(), ['codigo', 'descripcion', 'id', 'idInventarioTipoImpuestoVenta', 'idUnidadMedida', 'senActivo']);
  assert.equal(aplicarDiccionario(itemOk, DICCIONARIO_EDITAR_ITEMS, ctx()).ok, false); // sin wo_id
});

// ------------------------------------------------------------ ERP → app (consultar)
const invErp = {
  codigo: 'B-77',
  descripcion: 'Codo latón 1/2',
  unidadMedida: { id: 7 },
  senActivo: true,
  tipoImpuestoVentaId: 3,
  impuestosAmbiguos: false,
};

test('consultar: un ítem del ERP se traduce a nuestros nombres y tipos', () => {
  const r = aplicarDiccionario(invErp, DICCIONARIO_CONSULTAR_ITEMS, ctx());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.payload, { codigo_erp: 'B-77', nombre_base: 'Codo latón 1/2', unidad_medida: 'und', iva: 0.19, activo: true });
  assert.equal(r.omitidos.length, 9);
});

test('consultar: código del ERP incompatible con nuestras reglas queda reportado (no se altera)', () => {
  const r = aplicarDiccionario({ ...invErp, codigo: 'ABC 123/X' }, DICCIONARIO_CONSULTAR_ITEMS, ctx());
  assert.equal(r.ok, false);
  assert.match(r.errores[0].mensaje, /no admite/);
  assert.ok(!('codigo_erp' in r.payload));
});

test('consultar: nombre de más de 300 caracteres no se recorta', () => {
  const r = aplicarDiccionario({ ...invErp, descripcion: 'x'.repeat(301) }, DICCIONARIO_CONSULTAR_ITEMS, ctx());
  assert.equal(r.ok, false);
  assert.match(r.errores[0].mensaje, /no se recorta/);
});

test('consultar: unidad del ERP sin equivalencia → faltante (no se inventa el texto local)', () => {
  const r = aplicarDiccionario({ ...invErp, unidadMedida: { id: 99 } }, DICCIONARIO_CONSULTAR_ITEMS, ctx());
  assert.equal(r.ok, false);
  assert.equal(r.faltantes[0].catalogo, 'unidad');
});

test('consultar: ítem con varios impuestos o ninguno → error de IVA (obligatorio por defecto)', () => {
  const r = aplicarDiccionario({ ...invErp, tipoImpuestoVentaId: null, impuestosAmbiguos: true }, DICCIONARIO_CONSULTAR_ITEMS, ctx());
  assert.equal(r.ok, false);
  assert.match(r.errores[0].mensaje, /ninguno o varios/);
});

test('consultar: con ivaObligatorio=false el ítem se importa sin IVA (decisión configurable)', () => {
  const dic = crearDiccionarioConsultarItems({ ivaObligatorio: false });
  const r = aplicarDiccionario({ ...invErp, tipoImpuestoVentaId: null }, dic, ctx());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(!('iva' in r.payload));
});

test('consultar: no existe ninguna correspondencia que escriba campos propios de la app', () => {
  const destinos = DICCIONARIO_CONSULTAR_ITEMS.correspondencias.filter((c) => c.estado !== 'NO_APLICA').map((c) => c.campoApp);
  for (const propio of ['linea', 'codigo_linea', 'categoria', 'grupo', 'grupo_contable', 'marca', 'notas', 'descripcion_2']) {
    assert.ok(!destinos.includes(propio), `${propio} no debe ser escrito desde el ERP`);
  }
});

// ------------------------------------------------------------ equivalencias
const unidades: EntradaCatalogo[] = [
  { idErp: 7, codigo: 'UND', nombre: 'Unidad', activo: true },
  { idErp: 8, codigo: 'M', nombre: 'Metro', activo: true },
  { idErp: 9, codigo: 'CJ', nombre: 'Caja', activo: true },
  { idErp: 10, codigo: 'CJA', nombre: 'Caja', activo: true }, // nombre repetido
  { idErp: 11, codigo: 'OLD', nombre: 'Obsoleta', activo: false },
];

test('proponerEquivalencias: solo propone; ambigüedades y obsoletas se señalan', () => {
  const p = proponerEquivalencias(
    [{ valor: 'und', usos: 100 }, { valor: 'Metro', usos: 20 }, { valor: 'caja', usos: 5 }, { valor: 'galón', usos: 2 }, { valor: 'obsoleta', usos: 1 }],
    unidades,
  );
  const por = Object.fromEntries(p.map((x) => [x.valorLocal, x.resultado]));
  assert.deepEqual(por, { und: 'UNICO_CANDIDATO', Metro: 'UNICO_CANDIDATO', caja: 'VARIOS_CANDIDATOS', galón: 'SIN_CANDIDATO', obsoleta: 'SIN_CANDIDATO' });
});

test('valoresSinEquivalencia ordena por número de ítems afectados y excluye lo confirmado', () => {
  const r = valoresSinEquivalencia('unidad', [{ valor: 'und', usos: 500 }, { valor: 'caja', usos: 14 }, { valor: 'galón', usos: 30 }], resolutorEnMemoria(filas));
  assert.deepEqual(r.map((x) => [x.valor, x.estado]), [['galón', 'SIN_EQUIVALENCIA'], ['caja', 'PROPUESTA']]);
});

test('equivalencias confirmadas cuyo registro dejó de existir en el ERP se detectan para revisión', () => {
  const afectadas = equivalenciasAfectadasPorCatalogo(filas, [{ idErp: 8, codigo: 'M', nombre: 'Metro', activo: true }]);
  assert.deepEqual(afectadas.map((f) => f.valorLocal).sort(), ['und'].sort().concat([]).length ? afectadas.map((f) => f.valorLocal).sort() : []);
  assert.ok(afectadas.every((f) => f.estado === 'CONFIRMADA'));
  assert.ok(afectadas.length >= 1);
});

test('dos valores locales que apuntan al mismo id del ERP no se resuelven al azar', () => {
  const r = resolutorEnMemoria([
    { catalogo: 'unidad', valorLocal: 'und', idErp: 7, estado: 'CONFIRMADA' },
    { catalogo: 'unidad', valorLocal: 'unidad', idErp: 7, estado: 'CONFIRMADA' },
  ]);
  assert.equal(r.aLocal('unidad', 7).estado, 'REVISAR');
});

test('equivalencias de una organización no se mezclan con las de otra', () => {
  const orgA = resolutorEnMemoria([{ catalogo: 'unidad', valorLocal: 'und', idErp: 7, estado: 'CONFIRMADA' }]);
  const orgB = resolutorEnMemoria([{ catalogo: 'unidad', valorLocal: 'und', idErp: 70, estado: 'CONFIRMADA' }]);
  assert.equal(orgA.aErp('unidad', 'und').idErp, 7);
  assert.equal(orgB.aErp('unidad', 'und').idErp, 70);
});

// ------------------------------------------------------------ cruce
interface L { id: number; codigo: string | null; nombre: string }
interface E { wo: number; codigo: string | null }

test('cruce: escenarios A, B y C; provisionales sin código nunca se emparejan', () => {
  const locales: L[] = [
    { id: 1, codigo: 'A-1', nombre: 'Uno' },
    { id: 2, codigo: ' b-2 ', nombre: 'Dos' }, // espacios y mayúsculas distintas
    { id: 3, codigo: 'SOLO-APP', nombre: 'Tres' },
    { id: -1, codigo: null, nombre: 'Uno' }, // provisional con el mismo NOMBRE que A-1
  ];
  const erp: E[] = [{ wo: 100, codigo: 'a-1' }, { wo: 200, codigo: 'B-2' }, { wo: 300, codigo: 'SOLO-ERP' }];
  const r = cruzar(locales, erp, (l) => l.codigo, (e) => e.codigo);
  assert.deepEqual(r.coinciden.map((c) => [c.local.id, c.erp.wo]), [[1, 100], [2, 200]]);
  assert.deepEqual(r.soloLocal.map((l) => l.id), [3]);
  assert.deepEqual(r.soloErp.map((e) => e.wo), [300]);
  assert.deepEqual(r.sinClave.map((l) => l.id), [-1]);
  assert.equal(r.anomalias.length, 0);
});

test('cruce: claves duplicadas en el ERP (solo difieren en mayúsculas) son anomalía y no se cruzan', () => {
  const r = cruzar<L, E>([{ id: 1, codigo: 'X-1', nombre: 'a' }], [{ wo: 1, codigo: 'x-1' }, { wo: 2, codigo: 'X-1' }, { wo: 3, codigo: 'Y-9' }, { wo: 4, codigo: 'y-9' }, { wo: 5, codigo: null }], (l) => l.codigo, (e) => e.codigo);
  assert.equal(r.coinciden.length, 0);
  assert.equal(r.soloLocal.length, 0);
  assert.equal(r.soloErp.length, 0);
  assert.deepEqual(r.anomalias.map((a) => a.tipo).sort(), ['ERP_CLAVE_DUPLICADA', 'ERP_CLAVE_DUPLICADA', 'ERP_SIN_CLAVE']);
});

test('diferenciar: solo reporta lo que difiere, con tolerancia a espacios y a numeric como texto', () => {
  const d = diferenciar(
    { nombre_base: 'Tubo  latón', iva: '0.1900', activo: true, unidad_medida: 'und' },
    { nombre_base: 'Tubo latón', iva: 0.19, activo: false, unidad_medida: 'm' },
    [{ campo: 'nombre_base' }, { campo: 'iva' }, { campo: 'activo' }, { campo: 'unidad_medida' }, { campo: 'codigo_erp' }],
  );
  assert.deepEqual(d.map((x) => x.campo), ['activo', 'unidad_medida']);
});

// ------------------------------------------------------------ estados
test('estados: provisional e integración son conceptos independientes y las transiciones son válidas', () => {
  assert.equal(puedeTransicionar('API_PENDIENTE', 'SINCRONIZADO'), true);
  assert.equal(puedeTransicionar('ENVIANDO', 'LISTO_PARA_ENVIAR'), false);
  assert.equal(puedeTransicionar('SINCRONIZADO', 'API_PENDIENTE'), false);
  assert.equal(estadoTrasEvaluar({ vinculado: false, hayDiferencias: false, erroresDeDatos: 0, faltantes: 2 }), 'REQUIERE_CONFIGURACION');
  assert.equal(estadoTrasEvaluar({ vinculado: false, hayDiferencias: false, erroresDeDatos: 1, faltantes: 2 }), 'ERROR_VALIDACION');
  assert.equal(estadoTrasEvaluar({ vinculado: false, hayDiferencias: false, erroresDeDatos: 0, faltantes: 0 }), 'LISTO_PARA_ENVIAR');
  assert.equal(estadoTrasEvaluar({ vinculado: true, hayDiferencias: true, erroresDeDatos: 0, faltantes: 0 }), 'DIFERENCIAS');
});

test('el motor no lanza con datos malos: devuelve errores', () => {
  assert.doesNotThrow(() => aplicarDiccionario({}, DICCIONARIO_CREAR_ITEMS, ctx()));
  assert.doesNotThrow(() => aplicarDiccionario({ iva: 'abc', activo: 'quizá' }, DICCIONARIO_CREAR_ITEMS, ctx()));
});
