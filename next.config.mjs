/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@xmldom/xmldom', 'jszip'],
  },
};

export default nextConfig;
