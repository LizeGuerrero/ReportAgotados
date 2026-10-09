/**
 * Lectura y escritura de archivos para importar/exportar datos, SIN dependencias externas.
 *  - .xlsx : lector (zip + XML) y generador (para plantillas y reportes de errores)
 *  - .csv  : lector con detección de codificación (UTF-8 / Windows-1252) y de separador (; , tab)
 * Todo se lee como TEXTO: la validación de formato la hace la base de datos.
 */

export interface FilaArchivo {
  /** Número de fila en el archivo (la primera fila del archivo es la 1). */
  n: number;
  v: string[];
}

export interface Tabla {
  columnas: string[];
  filas: FilaArchivo[];
  hoja?: string;
}

export const MAX_FILAS = 20000;

export async function leerArchivo(file: File): Promise<Tabla> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith('.xls')) {
    throw new Error('El formato .xls (Excel antiguo) no es compatible: guárdalo como .xlsx o .csv.');
  }
  if (!nombre.endsWith('.xlsx') && !nombre.endsWith('.csv') && !nombre.endsWith('.txt')) {
    throw new Error('Usa un archivo .xlsx o .csv.');
  }
  const buf = await file.arrayBuffer();
  return nombre.endsWith('.xlsx') ? leerXlsx(buf) : leerCsv(buf);
}

/* ------------------------------------------------------------------ tabla */

function armarTabla(crudas: FilaArchivo[], hoja?: string): Tabla {
  const vacia = (f: FilaArchivo) => f.v.every((c) => c.trim() === '');
  const i = crudas.findIndex((f) => !vacia(f));
  if (i < 0) throw new Error('El archivo está vacío.');
  const cab = crudas[i].v.map((c) => c.trim());
  let ancho = cab.length;
  while (ancho > 0 && cab[ancho - 1] === '') ancho--; // columnas finales sin título
  if (ancho === 0) throw new Error('No se encontró la fila de títulos de columnas.');
  const columnas = cab.slice(0, ancho).map((c, k) => c || `Columna ${k + 1}`);

  const filas: FilaArchivo[] = [];
  for (const f of crudas.slice(i + 1)) {
    if (vacia(f)) continue;
    const v = columnas.map((_, k) => (f.v[k] ?? '').trim());
    filas.push({ n: f.n, v });
  }
  if (filas.length === 0) throw new Error('El archivo solo tiene los títulos: no hay filas con datos.');
  if (filas.length > MAX_FILAS) {
    throw new Error(`El archivo tiene ${filas.length} filas; el máximo por carga es ${MAX_FILAS}. Divídelo en varios.`);
  }
  return { columnas, filas, hoja };
}

/* -------------------------------------------------------------------- CSV */

export function leerCsv(buf: ArrayBuffer): Tabla {
  const bytes = new Uint8Array(buf);
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes); // CSV exportados por Excel/ERP en español
  }
  texto = texto.replace(/^\uFEFF/, '');
  const crudas = parseCsv(texto, detectarSeparador(texto));
  return armarTabla(crudas.map((v, i) => ({ n: i + 1, v })));
}

function detectarSeparador(t: string): string {
  const cuenta: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let comillas = false;
  for (const ch of t) {
    if (ch === '"') comillas = !comillas;
    else if (!comillas && (ch === '\n' || ch === '\r')) {
      if (Object.values(cuenta).some((x) => x > 0)) break; // ya se analizó la primera línea con contenido
    } else if (!comillas && ch in cuenta) cuenta[ch]++;
  }
  const mejor = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return mejor[1] > 0 ? mejor[0] : ',';
}

export function parseCsv(t: string, d: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let c = '';
  let enComillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (enComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          c += '"';
          i++;
        } else enComillas = false;
      } else c += ch;
    } else if (ch === '"' && c === '') enComillas = true;
    else if (ch === d) {
      fila.push(c);
      c = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      fila.push(c);
      c = '';
      filas.push(fila);
      fila = [];
    } else c += ch;
  }
  if (c !== '' || fila.length > 0) {
    fila.push(c);
    filas.push(fila);
  }
  return filas;
}

/* ------------------------------------------------------------ ZIP (lectura) */

interface EntradaZip {
  metodo: number;
  tamComp: number;
  offset: number;
}

function indexarZip(buf: ArrayBuffer): Map<string, EntradaZip> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (o está dañado).');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const mapa = new Map<string, EntradaZip>();
  for (let k = 0; k < total; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo .xlsx está dañado.');
    const metodo = dv.getUint16(p + 10, true);
    const tamComp = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const el = dv.getUint16(p + 30, true);
    const cl = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    mapa.set(nombre, { metodo, tamComp, offset });
    p += 46 + nl + el + cl;
  }
  return mapa;
}

async function extraer(buf: ArrayBuffer, e: EntradaZip): Promise<string> {
  const dv = new DataView(buf);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('El archivo .xlsx está dañado.');
  const nl = dv.getUint16(e.offset + 26, true);
  const el = dv.getUint16(e.offset + 28, true);
  const ini = e.offset + 30 + nl + el;
  const datos = new Uint8Array(buf, ini, e.tamComp);
  if (e.metodo === 0) return new TextDecoder().decode(datos);
  if (e.metodo === 8) {
    const flujo = new Blob([datos as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new TextDecoder().decode(await new Response(flujo).arrayBuffer());
  }
  throw new Error('El archivo .xlsx usa una compresión no compatible.');
}

/* ------------------------------------------------------------ XLSX (lectura) */

function decodeXml(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const attr = (tag: string, nombre: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${nombre.replace(':', '\\:')}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
};

function textosDe(xml: string): string {
  const limpio = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  for (const m of limpio.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) s += decodeXml(m[1]);
  return s;
}

function numeroTexto(v: string): string {
  const t = v.trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return t;
  if (/e/i.test(t)) return Number.isInteger(n) && Math.abs(n) < 1e21 ? BigInt(n).toString() : String(parseFloat(n.toPrecision(15)));
  return t.includes('.') ? String(parseFloat(n.toPrecision(15))) : t;
}

function columnaIndice(ref: string): number {
  const letras = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function leerXlsx(buf: ArrayBuffer): Promise<Tabla> {
  const zip = indexarZip(buf);
  const leer = async (nombre: string) => {
    const e = zip.get(nombre);
    return e ? extraer(buf, e) : null;
  };

  // hoja a leer: "Datos" si existe; si no, la primera visible
  const wb = await leer('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no parece un libro de Excel (.xlsx).');
  const rels = (await leer('xl/_rels/workbook.xml.rels')) ?? '';
  const destinos = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) destinos.set(id, target);
  }
  const hojas = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    nombre: attr(m[0], 'name') ?? '',
    rid: attr(m[0], 'r:id') ?? '',
    oculta: (attr(m[0], 'state') ?? 'visible') !== 'visible',
  }));
  const elegida = hojas.find((h) => h.nombre.toLowerCase() === 'datos') ?? hojas.find((h) => !h.oculta) ?? hojas[0];
  if (!elegida) throw new Error('El libro de Excel no tiene hojas.');
  const destino = destinos.get(elegida.rid) ?? 'worksheets/sheet1.xml';
  const ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`;
  const hojaXml = await leer(ruta);
  if (!hojaXml) throw new Error('No se pudo leer la hoja del libro de Excel.');

  const compartidas: string[] = [];
  const ss = await leer('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) compartidas.push(textosDe(m[1] ?? ''));

  const crudas: FilaArchivo[] = [];
  let auto = 0;
  for (const fm of hojaXml.matchAll(/<row\b([^>]*?)>([\s\S]*?)<\/row>/g)) {
    auto++;
    const n = parseInt(attr(fm[1], 'r') ?? '', 10) || auto;
    const v: string[] = [];
    for (const cm of fm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const col = ref ? columnaIndice(ref) : v.length;
      const tipo = attr(cm[1], 't') ?? 'n';
      const cuerpo = cm[2] ?? '';
      const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo);
      let valor = '';
      if (tipo === 'inlineStr') valor = textosDe(cuerpo);
      else if (vm) {
        const crudo = decodeXml(vm[1]);
        if (tipo === 's') valor = compartidas[parseInt(crudo, 10)] ?? '';
        else if (tipo === 'str') valor = crudo;
        else if (tipo === 'b') valor = crudo === '1' ? 'TRUE' : 'FALSE';
        else if (tipo === 'e') valor = '';
        else valor = numeroTexto(crudo);
      }
      while (v.length < col) v.push('');
      v[col] = valor;
    }
    crudas.push({ n, v });
  }
  return armarTabla(crudas, elegida.nombre);
}

/* ---------------------------------------------------------- XLSX (escritura) */

export interface HojaXlsx {
  nombre: string;
  /** La primera fila se escribe como encabezado (negrita). */
  filas: (string | number)[][];
  /** Columnas (0-based) que deben quedar como TEXTO para no perder ceros a la izquierda. */
  textoCols?: number[];
  anchos?: number[];
}

const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const letraColumna = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xmlHoja(h: HojaXlsx): string {
  const texto = new Set(h.textoCols ?? []);
  const cols = (h.anchos ?? [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${texto.has(i) ? ' style="1"' : ''}/>`)
    .join('');
  const filas = h.filas
    .map((fila, r) => {
      const celdas = fila
        .map((v, c) => {
          const ref = `${letraColumna(c)}${r + 1}`;
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          if (v === '') return '';
          const s = r === 0 ? 2 : texto.has(c) ? 1 : 0;
          return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${filas}</sheetData></worksheet>`;
}

const ESTILOS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

export function crearXlsx(hojas: HojaXlsx[]): Uint8Array {
  const enc = new TextEncoder();
  const archivos: { nombre: string; datos: Uint8Array }[] = [
    {
      nombre: '[Content_Types].xml',
      datos: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
          '</Types>',
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: enc.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
          hojas.map((h, i) => `<sheet name="${esc(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
          '</sheets></workbook>',
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
          `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    { nombre: 'xl/styles.xml', datos: enc.encode(ESTILOS) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: enc.encode(xmlHoja(h)) })),
  ];
  return zipSinCompresion(archivos);
}

let tablaCrc: Uint32Array | null = null;
function crc32(datos: Uint8Array): number {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tablaCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = tablaCrc[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipSinCompresion(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0x0021, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, a.datos.length, true);
    lh.setUint32(22, a.datos.length, true);
    lh.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(lh.buffer), nombre, a.datos);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(14, 0x0021, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, a.datos.length, true);
    ch.setUint32(24, a.datos.length, true);
    ch.setUint16(28, nombre.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todo) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

/** Descarga un archivo generado en el navegador. */
export function descargar(datos: Uint8Array, nombre: string) {
  const blob = new Blob([datos as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
