import type { Metadata } from 'next';
import { BfcacheGuard } from '@/components/BfcacheGuard';
import { APP_NAME } from '@/lib/brand';
import '@/styles/tokens.css';
import '@/styles/ui.css';
import '@/styles/auth.css';
import '@/styles/app.css';
import '@/styles/agotados.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <BfcacheGuard />
        {children}
      </body>
    </html>
  );
}
