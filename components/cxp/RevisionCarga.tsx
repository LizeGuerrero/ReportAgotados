'use client';

import { useMemo, useState } from 'react';
import type { FilaErp } from '@/lib/cxp/fuentes/tipos';
import { fechaCorta, moneda } from './tipos';

export interface Edicion {
  fecha_dcto?: string;
  fecha_vcto?: string;
}

/** Fila lista para enviar: si se corrigió a mano, lleva además el valor original del ERP. */
export type FilaRevisada = FilaErp & { fecha_dcto_erp?: string; fecha_vcto_erp?: string };

const POR_PAGINA = 25;
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Aplica las correcciones a una fila del archivo. Sin correcciones devuelve la misma fila. */
export function aplicarEdicion(f: FilaErp, e?: Edicion): FilaRevisada {
  if (!e) return f;
  const out: FilaRevisada = { ...f };
  if (e.fecha_dcto && f.fecha_dcto && e.fecha_dcto !== f.fecha_dcto) {
    out.fecha_dcto = e.fecha_dcto;
    out.fecha_dcto_erp = f.fecha_dcto;
  }
  if (e.fecha_vcto && f.fecha_vcto && e.fecha_vcto !== f.fecha_vcto) {
    out.fecha_vcto = e.fecha_vcto;
    out.fecha_vcto_erp = f.fecha_vcto;
  }
  return out;
}

/** Una fila corregida es válida si el vencimiento no queda antes de la fecha del documento. */
export function edicionInvalida(f: FilaErp, e?: Edicion): boolean {
  if (!e) return false;
  const r = aplicarEdicion(f, e);
  const corregida = r.fecha_dcto_erp !== undefined || r.fecha_vcto_erp !== undefined;
  return corregida && !!r.fecha_dcto && !!r.fecha_vcto && r.fecha_vcto < r.fecha_dcto;
}

/**
 * Revisión de las filas del archivo antes de cargarlas a la cartera: se puede quitar una fila o corregir sus
 * fechas. Lo corregido queda marcado con «*» (también en la cartera) y se conserva mientras el ERP no cambie ese dato.
 */
export default function RevisionCarga({
  filas,
  ediciones,
  quitadas,
  onEditar,
  onQuitar,
  onDeshacerTodo,
  deshabilitado,
}: {
  filas: FilaErp[];
  ediciones: Record<number, Edicion>;
  quitadas: Set<number>;
  onEditar: (fila: number, campo: keyof Edicion, valor: string | null) => void;
  onQuitar: (fila: number, quitar: boolean) => void;
  onDeshacerTodo: () => void;
  deshabilitado: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [soloMarcadas, setSoloMarcadas] = useState(false);
  const [pagina, setPagina] = useState(0);

  const nCorregidas = useMemo(
    () => filas.filter((f) => {
      const r = aplicarEdicion(f, ediciones[f.fila]);
      return r.fecha_dcto_erp !== undefined || r.fecha_vcto_erp !== undefined;
    }).length,
    [filas, ediciones],
  );

  const visibles = useMemo(() => {
    const terminos = norm(texto).split(/\s+/).filter(Boolean);
    return filas.filter((f) => {
      if (soloMarcadas) {
        const r = aplicarEdicion(f, ediciones[f.fila]);
        const marcada = quitadas.has(f.fila) || r.fecha_dcto_erp !== undefined || r.fecha_vcto_erp !== undefined;
        if (!marcada) return false;
      }
      if (terminos.length === 0) return true;
      const pajar = norm(`${f.nombre} ${f.tercero} ${f.documento_erp} ${f.docto_proveedor ?? ''} ${f.detalle ?? ''}`);
      return terminos.every((t) => pajar.includes(t));
    });
  }, [filas, texto, soloMarcadas, ediciones, quitadas]);

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const fragmento = visibles.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA);

  function celdaFecha(f: FilaErp, campo: keyof Edicion) {
    const original = campo === 'fecha_dcto' ? f.fecha_dcto : f.fecha_vcto;
    const e = ediciones[f.fila];
    const valor = e?.[campo] ?? original ?? '';
    const corregida = !!original && valor !== original;
    const invalida = edicionInvalida(f, e);
    const quitada = quitadas.has(f.fila);
    if (!original) return <span className="cxp-rev__nota">—</span>;
    return (
      <div className={['cxp-rev__celda', corregida ? 'is-corregida' : '', invalida ? 'is-invalida' : ''].filter(Boolean).join(' ')}>
        <input
          type="date"
          className="ui-input ui-input--sm"
          aria-label={`${campo === 'fecha_dcto' ? 'Fecha del documento' : 'Vencimiento'} de ${f.documento_erp}`}
          title={corregida ? `Corregida a mano. El ERP trae: ${fechaCorta(original)}` : undefined}
          value={valor}
          disabled={deshabilitado || quitada}
          onChange={(ev) => onEditar(f.fila, campo, ev.target.value === '' ? null : ev.target.value)}
        />
        {corregida && (
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            aria-label={`Volver a la fecha del ERP (${fechaCorta(original)})`}
            title={`Volver a la del ERP: ${fechaCorta(original)}`}
            disabled={deshabilitado || quitada}
            onClick={() => onEditar(f.fila, campo, null)}
          >
            ↺
          </button>
        )}
      </div>
    );
  }

  return (
    <details className="cxp-carga__caja" aria-label="Revisión de filas del archivo">
      <summary className="cxp-carga__titulo">
        Revisar y corregir filas del archivo ({filas.length})
        {(nCorregidas > 0 || quitadas.size > 0) && (
          <span className="cxp-rev__nota"> — {nCorregidas} corregida(s), {quitadas.size} quitada(s)</span>
        )}
      </summary>
      <p className="ui-hint">
        Si el ERP trae una fecha equivocada, corrígela aquí antes de cargar: queda con <strong>*</strong> delante en la cartera. También
        puedes quitar una fila para que no se cargue (si ya estaba en la cartera, se verá como «no viene en el archivo»). Nada se guarda hasta que confirmes la carga.
      </p>

      <div className="cxp-rev__barra">
        <div className="ag-search">
          <input
            type="search"
            className="ui-input"
            placeholder="Buscar por proveedor, NIT, documento o detalle"
            aria-label="Buscar en las filas del archivo"
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setPagina(0); }}
          />
        </div>
        <label className="cxp-panel__fila">
          <input type="checkbox" checked={soloMarcadas} onChange={(e) => { setSoloMarcadas(e.target.checked); setPagina(0); }} />
          Solo las corregidas o quitadas
        </label>
        {(nCorregidas > 0 || quitadas.size > 0) && (
          <button type="button" className="cxp-link" disabled={deshabilitado} onClick={onDeshacerTodo}>
            Deshacer todo
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="ui-hint">Ninguna fila coincide.</p>
      ) : (
        <div className="ag-tablewrap" tabIndex={0}>
          <table className="cxp-carga__tabla cxp-rev__tabla">
            <thead>
              <tr>
                <th>Quitar</th><th>Fila</th><th>Proveedor</th><th>NIT</th><th>Documento ERP</th>
                <th>F. documento</th><th>F. vencimiento</th><th>Saldo</th><th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {fragmento.map((f) => {
                const invalida = edicionInvalida(f, ediciones[f.fila]);
                return (
                  <tr key={f.fila} className={quitadas.has(f.fila) ? 'is-quitada' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Quitar ${f.documento_erp} de la carga`}
                        checked={quitadas.has(f.fila)}
                        disabled={deshabilitado}
                        onChange={(e) => onQuitar(f.fila, e.target.checked)}
                      />
                    </td>
                    <td>{f.fila}</td>
                    <td>{f.nombre}</td>
                    <td>{f.tercero}</td>
                    <td>{f.documento_erp}</td>
                    <td>{celdaFecha(f, 'fecha_dcto')}</td>
                    <td>
                      {celdaFecha(f, 'fecha_vcto')}
                      {invalida && <div className="cxp-rev__error" role="alert">El vencimiento no puede ser anterior al documento.</div>}
                    </td>
                    <td>{f.saldo === null ? '' : moneda(f.saldo)}</td>
                    <td>{f.detalle ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="cxp-rev__barra">
        <span>{visibles.length} fila(s)</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>Anterior</button>
        <span>Pág. {pag + 1}/{paginas}</span>
        <button type="button" className="ui-btn ui-btn--sm" disabled={pag + 1 >= paginas} onClick={() => setPagina(pag + 1)}>Siguiente</button>
      </div>
    </details>
  );
}
