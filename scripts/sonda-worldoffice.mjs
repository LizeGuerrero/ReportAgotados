#!/usr/bin/env node
// Sonda de contrato de World Office: SOLO LECTURA (listados y consultas; no crea, edita ni elimina nada).
//
//   WO_TOKEN='…' node scripts/sonda-worldoffice.mjs
//   WO_TOKEN_FILE=/ruta/token.txt node scripts/sonda-worldoffice.mjs [--max-inventarios=300] [--muestras=2] [--salida=resultado.json]
//
// Escribe sonda-worldoffice-resultado.json (sin el token). Requiere `esbuild` (npx lo descarga la primera vez).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// En Windows `npx` es `npx.cmd`: hay que usar shell y entrecomillar (las rutas pueden tener espacios).
const esWin = process.platform === 'win32';
const q = (a) => (esWin ? `"${String(a).replace(/"/g, '\\"')}"` : a);
function npxEsbuild(args) {
  execFileSync(esWin ? 'npx.cmd' : 'npx', ['--yes', 'esbuild', ...args].map(q), { stdio: 'inherit', shell: esWin });
}

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = mkdtempSync(join(tmpdir(), 'sonda-wo-'));
const bundle = join(salida, 'sonda.cjs');

try {
  npxEsbuild([join(aqui, 'sonda-worldoffice.entrada.ts'), '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--log-level=warning']);
  // El token viaja solo por variable de entorno (nunca por argumentos, que quedan en el historial y en `ps`).
  execFileSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
} catch (e) {
  console.error('Error al ejecutar:', e?.message ?? e);
  process.exitCode = typeof e?.status === 'number' ? e.status : 1;
} finally {
  rmSync(salida, { recursive: true, force: true });
}
