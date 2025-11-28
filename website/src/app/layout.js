import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { Signika } from 'next/font/google';

const signika = Signika({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-signika',
});

export const metadata = {
  title: "MarketLogger Dashboard",
  description: "Grid Trading Bot Analytics Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={signika.variable}>
      <body className="bg-black text-white min-h-screen font-sans">
        <Sidebar />
        <main className="lg:ml-64 min-h-screen p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8">
          {children}
        </main>
      </body>
    </html>
  );
}
