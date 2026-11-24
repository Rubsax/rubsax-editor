import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: 'https://app.rubsax.com.br',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://app.rubsax.com.br/planos',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://app.rubsax.com.br/ajuda',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://app.rubsax.com.br/privacidade',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://app.rubsax.com.br/termos',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
