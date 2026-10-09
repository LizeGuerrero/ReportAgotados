'use client';

import { calcularFortaleza } from '@/lib/passwordRules';

// Las barras usan colores vivos; el texto usa un tono más oscuro del mismo
// color para mantener contraste AA sobre fondo blanco (el amarillo y el naranja
// vivos no lo cumplen como texto).
const COLORES = ['#dc2626', '#f97316', '#eab308', '#16a34a'];
const COLORES_TEXTO = ['var(--color-danger)', 'var(--color-warning)', 'var(--color-warning)', 'var(--color-success)'];
const ETIQUETAS = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte'];

export function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;

  const puntos = calcularFortaleza(password); // 0 a 4
  const nivel = Math.max(0, puntos - 1); // para indexar COLORES/ETIQUETAS (0 a 3)

  return (
    <div
      className="auth-strength"
      style={
        {
          '--strength-color': COLORES[nivel],
          '--strength-text': COLORES_TEXTO[nivel],
        } as React.CSSProperties
      }
    >
      <div className="auth-strength__bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={i <= nivel ? 'auth-strength__bar is-on' : 'auth-strength__bar'} />
        ))}
      </div>
      <span className="auth-strength__label" aria-live="polite">
        Seguridad: {ETIQUETAS[nivel]}
      </span>
    </div>
  );
}
