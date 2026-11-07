import type { Diccionario } from './tipos';

const celda = (s: unknown) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Genera la matriz de homologación en Markdown a partir del diccionario implementado, de modo que la
 * documentación nunca se desfase del código.
 */
export function diccionarioAMarkdown(dic: Diccionario): string {
  const filas = dic.correspondencias.map((c) => {
    const trans = (c.transformacion ?? []).map((p) => p.nombre).join(' → ');
    const pred = c.valorPredeterminado
      ? c.valorPredeterminado.origen === 'config'
        ? `config:${c.valorPredeterminado.clave}`
        : `const:${JSON.stringify(c.valorPredeterminado.valor)}`
      : '';
    return [
      c.campoApp,
      c.origenApp,
      c.campoErp,
      c.tipoApp,
      c.tipoErp,
      c.obligatorio ? (c.confirmado ? 'Sí' : 'Sí (según prosa, sin confirmar)') : 'No',
      trans,
      pred,
      c.estado,
      c.propietario,
      c.observaciones,
    ]
      .map(celda)
      .join(' | ');
  });
  return [
    `### ${dic.id} (v${dic.version}) — ${dic.sentido} — ${dic.endpoint}`,
    '',
    '| Campo app | Origen | Campo ERP | Tipo app | Tipo ERP | Obligatorio | Transformación | Predeterminado | Estado | Propietario | Observaciones |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...filas.map((f) => `| ${f} |`),
    '',
  ].join('\n');
}
