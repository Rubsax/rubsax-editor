import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider, type InitialAuthPayload } from '@/components/AuthProvider';
import { resolveUserAccessSnapshot } from '@/lib/access';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings';
import { getServerSessionUser, isAdminEmail } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
        url: '/icon.png?v=2',
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
  verification: {
    google: 'igX2wWEErtY5EWJa6IBHMsk6nSGWUvJon8qiZWmT2uM',
  },
  icons: {
    icon: [
      { url: '/icon.png?v=2', type: 'image/png' },
      { url: '/favicon.ico?v=2', type: 'image/x-icon' },
    ],
    shortcut: '/icon.png?v=2',
    apple: '/icon.png?v=2',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let initialAuth: InitialAuthPayload = {
    user: null,
    isDev: false,
    accessLevel: 'preview',
    activeSubscription: null,
    activeSingleUnlocks: [],
    freePassStatus: null,
    settings: DEFAULT_APP_SETTINGS,
  };

  try {
    const user = await getServerSessionUser();
    const isDev = user ? isAdminEmail(user.email) : false;
    const snapshot = await resolveUserAccessSnapshot(user, null);

    initialAuth = {
      user,
      isDev,
      accessLevel: snapshot.access.level,
      activeSubscription: snapshot.activeSubscription,
      activeSingleUnlocks: snapshot.activeSingleUnlocks,
      freePassStatus: snapshot.freePassStatus,
      settings: {
        ...DEFAULT_APP_SETTINGS,
        pricing: snapshot.settings.pricing,
        paywall: snapshot.settings.paywall,
        announcement: snapshot.settings.announcement,
        operations: {
          ...DEFAULT_APP_SETTINGS.operations,
          maintenance_mode: snapshot.settings.operations.maintenance_mode,
          maintenance_message: snapshot.settings.operations.maintenance_message,
          monthly_pdf_fair_use_limit: snapshot.settings.operations.monthly_pdf_fair_use_limit,
        },
        support_links: snapshot.settings.support_links,
        tutorial: snapshot.settings.tutorial,
        free_pass: {
          ...DEFAULT_APP_SETTINGS.free_pass,
          enabled: snapshot.settings.free_pass.enabled,
          cooldown_days: snapshot.settings.free_pass.cooldown_days,
          unlock_hours: snapshot.settings.free_pass.unlock_hours,
          pdf_watermark_enabled: snapshot.settings.free_pass.pdf_watermark_enabled,
        },
      },
    };
  } catch {
    // Fallback seguro mantendo default não autenticado
  }

  return (
    <html lang="pt-BR" className="dark">
      <body className="antialiased min-h-screen bg-studio-950 text-zinc-100">
        <AuthProvider initialAuth={initialAuth}>{children}</AuthProvider>
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
