/**
 * Copiar una tabla al portapapeles CON formato.
 *
 * Al pegar en Excel, Google Sheets, Word u Outlook, el portapapeles ofrece la
 * versión que mejor entienda cada programa: text/html (tabla con celdas y
 * bordes) o text/plain (TSV: columnas separadas por tabulador). Seleccionar el
 * texto con el mouse solo entrega texto plano, por eso se perdía la estructura.
 */

export interface ContenidoCopia {
  html: string;
  texto: string;
}

function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Con `encabezados` vacío se copian solo los datos (como al copiar un rango en Excel). */
export function construirTablaCopia(encabezados: string[], filas: string[][]): ContenidoCopia {
  const conEncabezados = encabezados.length > 0;
  const th = encabezados
    .map(
      (h) =>
        `<th style="background:#f3f4f6;font-weight:bold;text-align:left;vertical-align:top">${escaparHtml(h)}</th>`,
    )
    .join('');

  const cuerpo = filas
    .map(
      (fila) =>
        '<tr>' +
        fila
          .map((c) => `<td style="vertical-align:top">${escaparHtml(c).replace(/\r?\n/g, '<br>')}</td>`)
          .join('') +
        '</tr>',
    )
    .join('');

  const html =
    '<table border="1" cellspacing="0" cellpadding="4" ' +
    'style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px">' +
    `${conEncabezados ? `<thead><tr>${th}</tr></thead>` : ''}<tbody>${cuerpo}</tbody></table>`;

  // En TSV un salto de línea o tabulador dentro de una celda partiría la fila.
  const limpiar = (c: string) => c.replace(/[\t\r\n]+/g, ' ');
  const texto = (conEncabezados ? [encabezados, ...filas] : filas).map((f) => f.map(limpiar).join('\t')).join('\n');

  return { html, texto };
}

/** Método de respaldo (http sin permiso de portapapeles, navegadores antiguos). */
function copiarConEventoCopy({ html, texto }: ContenidoCopia) {
  const alCopiar = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData('text/html', html);
    e.clipboardData?.setData('text/plain', texto);
  };
  document.addEventListener('copy', alCopiar);
  try {
    if (!document.execCommand('copy')) throw new Error('El navegador bloqueó el copiado');
  } finally {
    document.removeEventListener('copy', alCopiar);
  }
}

/**
 * Recibe una promesa (no el contenido ya armado) para poder iniciar la
 * escritura dentro del clic del usuario aunque armar el contenido tarde
 * (p. ej. "copiar todo" pide varias páginas al servidor). Safari y Chrome
 * exigen que clipboard.write() se invoque durante el gesto.
 */
export async function copiarAlPortapapeles(contenido: Promise<ContenidoCopia>): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': contenido.then((c) => new Blob([c.html], { type: 'text/html' })),
          'text/plain': contenido.then((c) => new Blob([c.texto], { type: 'text/plain' })),
        }),
      ]);
      return;
    } catch {
      // cae al método de respaldo
    }
  }
  copiarConEventoCopy(await contenido);
}
