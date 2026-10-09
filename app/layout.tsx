import type { Metadata } from 'next';
import { BfcacheGuard } from '@/components/BfcacheGuard';
import { APP_NAME } from '@/lib/brand';
import '@/styles/tokens.css';
import '@/styles/ui.css';
import '@/styles/auth.css';
import '@/styles/app.css';
import '@/styles/agotados.css';
import '@/styles/organizaciones.css';
import '@/styles/modulos.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
};

// Fija el tema antes de pintar para que no haya parpadeo: lo guardado por la persona
// ("tema" en localStorage) o, si no hay nada, la preferencia del sistema.
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('tema');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <BfcacheGuard />
        {children}
      </body>
    </html>
  );
}
