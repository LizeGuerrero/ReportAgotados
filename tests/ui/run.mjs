// Ejecuta una prueba de interfaz: la compila con esbuild y la corre en un DOM simulado (jsdom).
// Uso:  node run.mjs paneles.test.tsx
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../..');           // raíz del proyecto Next.js
const archivo = process.argv[2];
if (!archivo) { console.error('Uso: node run.mjs <archivo.test.tsx>'); process.exit(2); }

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle', 'Event', 'KeyboardEvent', 'MouseEvent']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Los componentes hablan con Supabase a través de '@/lib/supabase/client': en las pruebas se
// reemplaza por stub.ts, que registra las llamadas y devuelve las respuestas que cada prueba defina.
const stub = {
  name: 'stub-supabase',
  setup(b) { b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: path.join(aqui, 'stub.ts') })); },
};

const salida = path.join(aqui, '.out.mjs');
await build({
  entryPoints: [path.join(aqui, archivo)], bundle: true, platform: 'node', format: 'esm', outfile: salida, plugins: [stub],
  // una sola copia de React (la del proyecto), si no los hooks fallan
  alias: { '@': raiz, react: path.join(raiz, 'node_modules/react'), 'react-dom': path.join(raiz, 'node_modules/react-dom') },
  nodePaths: [path.join(raiz, 'node_modules'), path.join(aqui, 'node_modules')],
  jsx: 'automatic', loader: { '.css': 'empty' }, external: ['jsdom'], logLevel: 'error',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

try {
  await import(salida);
} catch (e) {
  console.log('EXCEPCIÓN:', e?.stack?.split('\n').slice(0, 6).join('\n') ?? e);
  process.exit(1);
}
