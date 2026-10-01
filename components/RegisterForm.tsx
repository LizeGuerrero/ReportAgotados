'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OPCIONES_PAIS, REGLAS_CELULAR, validarCelular, limpiarCelular } from '@/lib/phoneRules';
import { validarFortalezaPassword } from '@/lib/passwordRules';
import { PasswordStrengthBar } from './PasswordStrengthBar';
import { Field } from '@/components/ui/Field';
import { PasswordField } from '@/components/auth/PasswordField';
import { AlertIcon, ArrowLeftIcon, MailIcon } from '@/components/ui/icons';
import type { RegistroCorreoInput, TipoDocumento } from '@/types/auth.types';

interface Props {
  onVolver: () => void;
  onIrALogin: () => void;
}

const inicial: RegistroCorreoInput = {
  email: '',
  password: '',
  nombres: '',
  apellidos: '',
  username: '',
  tipo_documento: 'CC',
  numero_documento: '',
  codigo_pais: '+57',
  numero_celular: '',
};

export function RegisterForm({ onVolver, onIrALogin }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState<RegistroCorreoInput>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cuentaExistente, setCuentaExistente] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(false);

  function set<K extends keyof RegistroCorreoInput>(campo: K, valor: RegistroCorreoInput[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCuentaExistente(false);

    const errorPassword = validarFortalezaPassword(form.password);
    if (errorPassword) {
      setError(errorPassword);
      return;
    }

    const errorCelular = validarCelular(form.codigo_pais, form.numero_celular);
    if (errorCelular) {
      setError(errorCelular);
      return;
    }

    setCargando(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        // El trigger handle_new_user lee esto desde raw_user_meta_data
        // apenas se crea el usuario, SIN esperar a que confirme el correo.
        // Así no se pierden estos datos mientras espera el link de confirmación.
        data: {
          nombres: form.nombres,
          apellidos: form.apellidos,
          username: form.username,
          tipo_documento: form.tipo_documento,
          numero_documento: form.numero_documento,
          codigo_pais: form.codigo_pais,
          numero_celular: limpiarCelular(form.numero_celular),
        },
      },
    });

    if (signUpError) {
      // Supabase devuelve este mensaje cuando "Confirm email" está desactivado
      // y el correo ya tiene cuenta.
      const yaExiste = /already registered|already exists/i.test(signUpError.message);
      // El trigger rechaza el insert si el username ya existe (unique constraint),
      // y Supabase Auth lo reporta como un error genérico de base de datos.
      const usernameEnUso = /database error saving new user/i.test(signUpError.message);

      setError(
        yaExiste
          ? 'Ya existe una cuenta con este correo.'
          : usernameEnUso
          ? 'Ese nombre de usuario ya está en uso, elige otro.'
          : signUpError.message
      );
      setCuentaExistente(yaExiste);
      setCargando(false);
      return;
    }

    // Cuando "Confirm email" está activado, Supabase NO revela si el correo ya
    // existía (para evitar que cualquiera pueda "escanear" qué correos están
    // registrados). En ese caso, un usuario ya existente recibe un `user` con
    // `identities: []` en vez de un error explícito.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError('Ya existe una cuenta con este correo.');
      setCuentaExistente(true);
      setCargando(false);
      return;
    }

    // El trigger ya guardó todos los campos (perfil_completo incluido),
    // haya o no sesión activa todavía.
    if (!data.session) {
      setExito(true);
      setCargando(false);
      return;
    }

    router.replace('/');
    router.refresh();
  }

  if (exito) {
    return (
      <div className="auth-success" role="status">
        <span className="auth-success__icon">
          <MailIcon />
        </span>
        <p className="auth-success__title">¡Cuenta creada!</p>
        <p className="auth-success__text">
          Revisa tu correo para confirmar la cuenta.
          <br />
          <span className="auth-success__email">{form.email}</span>
        </p>
      </div>
    );
  }

  const digitosCelular = REGLAS_CELULAR[form.codigo_pais]?.digitos;

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <fieldset className="auth-section">
        <legend className="auth-section__title">Cuenta</legend>
        <Field id="reg-email" label="Correo electrónico">
          <input
            id="reg-email"
            type="email"
            className="ui-input"
            placeholder="nombre@empresa.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
        <PasswordField
          id="reg-password"
          label="Contraseña"
          value={form.password}
          onChange={(v) => set('password', v)}
          autoComplete="new-password"
          minLength={8}
          hint="Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo."
          extra={<PasswordStrengthBar password={form.password} />}
        />
      </fieldset>

      <fieldset className="auth-section">
        <legend className="auth-section__title">Datos personales</legend>
        <div className="auth-row auth-row--pair">
          <Field id="reg-nombres" label="Nombres">
            <input
              id="reg-nombres"
              type="text"
              className="ui-input"
              value={form.nombres}
              onChange={(e) => set('nombres', e.target.value)}
              autoComplete="given-name"
              required
            />
          </Field>
          <Field id="reg-apellidos" label="Apellidos">
            <input
              id="reg-apellidos"
              type="text"
              className="ui-input"
              value={form.apellidos}
              onChange={(e) => set('apellidos', e.target.value)}
              autoComplete="family-name"
              required
            />
          </Field>
        </div>
        <Field id="reg-username" label="Nombre de usuario">
          <input
            id="reg-username"
            type="text"
            className="ui-input"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
        <div className="auth-row auth-row--doc">
          <Field id="reg-tipo-doc" label="Tipo">
            <select
              id="reg-tipo-doc"
              className="ui-input"
              value={form.tipo_documento}
              onChange={(e) => set('tipo_documento', e.target.value as TipoDocumento)}
            >
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="TI">TI</option>
              <option value="PASAPORTE">Pasaporte</option>
              <option value="OTRO">Otro</option>
            </select>
          </Field>
          <Field id="reg-num-doc" label="Documento">
            <input
              id="reg-num-doc"
              type="text"
              className="ui-input"
              value={form.numero_documento}
              onChange={(e) => set('numero_documento', e.target.value)}
              inputMode="numeric"
              required
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="auth-section">
        <legend className="auth-section__title">Contacto</legend>
        <div className="auth-row auth-row--phone">
          <Field id="reg-pais" label="País">
            <select
              id="reg-pais"
              className="ui-input"
              value={form.codigo_pais}
              onChange={(e) => set('codigo_pais', e.target.value)}
            >
              {OPCIONES_PAIS.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.etiqueta}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="reg-celular"
            label="Número de celular"
            hint={digitosCelular ? `${digitosCelular} dígitos, sin el código de país.` : undefined}
          >
            <input
              id="reg-celular"
              type="tel"
              className="ui-input"
              value={form.numero_celular}
              onChange={(e) => set('numero_celular', e.target.value)}
              autoComplete="tel-national"
              aria-describedby={digitosCelular ? 'reg-celular-hint' : undefined}
              required
            />
          </Field>
        </div>
      </fieldset>

      {error && !cuentaExistente && (
        <div role="alert" className="ui-alert ui-alert--error">
          <AlertIcon className="ui-alert__icon" />
          <p>{error}</p>
        </div>
      )}
      {cuentaExistente && (
        <div role="alert" className="ui-alert ui-alert--error">
          <AlertIcon className="ui-alert__icon" />
          <p>
            Ya existe una cuenta con este correo.{' '}
            <button type="button" onClick={onIrALogin} className="ui-link">
              Inicia sesión
            </button>
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={cargando}
        aria-busy={cargando}
        className={`ui-btn ui-btn--primary ui-btn--block${cargando ? ' is-loading' : ''}`}
      >
        {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      <button type="button" onClick={onVolver} className="ui-btn ui-btn--ghost ui-btn--block">
        <ArrowLeftIcon />
        Otras opciones
      </button>
    </form>
  );
}
