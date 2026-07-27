/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@hippo/shared', '@hippo/rbac'],
  reactStrictMode: true,
};

export default nextConfig;
