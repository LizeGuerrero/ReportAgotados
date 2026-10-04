/**
 * Envío del correo de invitación (solo servidor). Usa la API de Resend por fetch para no
 * agregar dependencias; si se prefiere otro proveedor/SMTP, solo hay que cambiar esta función.
 *
 * Variables de entorno (opcionales):
 *   RESEND_API_KEY  →  llave de la API
 *   MAIL_FROM       →  remitente verificado, p. ej. "Mi App <no-reply@midominio.com>"
 *
 * Si no están configuradas NO es un error: la invitación se crea igual y el administrador
 * puede copiar el enlace y enviarlo por su cuenta.
 */

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Para el asunto: sin saltos de línea (evita inyección de cabeceras).
const linea = (t: string) => t.replace(/[\r\n]+/g, ' ').trim();

interface Datos {
  para: string;
  organizacion: string;
  invitadoPor: string;
  enlace: string;
}

export async function enviarCorreoInvitacion(d: Datos): Promise<{ enviado: boolean; motivo?: string }> {
  const llave = process.env.RESEND_API_KEY;
  const remitente = process.env.MAIL_FROM;
  if (!llave || !remitente) {
    return { enviado: false, motivo: 'El envío por correo no está configurado. Copia el enlace y compártelo.' };
  }

  const org = escapar(d.organizacion);
  const quien = escapar(d.invitadoPor);
  const texto =
    `${d.invitadoPor} te invitó a unirte a ${d.organizacion}.\n\n` +
    `Acepta la invitación aquí (vence en 7 días y solo sirve para este correo):\n${d.enlace}\n`;
  const html =
    `<p>${quien} te invitó a unirte a <strong>${org}</strong>.</p>` +
    `<p><a href="${escapar(d.enlace)}">Aceptar la invitación</a></p>` +
    `<p style="color:#6b7280;font-size:13px">El enlace vence en 7 días y solo funciona con este correo. ` +
    `Si no esperabas esta invitación, ignora este mensaje.</p>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remitente,
        to: [d.para],
        subject: `Invitación a ${linea(d.organizacion)}`,
        html,
        text: texto,
      }),
    });
    if (!res.ok) {
      console.error('Error enviando invitación:', res.status, await res.text().catch(() => ''));
      return { enviado: false, motivo: 'No se pudo enviar el correo. Copia el enlace y compártelo.' };
    }
    return { enviado: true };
  } catch (err) {
    console.error('Error enviando invitación:', err);
    return { enviado: false, motivo: 'No se pudo enviar el correo. Copia el enlace y compártelo.' };
  }
}
