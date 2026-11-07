import type {
  ContextoMotor,
  Correspondencia,
  Diccionario,
  ErrorCampo,
  Faltante,
  ResultadoMotor,
  Transformacion,
} from './tipos';
import { TRANSFORMACIONES_BASE } from './transformaciones';
import { escribirRuta, esVacio, leerRuta } from './utiles';
import { validar } from './validadores';

const NO_PROCESAR = new Set(['NO_APLICA', 'PENDIENTE_DOCUMENTACION']);

/**
 * Aplica un diccionario a un objeto de origen y arma el objeto de destino.
 *
 *   app_a_erp: lee `campoApp` de `datos`, y escribe `campoErp` en el payload que se enviará al ERP.
 *   erp_a_app: lee `campoErp` de `datos` (objeto ya normalizado del ERP), y escribe `campoApp`.
 *
 * Nunca lanza por datos incorrectos: todo problema se devuelve en `errores` (el dato de ESTE registro está mal)
 * o en `faltantes` (la organización debe configurar/confirmar algo). `ok` solo es true si ambas listas están vacías.
 */
export function aplicarDiccionario(
  datos: Record<string, unknown>,
  dic: Diccionario,
  ctx: ContextoMotor,
): ResultadoMotor {
  const payload: Record<string, unknown> = {};
  const errores: ErrorCampo[] = [];
  const faltantes: Faltante[] = [];
  const advertencias: string[] = [];
  const omitidos: { campo: string; motivo: string }[] = [];
  const registro: Record<string, Transformacion> = { ...TRANSFORMACIONES_BASE, ...(ctx.transformaciones ?? {}) };
  const haciaErp = dic.sentido === 'app_a_erp';

  for (const c of dic.correspondencias) {
    const origen = haciaErp ? c.campoApp : c.campoErp;
    const destino = haciaErp ? c.campoErp : c.campoApp;
    const nombre = destino ?? c.campoErp;
    const etiqueta = c.etiqueta ?? origen ?? c.campoErp;

    if (NO_PROCESAR.has(c.estado)) {
      omitidos.push({ campo: origen ?? nombre, motivo: c.estado === 'NO_APLICA' ? 'No aplica' : 'Pendiente de documentación' });
      continue;
    }
    if (destino === null) {
      omitidos.push({ campo: c.campoErp, motivo: 'No tiene campo de destino en este sentido' });
      continue;
    }

    let valor: unknown = origen ? leerRuta(datos, origen) : undefined;

    // Valor predeterminado: solo de la configuración de la organización o una constante documentada.
    if (esVacio(valor) && c.valorPredeterminado) {
      const vp = c.valorPredeterminado;
      const candidato = vp.origen === 'config' ? ctx.config[vp.clave] : vp.valor;
      if (esVacio(candidato)) {
        if (c.obligatorio) {
          faltantes.push({
            tipo: 'config',
            campo: nombre,
            clave: vp.origen === 'config' ? vp.clave : undefined,
            mensaje: vp.origen === 'config' ? vp.mensajeFaltante : `${etiqueta}: falta un valor`,
          });
        }
        continue;
      }
      valor = candidato;
      advertencias.push(`${etiqueta}: se tomó el valor predeterminado de la organización.`);
    } else {
      const pre = validar(valor, [...(c.validaciones ?? []), ...(c.obligatorio ? [{ tipo: 'obligatorio' as const }] : [])], etiqueta, 'pre');
      if (pre.length > 0) {
        // Un obligatorio aparece una sola vez aunque esté declarado en validaciones y en `obligatorio`.
        for (const m of [...new Set(pre)]) errores.push({ campo: nombre, mensaje: m });
        continue;
      }
    }

    if (esVacio(valor)) continue; // opcional y sin dato: no se envía

    // Transformaciones en cadena
    let actual = valor;
    let detenido = false;
    for (const paso of c.transformacion ?? []) {
      const fn = registro[paso.nombre];
      if (!fn) throw new Error(`Diccionario ${dic.id}: la transformación "${paso.nombre}" no existe`);
      const r = fn(actual, paso.params ?? {}, { ctx, campo: etiqueta });
      if (r.ok) {
        actual = r.valor;
      } else if ('faltante' in r) {
        faltantes.push({ ...r.faltante, campo: nombre });
        detenido = true;
        break;
      } else {
        errores.push({ campo: nombre, mensaje: r.error });
        detenido = true;
        break;
      }
    }
    if (detenido) continue;

    const post = validar(actual, c.validaciones, etiqueta, 'post');
    if (post.length > 0) {
      for (const m of post) errores.push({ campo: nombre, mensaje: m });
      continue;
    }

    if (actual !== null && actual !== undefined) escribirRuta(payload, destino, actual);
  }

  return { ok: errores.length === 0 && faltantes.length === 0, payload, errores, faltantes, advertencias, omitidos };
}

/** Comprueba que un diccionario esté bien armado (se usa en las pruebas, no en ejecución). */
export function validarDiccionario(dic: Diccionario, extra: Record<string, Transformacion> = {}): string[] {
  const problemas: string[] = [];
  const conocidas = new Set([...Object.keys(TRANSFORMACIONES_BASE), ...Object.keys(extra)]);
  const destinos = new Set<string>();
  const haciaErp = dic.sentido === 'app_a_erp';

  const revisar = (c: Correspondencia) => {
    const destino = haciaErp ? c.campoErp : c.campoApp;
    if (destino && !NO_PROCESAR.has(c.estado)) {
      if (destinos.has(destino)) problemas.push(`Destino repetido: ${destino}`);
      destinos.add(destino);
    }
    for (const p of c.transformacion ?? []) {
      if (!conocidas.has(p.nombre)) problemas.push(`${c.campoErp}: transformación desconocida "${p.nombre}"`);
    }
    if (c.estado === 'FALTA_EN_APP' && c.campoApp !== null) problemas.push(`${c.campoErp}: FALTA_EN_APP pero tiene campoApp`);
    if (c.estado === 'HOMOLOGADO' && c.campoApp === null && !c.valorPredeterminado) problemas.push(`${c.campoErp}: HOMOLOGADO sin origen`);
    if (c.obligatorio && c.campoApp === null && !c.valorPredeterminado && haciaErp && !NO_PROCESAR.has(c.estado)) {
      problemas.push(`${c.campoErp}: obligatorio sin origen ni valor predeterminado`);
    }
    for (const r of c.validaciones ?? []) {
      if (r.tipo === 'patron') {
        try {
          new RegExp(r.patron);
        } catch {
          problemas.push(`${c.campoErp}: patrón inválido`);
        }
      }
    }
  };
  dic.correspondencias.forEach(revisar);
  return problemas;
}
