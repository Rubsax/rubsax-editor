import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rubsax Editor & Transposer | SaaS de Partituras MuseScore',
  description:
    'Transpositor inteligente de partituras (.mscz, .mscx, MusicXML) com fidelidade absoluta ao MuseScore 3, adaptação entre claves/instrumentos e exportação em PDF.',
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
