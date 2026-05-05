export const metadata = {
  title: 'Premium Calc - MarketLogger',
};

export default function PremiumCalcPage() {
  return (
    <div className="-m-3 -mt-14 md:-m-4 md:-mt-16 h-screen">
      <iframe
        src="/premium-calc.html"
        className="w-full h-full border-0 pt-14 md:pt-16"
        title="Nifty Options P&L Calculator"
      />
    </div>
  );
}
