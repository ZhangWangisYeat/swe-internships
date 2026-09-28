import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Fully static output: no server, no cold starts, deployable to any host.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  // Trailing slashes keep static hosts (GitHub Pages) resolving routes correctly.
  trailingSlash: true,
};

export default nextConfig;
