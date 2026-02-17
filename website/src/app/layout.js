import "./globals.css";
import Nav from "@/components/Nav";
import { Signika } from 'next/font/google';

const signika = Signika({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-signika',
});

export const metadata = {
  title: "MarketLogger - Live Stocks",
  description: "Real-time stock monitoring with WebSocket",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={signika.variable}>
      <body className="bg-black text-white min-h-screen font-sans">
        <Nav />
        <main className="min-h-screen p-4 pt-16">
          {children}
        </main>
      </body>
    </html>
  );
}
