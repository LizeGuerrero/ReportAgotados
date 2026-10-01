// Espejo de las reglas activadas en Supabase (Authentication → Providers →
// Email → Password Requirements). Si cambias una, cambia la otra: esto es
// solo para dar feedback rápido en el formulario; la regla real y que no se
// puede saltar vive en Supabase.

const SIMBOLOS = `!@#$%^&*()_+\\-=\\[\\]{};'\\:"|<>?,./\`~`;

export function validarFortalezaPassword(password: string): string | null {
  if (password.length < 8) {
    return 'Debe tener al menos 8 caracteres.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Debe incluir al menos una letra minúscula.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Debe incluir al menos una letra mayúscula.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Debe incluir al menos un número.';
  }
  if (!new RegExp(`[${SIMBOLOS}]`).test(password)) {
    return 'Debe incluir al menos un símbolo (ej: ! @ # $ %).';
  }
  return null; // válida
}

/** Para una barra de fortaleza visual: 0 (muy débil) a 4 (fuerte). */
export function calcularFortaleza(password: string): number {
  let puntos = 0;
  if (password.length >= 8) puntos++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) puntos++;
  if (/[0-9]/.test(password)) puntos++;
  if (new RegExp(`[${SIMBOLOS}]`).test(password)) puntos++;
  return puntos;
}
