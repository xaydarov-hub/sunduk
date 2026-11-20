/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,
  images: { unoptimized: true },
  // Ishlab chiqarishda statik sayt (out/) chiqaramiz — Firebase Hosting'ga joylanadi
  ...(isDev ? { distDir: '.next-dev' } : { output: 'export' }),
};

module.exports = nextConfig;
