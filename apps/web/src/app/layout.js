import './globals.css';

export const metadata = {
  title: 'Construction ERP',
  description: 'Multi-tenant Construction ERP Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
