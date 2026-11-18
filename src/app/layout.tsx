import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = 'https://app.rubsax.com.br';
const SITE_TITLE =
  'Rubsax Transposer | Transpositor de Partituras Online (MuseScore e PDF)';
const SITE_DESCRIPTION =
  'Transpositor de partituras online profissional da Rubsax Partituras. Mude o tom de partituras (.mscz, .mscx, .xml) para Sax Alto, Sax Tenor, Trompete, Clarinete, Flauta, Violino e Piano e baixe em PDF com fidelidade total.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  keywords: [
    'transpositor de partituras',
    'transpor partitura online',
    'mudar tom de partitura',
    'rubsax transposer',
    'rubsax partituras',
    'transpor musescore',
    'partitura sax alto',
    'partitura trompete',
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: 'RUBSAX TRANSPOSER',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'Rubsax Transposer - Rubsax Partituras',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

const webAppStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RUBSAX TRANSPOSER',
  alternateName: 'Transpositor de Partituras Rubsax',
  url: SITE_URL,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'All',
  inLanguage: 'pt-BR',
  description:
    'Ferramenta online para transposição e edição de partituras nos formatos MuseScore e MusicXML.',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webAppStructuredData),
          }}
        />
      </body>
    </html>
  );
}
