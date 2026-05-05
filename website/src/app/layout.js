import "./globals.css";
import Nav from "@/components/Nav";
import ToastProvider from "@/components/ToastProvider";
import OrderNotifications from "@/components/OrderNotifications";
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
        <main className="min-h-screen p-3 pt-14 md:p-4 md:pt-16">
          {children}
        </main>
        <ToastProvider />
        <OrderNotifications />
      </body>
    </html>
  );
}
