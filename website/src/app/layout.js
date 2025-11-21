import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata = {
  title: "MarketLogger Dashboard",
  description: "Grid Trading Bot Analytics Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen">
        <Sidebar />
        <main className="ml-64 min-h-screen p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
