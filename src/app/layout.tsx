import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RUBSAX TRANSPOSER v1.0 | Transpositor de Partituras',
  description:
    'Transposição precisa com fidelidade original • Formatos aceitos: .mscz, .mscx, .xml',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased min-h-screen bg-studio-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
