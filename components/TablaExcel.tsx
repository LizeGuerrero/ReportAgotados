'use client';

import { useEffect, useRef, useState } from 'react';
import { CopyIcon, FitIcon } from '@/components/ui/icons';
import { construirTablaCopia, copiarAlPortapapeles } from '@/lib/tablaCopia';

/**
 * Envoltorio para cualquier <table className="mod-table"> de Pedidos, Ítems y
 * Proveedores. Le da el mismo comportamiento que tiene la tabla de Agotados:
 *
 *  - La tabla se mueve dentro de su propio recuadro, que mide lo que queda de
 *    pantalla: el encabezado queda fijo arriba y la paginación (que va justo
 *    debajo) siempre se ve, sin tener que bajar la página.
 *  - Columnas redimensionables arrastrando el borde del encabezado (flechas
 *    izquierda/derecha con el teclado, doble clic = ajustar al contenido).
 *  - Alto de fila redimensionable desde el borde inferior de la primera celda.
 *  - Selección de celdas como en Excel (arrastrar, Mayús + clic, flechas,
 *    Ctrl+A, Esc) y copiado con formato (Ctrl+C) para pegar en Excel o Word.
 *  - Los anchos de columna se recuerdan por tabla (localStorage).
 *
 * No necesita que la tabla cambie: trabaja sobre el DOM que ya pinta React y
 * es idempotente (un MutationObserver reaplica lo necesario tras cada render).
 * No toca datos ni lógica de negocio: solo lee el texto de las celdas.
 */

const ANCHO_MIN = 60;
const ANCHO_MAX = 700;
const ALTO_MIN = 28;
const ALTO_MAX = 400;
const ALTO_MIN_RECUADRO = 224; // 14rem
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const dentro = (n: number, max: number) => Math.min(max, Math.max(0, n));
const formato = (n: number) => n.toLocaleString('es-CO');

interface Celda {
  r: number;
  c: number;
}
interface Seleccion {
  ancla: Celda;
  foco: Celda;
}
interface Rango {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
  activa: Celda;
}

interface Acciones {
  ajustar: () => void;
  restablecer: () => void;
  copiarSeleccion: () => void;
  copiarTabla: () => void;
  quitarSeleccion: () => void;
}

export default function TablaExcel({
  clave,
  children,
  etiqueta = 'Tabla',
}: {
  /** Identifica la tabla para recordar sus anchos (p. ej. "pedidos-lista"). */
  clave: string;
  children: React.ReactNode;
  etiqueta?: string;
}) {
  const raizRef = useRef<HTMLDivElement>(null);
  const contRef = useRef<HTMLDivElement>(null);
  const acciones = useRef<Acciones | null>(null);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resumen, setResumen] = useState<{ filas: number; cols: number } | null>(null);
  const [personalizada, setPersonalizada] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);

  useEffect(() => {
    const cont = contRef.current;
    const raiz = raizRef.current;
    if (!cont || !raiz) return;
    const contenedor: HTMLDivElement = cont;
    const caja: HTMLDivElement = raiz;

    const CLAVE_LS = `tabla:${clave}`;
    let guardados: Record<string, number> = {};
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_LS) ?? 'null');
      for (const [k, n] of Object.entries((v?.anchos ?? {}) as Record<string, unknown>)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) guardados[k] = limitar(n, ANCHO_MIN, ANCHO_MAX);
      }
    } catch {
      guardados = {};
    }

    let anchos: number[] = [];
    let claves: string[] = [];
    let firma = '';
    let congelada = false;
    let ordenable = true;
    let filas: HTMLTableRowElement[] = [];
    let firmaFilas = '';
    let sel: Seleccion | null = null;
    let seleccionando = false;
    let ultimo = { x: 0, y: 0 };
    let cuadro = 0;
    let programado = 0;
    let temporizadorGuardado: ReturnType<typeof setTimeout> | null = null;
    let lienzo: CanvasRenderingContext2D | null = null;
    let arrastre: { tipo: 'col' | 'fila'; i: number; inicio: number; base: number; tr?: HTMLElement } | null = null;

    const tabla = () => contenedor.querySelector<HTMLTableElement>('table');
    const cabeceras = () =>
      Array.from(contenedor.querySelectorAll<HTMLTableCellElement>('table > thead > tr:first-child > th'));

    function mostrarAviso(texto: string, error = false) {
      setAviso({ texto, error });
      if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
      temporizadorAviso.current = setTimeout(() => setAviso(null), error ? 6000 : 3500);
    }

    // ---------- Altura: lo que queda de pantalla ----------

    function ajustarAltura() {
      const alto = window.innerHeight;
      const arriba = contenedor.getBoundingClientRect().top + window.scrollY;
      let debajo = 0;
      for (let el = caja.nextElementSibling; el; el = el.nextElementSibling) {
        const est = getComputedStyle(el);
        if (est.position === 'fixed' || est.display === 'none') continue;
        debajo += (el as HTMLElement).offsetHeight + parseFloat(est.marginTop) + parseFloat(est.marginBottom);
      }
      // relleno inferior de la página
      const max = Math.max(ALTO_MIN_RECUADRO, Math.floor(alto - arriba - debajo - 44));
      const actual = parseFloat(contenedor.style.maxHeight || '0');
      if (Math.abs(actual - max) > 1) contenedor.style.maxHeight = `${max}px`;
    }

    // ---------- Columnas ----------

    function clavesDe(ths: HTMLTableCellElement[]) {
      const usadas = new Set<string>();
      return ths.map((th, i) => {
        const texto = (th.textContent ?? '').replace(/\s+/g, ' ').trim() || `col${i}`;
        const k = usadas.has(texto) ? `${texto}#${i}` : texto;
        usadas.add(k);
        return k;
      });
    }

    function aplicarAnchos() {
      const t = tabla();
      const cg = t?.querySelector<HTMLTableColElement>(':scope > colgroup.mod-cols');
      if (!t || !cg) return;
      Array.from(cg.children).forEach((col, i) => {
        (col as HTMLElement).style.width = `${anchos[i]}px`;
      });
      t.style.width = `max(100%, ${anchos.reduce((s, n) => s + n, 0)}px)`;
    }

    function descongelar() {
      const t = tabla();
      t?.querySelector(':scope > colgroup.mod-cols')?.remove();
      if (t) {
        t.style.tableLayout = '';
        t.style.width = '';
        t.classList.remove('mod-table--fixed');
      }
      congelada = false;
      anchos = [];
    }

    function congelar(ths: HTMLTableCellElement[]) {
      const t = tabla();
      if (!t || congelada || !ordenable || filas.length === 0) return;
      anchos = ths.map((th, i) =>
        limitar(guardados[claves[i]] ?? Math.ceil(th.getBoundingClientRect().width), ANCHO_MIN, ANCHO_MAX),
      );
      const cg = document.createElement('colgroup');
      cg.className = 'mod-cols';
      ths.forEach(() => cg.appendChild(document.createElement('col')));
      t.insertBefore(cg, t.firstChild);
      t.style.tableLayout = 'fixed';
      t.classList.add('mod-table--fixed');
      congelada = true;
      aplicarAnchos();
    }

    function hayPersonalizacion() {
      return Object.keys(guardados).length > 0 || filas.some((tr) => tr.style.height !== '');
    }

    function guardarSoon() {
      if (temporizadorGuardado) clearTimeout(temporizadorGuardado);
      temporizadorGuardado = setTimeout(() => {
        try {
          if (Object.keys(guardados).length === 0) localStorage.removeItem(CLAVE_LS);
          else localStorage.setItem(CLAVE_LS, JSON.stringify({ anchos: guardados }));
        } catch {
          // sin almacenamiento disponible: los anchos valen solo para esta sesión
        }
      }, 300);
      setPersonalizada(hayPersonalizacion());
    }

    function fijarAncho(i: number, ancho: number) {
      if (!congelada || i < 0 || i >= anchos.length) return;
      anchos[i] = limitar(ancho, ANCHO_MIN, ANCHO_MAX);
      guardados[claves[i]] = anchos[i];
      aplicarAnchos();
      guardarSoon();
    }

    function medirColumna(i: number): number {
      const ctx = (lienzo ??= document.createElement('canvas').getContext('2d'));
      const ths = cabeceras();
      if (!ctx || !ths[i]) return anchos[i] ?? ANCHO_MIN;
      let max = 0;
      const celdas = [ths[i], ...filas.map((tr) => tr.cells[i]).filter(Boolean)] as HTMLElement[];
      for (const celda of celdas) {
        const est = getComputedStyle(celda);
        ctx.font = `${est.fontWeight} ${est.fontSize} ${est.fontFamily}`;
        const control = celda.querySelector<HTMLElement>('input, select, textarea');
        if (control) {
          max = Math.max(max, control.offsetWidth + 28);
          continue;
        }
        const extra = celda.tagName === 'TH' ? 44 : 34; // relleno + insignia o icono
        const linea = (celda.innerText || '').split('\n').reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
        max = Math.max(max, linea + extra);
      }
      return limitar(Math.ceil(max), ANCHO_MIN, ANCHO_MAX);
    }

    function ajustar() {
      if (!congelada) return;
      anchos = anchos.map((_, i) => medirColumna(i));
      anchos.forEach((n, i) => (guardados[claves[i]] = n));
      filas.forEach((tr) => (tr.style.height = ''));
      aplicarAnchos();
      guardarSoon();
    }

    function restablecer() {
      guardados = {};
      filas.forEach((tr) => (tr.style.height = ''));
      descongelar();
      firma = '';
      try {
        localStorage.removeItem(CLAVE_LS);
      } catch {
        /* nada que borrar */
      }
      setPersonalizada(false);
      programar();
    }

    // ---------- Selección de celdas ----------

    function rangoActual(): Rango | null {
      const nF = filas.length;
      const nC = claves.length;
      if (!sel || nF === 0 || nC === 0) return null;
      const a = { r: dentro(sel.ancla.r, nF - 1), c: dentro(sel.ancla.c, nC - 1) };
      const f = { r: dentro(sel.foco.r, nF - 1), c: dentro(sel.foco.c, nC - 1) };
      return {
        r1: Math.min(a.r, f.r),
        r2: Math.max(a.r, f.r),
        c1: Math.min(a.c, f.c),
        c2: Math.max(a.c, f.c),
        activa: a,
      };
    }

    function pintar() {
      contenedor.querySelectorAll('.mod-sel').forEach((el) => {
        el.classList.remove('mod-sel', 'mod-sel--t', 'mod-sel--b', 'mod-sel--l', 'mod-sel--r', 'mod-sel--activa');
      });
      const rg = rangoActual();
      if (!rg) return;
      for (let r = rg.r1; r <= rg.r2; r++) {
        for (let c = rg.c1; c <= rg.c2; c++) {
          const td = filas[r]?.cells[c];
          if (!td) continue;
          td.classList.add('mod-sel');
          if (r === rg.r1) td.classList.add('mod-sel--t');
          if (r === rg.r2) td.classList.add('mod-sel--b');
          if (c === rg.c1) td.classList.add('mod-sel--l');
          if (c === rg.c2) td.classList.add('mod-sel--r');
          if (r === rg.activa.r && c === rg.activa.c) td.classList.add('mod-sel--activa');
        }
      }
    }

    function fijarSeleccion(nueva: Seleccion | null) {
      sel = nueva;
      pintar();
      const rg = rangoActual();
      setResumen(rg ? { filas: rg.r2 - rg.r1 + 1, cols: rg.c2 - rg.c1 + 1 } : null);
    }

    function textoDe(celda: HTMLElement): string {
      const clon = celda.cloneNode(true) as HTMLElement;
      const valores: string[] = [];
      celda.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach((c) => {
        if (c instanceof HTMLInputElement && (c.type === 'checkbox' || c.type === 'radio')) return;
        const v = c instanceof HTMLSelectElement ? (c.selectedOptions[0]?.text ?? '') : c.value;
        if (v.trim()) valores.push(v.trim());
      });
      clon.querySelectorAll('.mod-rowresizer, .mod-resizer, input, select, textarea, button, [role="listbox"]').forEach((e) => e.remove());
      clon.querySelectorAll('div, p, li, br').forEach((e) => e.append(' '));
      const base = (clon.textContent ?? '').replace(/\s+/g, ' ').trim();
      return [base, ...valores].filter(Boolean).join(' ');
    }

    async function copiarSeleccion() {
      const rg = rangoActual();
      if (!rg) return;
      const datos: string[][] = [];
      for (let r = rg.r1; r <= rg.r2; r++) {
        const fila: string[] = [];
        for (let c = rg.c1; c <= rg.c2; c++) fila.push(filas[r]?.cells[c] ? textoDe(filas[r].cells[c]) : '');
        datos.push(fila);
      }
      try {
        await copiarAlPortapapeles(Promise.resolve(construirTablaCopia([], datos)));
        const n = datos.length * datos[0].length;
        mostrarAviso(`Copiado: ${formato(n)} ${n === 1 ? 'celda' : 'celdas'}. Ya puedes pegarlas en Excel.`);
      } catch (e) {
        mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar.', true);
      }
    }

    async function copiarTabla() {
      const ths = cabeceras();
      if (filas.length === 0) {
        mostrarAviso('No hay filas para copiar.');
        return;
      }
      const cuerpo = filas.map((tr) => ths.map((_, c) => (tr.cells[c] ? textoDe(tr.cells[c]) : '')));
      // se omiten las columnas sin datos (por ejemplo, la de botones de acción)
      const usar = ths.map((_, c) => cuerpo.some((f) => f[c] !== ''));
      const encabezados = ths.map((th, c) => (usar[c] ? (th.textContent ?? '').replace(/\s+/g, ' ').trim() : null)).filter((h): h is string => h !== null);
      const datos = cuerpo.map((f) => f.filter((_, c) => usar[c]));
      try {
        await copiarAlPortapapeles(Promise.resolve(construirTablaCopia(encabezados, datos)));
        mostrarAviso(`Tabla copiada (${formato(datos.length)} ${datos.length === 1 ? 'fila' : 'filas'}). Ya puedes pegarla en Excel.`);
      } catch (e) {
        mostrarAviso(e instanceof Error && e.message ? `No se pudo copiar: ${e.message}` : 'No se pudo copiar la tabla.', true);
      }
    }

    function celdaEn(x: number, y: number): Celda | null {
      const td = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]');
      if (!td || !contenedor.contains(td)) return null;
      return { r: Number(td.dataset.r), c: Number(td.dataset.c) };
    }

    // Mientras se arrastra: sigue al puntero y desplaza el recuadro si se acerca al borde
    function seguir() {
      cuadro = 0;
      if (!seleccionando) return;
      const BORDE = 40;
      const PASO = 12;
      const cab = tabla()?.tHead?.offsetHeight ?? 0;
      const caja2 = contenedor.getBoundingClientRect();
      const izq = caja2.left + contenedor.clientLeft;
      const arriba = caja2.top + contenedor.clientTop;
      const { x, y } = ultimo;
      contenedor.scrollLeft += x < izq + BORDE ? -PASO : x > izq + contenedor.clientWidth - BORDE ? PASO : 0;
      contenedor.scrollTop += y < arriba + cab + BORDE ? -PASO : y > arriba + contenedor.clientHeight - BORDE ? PASO : 0;
      const cx = Math.min(Math.max(x, izq + 2), izq + contenedor.clientWidth - 2);
      const cy = Math.min(Math.max(y, arriba + cab + 2), arriba + contenedor.clientHeight - 2);
      const celda = celdaEn(cx, cy);
      if (celda && sel && (sel.foco.r !== celda.r || sel.foco.c !== celda.c)) fijarSeleccion({ ...sel, foco: celda });
      cuadro = requestAnimationFrame(seguir);
    }

    function verCelda(r: number, c: number) {
      requestAnimationFrame(() => filas[r]?.cells[c]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }

    // ---------- Eventos ----------

    function alPulsar(e: PointerEvent) {
      const objetivo = e.target as HTMLElement;
      const colRes = objetivo.closest<HTMLElement>('.mod-resizer');
      const filaRes = objetivo.closest<HTMLElement>('.mod-rowresizer');
      if (colRes) {
        const th = colRes.closest('th') as HTMLTableCellElement;
        const i = th.cellIndex;
        e.preventDefault();
        colRes.setPointerCapture(e.pointerId);
        arrastre = { tipo: 'col', i, inicio: e.clientX, base: anchos[i] ?? th.getBoundingClientRect().width };
        return;
      }
      if (filaRes) {
        const tr = filaRes.closest('tr') as HTMLElement;
        e.preventDefault();
        filaRes.setPointerCapture(e.pointerId);
        arrastre = { tipo: 'fila', i: 0, inicio: e.clientY, base: tr.getBoundingClientRect().height, tr };
        return;
      }
      if (e.button !== 0) return;
      const td = objetivo.closest<HTMLElement>('[data-r]');
      if (!td || !contenedor.contains(td)) return;
      const celda = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
      fijarSeleccion(e.shiftKey && sel ? { ...sel, foco: celda } : { ancla: celda, foco: celda });
      // Campos, botones y listas siguen funcionando normal: solo marcan su celda
      if (objetivo.closest('input, textarea, select, button, a, [role="option"]')) return;
      contenedor.focus({ preventScroll: true });
      if (e.pointerType === 'touch') return; // con el dedo el arrastre desplaza la tabla
      seleccionando = true;
      ultimo = { x: e.clientX, y: e.clientY };
    }

    function alMover(e: PointerEvent) {
      if (arrastre) {
        if (arrastre.tipo === 'col') fijarAncho(arrastre.i, arrastre.base + e.clientX - arrastre.inicio);
        else if (arrastre.tr) {
          arrastre.tr.style.height = `${limitar(arrastre.base + e.clientY - arrastre.inicio, ALTO_MIN, ALTO_MAX)}px`;
          setPersonalizada(true);
        }
        return;
      }
      if (!seleccionando) return;
      ultimo = { x: e.clientX, y: e.clientY };
      if (!cuadro) cuadro = requestAnimationFrame(seguir);
    }

    function alSoltar(e: PointerEvent) {
      seleccionando = false;
      if (arrastre) {
        const el = e.target as HTMLElement;
        if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
        arrastre = null;
      }
    }

    function alDobleClic(e: MouseEvent) {
      const objetivo = e.target as HTMLElement;
      const colRes = objetivo.closest<HTMLElement>('.mod-resizer');
      if (colRes) {
        const th = colRes.closest('th') as HTMLTableCellElement;
        fijarAncho(th.cellIndex, medirColumna(th.cellIndex));
        return;
      }
      const filaRes = objetivo.closest<HTMLElement>('.mod-rowresizer');
      if (filaRes) {
        (filaRes.closest('tr') as HTMLElement).style.height = '';
        setPersonalizada(hayPersonalizacion());
      }
    }

    function alTeclado(e: KeyboardEvent) {
      const objetivo = e.target as HTMLElement;
      if (objetivo.classList.contains('mod-resizer')) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = (objetivo.closest('th') as HTMLTableCellElement).cellIndex;
        fijarAncho(i, (anchos[i] ?? 0) + (e.key === 'ArrowRight' ? 16 : -16));
        return;
      }
      // Dentro de un campo o botón, el teclado es de ese control
      if (objetivo !== contenedor) return;
      const modificador = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      const rg = rangoActual();
      if (modificador && tecla === 'c') {
        if (rg) {
          e.preventDefault();
          copiarSeleccion();
        }
        return;
      }
      if (modificador && tecla === 'a') {
        if (filas.length > 0 && claves.length > 0) {
          e.preventDefault();
          fijarSeleccion({ ancla: { r: 0, c: 0 }, foco: { r: filas.length - 1, c: claves.length - 1 } });
        }
        return;
      }
      if (e.key === 'Escape') {
        if (sel) {
          e.preventDefault();
          fijarSeleccion(null);
        }
        return;
      }
      const paso: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      // Sin selección, las flechas siguen desplazando la tabla como siempre
      if (!paso[e.key] || !rg || !sel) return;
      e.preventDefault();
      const [dr, dc] = paso[e.key];
      const desde = e.shiftKey ? sel.foco : rg.activa;
      const destino = { r: dentro(desde.r + dr, filas.length - 1), c: dentro(desde.c + dc, claves.length - 1) };
      fijarSeleccion(e.shiftKey ? { ancla: sel.ancla, foco: destino } : { ancla: destino, foco: destino });
      verCelda(destino.r, destino.c);
    }

    // ---------- Aplicar al DOM que pinta React (idempotente) ----------

    function mejorar() {
      programado = 0;
      const t = tabla();
      if (!t) return;
      const ths = cabeceras();
      if (ths.length === 0) return;

      const filasTabla = Array.from(t.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr'));
      filas = filasTabla.filter(
        (tr) => tr.cells.length === ths.length && !Array.from(tr.cells).some((c) => c.colSpan > 1),
      );
      claves = clavesDe(ths);
      ordenable = t.tHead?.rows.length === 1 && !ths.some((th) => th.colSpan > 1);

      // Si cambian las columnas, se vuelve a medir
      const nuevaFirma = `${claves.join('|')}#${ordenable ? 1 : 0}`;
      if (nuevaFirma !== firma) {
        descongelar();
        firma = nuevaFirma;
      }

      // Tiradores de ancho en el encabezado
      if (ordenable) {
        ths.forEach((th, i) => {
          if (th.querySelector(':scope > .mod-resizer')) return;
          const h = document.createElement('span');
          h.className = 'mod-resizer';
          h.setAttribute('role', 'separator');
          h.setAttribute('aria-orientation', 'vertical');
          h.setAttribute('aria-label', `Cambiar ancho de la columna ${(th.textContent ?? '').trim() || i + 1}`);
          h.setAttribute('title', 'Arrastra para cambiar el ancho. Doble clic: ajustar al contenido');
          h.tabIndex = 0;
          th.appendChild(h);
        });
      }

      // Coordenadas de cada celda y tirador de alto en la primera
      filas.forEach((tr, r) => {
        Array.from(tr.cells).forEach((td, c) => {
          if (td.dataset.r !== String(r)) td.dataset.r = String(r);
          if (td.dataset.c !== String(c)) td.dataset.c = String(c);
        });
        const primera = tr.cells[0];
        if (primera && !primera.querySelector(':scope > .mod-rowresizer')) {
          primera.classList.add('mod-rowhead');
          const h = document.createElement('span');
          h.className = 'mod-rowresizer';
          h.setAttribute('role', 'separator');
          h.setAttribute('aria-orientation', 'horizontal');
          h.setAttribute('title', 'Arrastra para cambiar el alto. Doble clic: alto natural');
          primera.appendChild(h);
        }
      });

      if (ordenable) congelar(ths);

      // Si cambió lo que se está viendo, la selección ya no aplica
      const ultima = filas[filas.length - 1];
      const nuevaFirmaFilas = `${filas.length}|${(filas[0]?.textContent ?? '').slice(0, 40)}|${(ultima?.textContent ?? '').slice(0, 40)}`;
      if (nuevaFirmaFilas !== firmaFilas) {
        firmaFilas = nuevaFirmaFilas;
        if (sel) fijarSeleccion(null);
      }
      pintar();
      ajustarAltura();
      observador.takeRecords(); // los cambios de arriba son nuestros: no deben dispararnos de nuevo
    }

    function programar() {
      if (!programado) programado = requestAnimationFrame(mejorar);
    }

    const observador = new MutationObserver(programar);
    observador.observe(contenedor, { childList: true, subtree: true });
    const medidor = new ResizeObserver(() => ajustarAltura());
    if (caja.parentElement) medidor.observe(caja.parentElement);
    window.addEventListener('resize', programar);

    contenedor.addEventListener('pointerdown', alPulsar);
    contenedor.addEventListener('pointermove', alMover);
    contenedor.addEventListener('dblclick', alDobleClic);
    contenedor.addEventListener('keydown', alTeclado);
    document.addEventListener('pointermove', alMover);
    document.addEventListener('pointerup', alSoltar);
    document.addEventListener('pointercancel', alSoltar);

    acciones.current = {
      ajustar,
      restablecer,
      copiarSeleccion,
      copiarTabla,
      quitarSeleccion: () => fijarSeleccion(null),
    };
    setPersonalizada(Object.keys(guardados).length > 0);
    programar();

    return () => {
      observador.disconnect();
      medidor.disconnect();
      window.removeEventListener('resize', programar);
      contenedor.removeEventListener('pointerdown', alPulsar);
      contenedor.removeEventListener('pointermove', alMover);
      contenedor.removeEventListener('dblclick', alDobleClic);
      contenedor.removeEventListener('keydown', alTeclado);
      document.removeEventListener('pointermove', alMover);
      document.removeEventListener('pointerup', alSoltar);
      document.removeEventListener('pointercancel', alSoltar);
      if (programado) cancelAnimationFrame(programado);
      if (cuadro) cancelAnimationFrame(cuadro);
      if (temporizadorGuardado) clearTimeout(temporizadorGuardado);
      acciones.current = null;
    };
  }, [clave]);

  return (
    <div ref={raizRef} className="mod-tablebox">
      <div className="mod-tools">
        <p className="mod-summary">
          {resumen && (
            <span>
              <span aria-live="polite">
                Selección: <strong>{formato(resumen.filas)}</strong> {resumen.filas === 1 ? 'fila' : 'filas'} ×{' '}
                <strong>{formato(resumen.cols)}</strong> {resumen.cols === 1 ? 'columna' : 'columnas'}
              </span>{' '}
              <button type="button" className="ui-link" onClick={() => acciones.current?.copiarSeleccion()}>
                Copiar selección (Ctrl+C)
              </button>{' '}
              <button type="button" className="ui-link" onClick={() => acciones.current?.quitarSeleccion()}>
                Quitar selección
              </button>
            </span>
          )}
          {personalizada && (
            <button type="button" className="ui-link" onClick={() => acciones.current?.restablecer()}>
              Restablecer vista
            </button>
          )}
        </p>
        <div className="mod-tools__buttons">
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={() => acciones.current?.ajustar()}
            title="Ajusta cada columna al ancho de su contenido y cada fila a su alto natural"
          >
            <FitIcon width={16} height={16} />
            Ajustar columnas y filas
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={() => acciones.current?.copiarTabla()}
            title="Copia la tabla con formato para pegarla en Excel, Word o correo"
          >
            <CopyIcon width={16} height={16} />
            Copiar tabla
          </button>
        </div>
      </div>

      <div className="mod-tablewrap" role="region" aria-label={etiqueta} tabIndex={0} ref={contRef}>
        {children}
      </div>

      {/* Región viva siempre presente: los lectores de pantalla anuncian el aviso al aparecer */}
      <div role="status" aria-live="polite">
        {aviso && <div className={aviso.error ? 'mod-toast mod-toast--error' : 'mod-toast'}>{aviso.texto}</div>}
      </div>
    </div>
  );
}
