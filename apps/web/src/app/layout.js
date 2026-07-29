import AntdProvider from '@/components/antd-provider';

export const metadata = {
  title: 'Construction ERP',
  description: 'Multi-tenant Construction Management Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}
