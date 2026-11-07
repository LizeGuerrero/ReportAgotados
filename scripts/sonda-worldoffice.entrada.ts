/**
 * Punto de entrada de la sonda de contrato de World Office (SOLO LECTURA).
 * No se ejecuta directamente: lo compila y lanza scripts/sonda-worldoffice.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ClienteWorldOffice } from '../core/integraciones/worldoffice/cliente';
import { ejecutarSonda, type InformeSonda } from '../core/integraciones/worldoffice/sonda';
import { aCsv } from '../core/integraciones/worldoffice/practica';

function leerToken(): string {
  const ruta = process.env.WO_TOKEN_FILE;
  const t = ruta ? readFileSync(ruta, 'utf8') : process.env.WO_TOKEN;
  if (!t || !t.trim()) {
    console.error(
      'Falta el token. Opciones (nunca lo escribas como argumento ni lo pegues en un chat):\n' +
        "  WO_TOKEN='…' node scripts/sonda-worldoffice.mjs\n" +
        '  WO_TOKEN_FILE=/ruta/a/archivo-con-el-token node scripts/sonda-worldoffice.mjs',
    );
    process.exit(2);
  }
  return t;
}

const arg = (nombre: string) => process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];

async function main() {
  const token = leerToken();
  const baseUrl = process.env.WO_BASE_URL || undefined;
  const maxInventarios = arg('max-inventarios') ? Number(arg('max-inventarios')) : undefined;
  const muestras = arg('muestras') !== undefined ? Number(arg('muestras')) : undefined;
  const salida = arg('salida') ?? 'sonda-worldoffice-resultado.json';
  const exportar = arg('exportar-inventarios'); // ruta de un CSV con los inventarios de WO

  console.log('Sonda de contrato de World Office — SOLO LECTURA (no crea ni modifica nada)\n');
  const informe: InformeSonda = await ejecutarSonda({
    crearCliente: (canal) => new ClienteWorldOffice({ token, baseUrl, canal }),
    maxInventarios,
    muestras,
    incluirInventarios: Boolean(exportar),
  });
  if (exportar && informe.inventariosCompactos) {
    writeFileSync(exportar, aCsv(informe.inventariosCompactos));
    delete informe.inventariosCompactos; // el JSON no repite los 452 inventarios
    console.log(`Inventarios exportados a ${exportar}`);
  }

  // Defensa adicional: el informe no debe contener el token bajo ningún concepto.
  const texto = JSON.stringify(informe, null, 2);
  const limpio = token.trim().replace(/^WO\s+/i, '');
  if (limpio.length > 8 && texto.includes(limpio)) {
    console.error('El informe contiene el token: no se guardó. Avisar para corregirlo.');
    process.exit(3);
  }
  writeFileSync(salida, texto);

  const ok = (x: { ok: boolean }) => (x.ok ? 'OK ' : 'FALLÓ');
  console.log(`canal elegido ........ ${JSON.stringify(informe.canal.elegido)}`);
  informe.canal.probados.forEach((p) => console.log(`  canal ${JSON.stringify(p.canal)}: ${ok(p.resultado)}`));
  if ('modoRecomendado' in informe.paginacion) console.log(`paginación ........... ${informe.paginacion.modoRecomendado ?? 'sin determinar'} — ${informe.paginacion.nota}`);
  informe.tamanoPagina.forEach((t) => console.log(`  página de ${t.solicitado}: ${ok(t.resultado)}`));
  for (const [k, v] of Object.entries(informe.catalogos)) console.log(`catálogo ${k.padEnd(15)} ${v.ok ? `${v.descargados} registros (${v.descartados} descartados)` : 'FALLÓ: ' + v.error.mensaje}`);
  if (informe.inventarios.ok) console.log(`inventarios .......... ${informe.inventarios.descargados} de ${informe.inventarios.total ?? '?'}`);
  else console.log(`inventarios .......... FALLÓ: ${informe.inventarios.error.mensaje}`);
  if (informe.impuestos) console.log(`impuestos ............ ${informe.impuestos.observaciones.length} tipos observados; escala de tarifa: ${informe.impuestos.escalaTarifa}`);
  if (informe.codigos) console.log(`códigos .............. ${informe.codigos.noCumplenReglaLocal.total} de ${informe.codigos.analizados} no cumplen nuestras reglas; ${informe.codigos.duplicadosPorMayusculas.grupos} grupos duplicados por mayúsculas`);
  informe.notas.forEach((n) => console.log(`NOTA: ${n}`));
  console.log(`\nInforme guardado en ${salida} (no contiene el token). Revísalo antes de compartirlo: incluye nombres de catálogos y de ítems.`);
}

main().catch((e) => {
  console.error('Error inesperado:', e instanceof Error ? e.message : e);
  process.exit(1);
});
