interface ReglaPais {
  nombre: string;
  digitos: number;
}

export const REGLAS_CELULAR: Record<string, ReglaPais> = {
  '+57': { nombre: 'Colombia', digitos: 10 },
  '+52': { nombre: 'México', digitos: 10 },
  '+1': { nombre: 'USA / Canadá', digitos: 10 },
  '+51': { nombre: 'Perú', digitos: 9 },
  '+54': { nombre: 'Argentina', digitos: 10 },
  '+56': { nombre: 'Chile', digitos: 9 },
};

export function validarCelular(codigoPais: string, numero: string): string | null {
  const regla = REGLAS_CELULAR[codigoPais];
  if (!regla) return 'Código de país no soportado';

  const soloDigitos = numero.replace(/\D/g, '');
  if (soloDigitos.length !== regla.digitos) {
    return `El número para ${regla.nombre} debe tener ${regla.digitos} dígitos`;
  }
  return null;
}

/** Deja solo dígitos. Úsalo antes de guardar, nunca guardes el valor "crudo" del input. */
export function limpiarCelular(numero: string): string {
  return numero.replace(/\D/g, '');
}

export const OPCIONES_PAIS = Object.entries(REGLAS_CELULAR).map(([codigo, r]) => ({
  codigo,
  etiqueta: `${r.nombre} (${codigo})`,
}));
