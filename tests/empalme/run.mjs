#!/usr/bin/env node
// Pruebas del motor de empalme y del conector de World Office (sin red, sin base de datos).
//   node tests/empalme/run.mjs
// Requiere `esbuild` (npx lo descarga la primera vez). No agrega dependencias al proyecto.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
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
const raiz = join(aqui, '..', '..');
const salida = mkdtempSync(join(tmpdir(), 'empalme-'));
const pruebas = readdirSync(aqui).filter((f) => f.endsWith('.test.ts'));

try {
  const archivosJs = [];
  for (const t of pruebas) {
    const out = join(salida, t.replace(/\.ts$/, '.cjs'));
    npxEsbuild([join(aqui, t), '--bundle', '--platform=node', '--format=cjs', `--outfile=${out}`, '--log-level=warning']);
    archivosJs.push(out);
  }
  // Se ejecuta desde la raíz del proyecto: algunas pruebas revisan los archivos de core/integraciones.
  execFileSync(process.execPath, ['--test', ...archivosJs], { stdio: 'inherit', cwd: raiz });
} catch (e) {
  console.error('Error al ejecutar:', e?.message ?? e);
  process.exitCode = 1;
} finally {
  rmSync(salida, { recursive: true, force: true });
}
