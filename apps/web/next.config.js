/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['antd', '@ant-design/icons', '@hippo/shared', '@hippo/rbac'],
  serverExternalPackages: ['@hippo/db', 'postgres'],
};

export default nextConfig;
