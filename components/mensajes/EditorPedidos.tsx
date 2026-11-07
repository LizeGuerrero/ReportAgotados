'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { insertarEnPosicion, variablesDesconocidas } from '@/lib/mensajes/variables';
import { AMBITOS, type Campo, type CfgPedidos } from './tipos';

type CampoTexto = 'encabezado' | 'introduccion' | 'pie';

const TEXTOS: { k: CampoTexto; titulo: string; ayuda: string; filas: number }[] = [
  { k: 'encabezado', titulo: 'Título', ayuda: 'Primera línea del mensaje.', filas: 1 },
  { k: 'introduccion', titulo: 'Texto antes de los productos', ayuda: 'Opcional. Un saludo, p. ej. “{saludo} {primer_nombre}”.', filas: 3 },
  { k: 'pie', titulo: 'Texto final', ayuda: 'Opcional. Condiciones de pago, despedida…', filas: 3 },
];

/** Editor de una estructura de Pedidos: tres textos con variables y la lista de campos (visibilidad, orden, título y destino). */
export default function EditorPedidos({
  cfg, base, editable, onCambio, conocidas, insertarRef,
}: {
  cfg: CfgPedidos; base: CfgPedidos | null; editable: boolean; onCambio: (c: CfgPedidos) => void;
  conocidas: string[];
  /** El panel de variables llama a esta función para insertar en el campo de texto que tenía el cursor. */
  insertarRef: MutableRefObject<((texto: string) => void) | null>;
}) {
  const refs = useRef<Record<CampoTexto, HTMLTextAreaElement | HTMLInputElement | null>>({ encabezado: null, introduccion: null, pie: null });
  const [foco, setFoco] = useState<CampoTexto>('introduccion');
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    insertarRef.current = (ins: string) => {
      if (!editable) return;
      const el = refs.current[foco];
      const actual = cfgRef.current[foco];
      const r = insertarEnPosicion(actual, el?.selectionStart ?? actual.length, el?.selectionEnd ?? actual.length, ins);
      onCambio({ ...cfgRef.current, [foco]: r.texto });
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.cursor, r.cursor); });
    };
    return () => { insertarRef.current = null; };
  }, [foco, editable, onCambio, insertarRef]);

  const cambiarCampo = (clave: string, cambio: Partial<Campo>) =>
    onCambio({ ...cfg, campos: cfg.campos.map((c) => (c.clave === clave ? { ...c, ...cambio } : c)) });

  function mover(clave: string, delta: -1 | 1) {
    const campo = cfg.campos.find((c) => c.clave === clave);
    if (!campo) return;
    const grupo = cfg.campos.filter((c) => c.ambito === campo.ambito).sort((x, y) => x.orden - y.orden);
    const i = grupo.findIndex((c) => c.clave === clave);
    const j = i + delta;
    if (j < 0 || j >= grupo.length) return;
    [grupo[i], grupo[j]] = [grupo[j], grupo[i]];
    const nuevo = new Map(grupo.map((c, k) => [c.clave, k + 1]));
    onCambio({ ...cfg, campos: cfg.campos.map((c) => (nuevo.has(c.clave) ? { ...c, orden: nuevo.get(c.clave) as number } : c)) });
  }

  const baseCampo = (clave: string) => base?.campos.find((x) => x.clave === clave);
  const difiere = (c: Campo) => {
    const g = baseCampo(c.clave);
    return !!g && (c.etiqueta !== g.etiqueta || c.orden !== g.orden || c.visible !== g.visible || c.destino !== g.destino);
  };

  return (
    <div className="msj-editor">
      <section className="msj-bloque">
        <h3 className="msj-bloque__titulo">Textos</h3>
        {TEXTOS.map((t) => {
          const malas = variablesDesconocidas(cfg[t.k], conocidas);
          return (
            <div key={t.k} className="msj-campo">
              <label className="msj-label" htmlFor={`msj-txt-${t.k}`}>
                {t.titulo}
                {base && cfg[t.k] !== base[t.k] && <span className="msj-tag msj-tag--cambio" title="Distinto de la Estándar">editado</span>}
              </label>
              {t.filas === 1
                ? <input id={`msj-txt-${t.k}`} className="msj-input" value={cfg[t.k]} disabled={!editable} maxLength={600}
                    ref={(el) => { refs.current[t.k] = el; }} onFocus={() => setFoco(t.k)}
                    onChange={(e) => onCambio({ ...cfg, [t.k]: e.target.value })} />
                : <textarea id={`msj-txt-${t.k}`} className="msj-input msj-input--area" rows={t.filas} value={cfg[t.k]} disabled={!editable} maxLength={600}
                    ref={(el) => { refs.current[t.k] = el; }} onFocus={() => setFoco(t.k)}
                    onChange={(e) => onCambio({ ...cfg, [t.k]: e.target.value })} />}
              <div className="msj-sub">{t.ayuda}</div>
              {malas.length > 0 && <div className="msj-aviso msj-aviso--warn" role="status">No existen y saldrán tal cual: {malas.join(', ')}</div>}
            </div>
          );
        })}
      </section>

      {AMBITOS.map((a) => {
        const grupo = cfg.campos.filter((c) => c.ambito === a.valor).sort((x, y) => x.orden - y.orden);
        if (grupo.length === 0) return null;
        const visibles = grupo.filter((c) => c.visible).length;
        return (
          <details key={a.valor} className="msj-bloque msj-bloque--plegable" open={a.valor === 'linea'}>
            <summary className="msj-bloque__resumen">
              <span className="msj-bloque__titulo">{a.texto}</span>
              <span className="msj-sub">{visibles} de {grupo.length} visibles · {a.ayuda}</span>
            </summary>
            <ul className="msj-campos" role="list">
              {grupo.map((c, k) => (
                <li key={c.clave} className={c.visible ? 'msj-fila' : 'msj-fila is-apagada'}>
                  <span className="msj-fila__orden">
                    <button type="button" className="msj-mini" disabled={!editable || k === 0} onClick={() => mover(c.clave, -1)} aria-label={`Subir ${c.etiqueta_defecto}`}>↑</button>
                    <button type="button" className="msj-mini" disabled={!editable || k === grupo.length - 1} onClick={() => mover(c.clave, 1)} aria-label={`Bajar ${c.etiqueta_defecto}`}>↓</button>
                  </span>
                  <label className="msj-switch" title={c.visible ? 'Visible' : 'Oculto'}>
                    <input type="checkbox" checked={c.visible} disabled={!editable} onChange={(e) => cambiarCampo(c.clave, { visible: e.target.checked })} aria-label={`Mostrar ${c.etiqueta_defecto}`} />
                    <span className="msj-switch__pista" aria-hidden="true" />
                  </label>
                  <span className="msj-fila__texto">
                    <input className="msj-input msj-input--fila" value={c.etiqueta} disabled={!editable} maxLength={60} placeholder={c.etiqueta_defecto}
                      onChange={(e) => cambiarCampo(c.clave, { etiqueta: e.target.value })} aria-label={`Título de ${c.etiqueta_defecto}`} />
                    <span className="msj-sub">
                      {c.etiqueta === '' ? 'Sin título: solo el valor · ' : ''}Dato: {c.etiqueta_defecto}
                      {difiere(c) && <span className="msj-tag msj-tag--cambio">editado</span>}
                    </span>
                  </span>
                  <span className="msj-seg" role="group" aria-label={`Quién ve ${c.etiqueta_defecto}`}>
                    <button type="button" className={c.destino === 'proveedor' ? 'msj-seg__op is-on' : 'msj-seg__op'} aria-pressed={c.destino === 'proveedor'}
                      disabled={!editable || !c.permite_proveedor} onClick={() => cambiarCampo(c.clave, { destino: 'proveedor' })}
                      title={c.permite_proveedor ? 'Lo ve el proveedor y queda en la copia interna' : 'Dato interno: nunca se envía al proveedor'}>Proveedor</button>
                    <button type="button" className={c.destino === 'interno' ? 'msj-seg__op is-on' : 'msj-seg__op'} aria-pressed={c.destino === 'interno'}
                      disabled={!editable} onClick={() => cambiarCampo(c.clave, { destino: 'interno' })} title="Solo en la copia interna de Compras">Interno</button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
