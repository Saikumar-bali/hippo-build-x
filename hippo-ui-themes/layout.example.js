import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="corporateBlue">{children}</ThemeProvider>
      </body>
    </html>
  );
}
