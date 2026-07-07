"use client";

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-black/10 bg-[#fcfcfb] p-5 dark:border-white/10 dark:bg-[#1a1a19] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-[#0b0b0b] dark:text-white">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const BADGE_STYLES = {
  good: "bg-[#0ca30c]/10 text-[#006300] dark:bg-[#0ca30c]/15 dark:text-[#0ca30c]",
  warning: "bg-[#fab219]/15 text-[#8a5a00] dark:bg-[#fab219]/15 dark:text-[#fab219]",
  critical: "bg-[#d03b3b]/10 text-[#d03b3b] dark:bg-[#d03b3b]/15 dark:text-[#e66767]",
  neutral: "bg-black/5 text-[#52514e] dark:bg-white/10 dark:text-[#c3c2b7]",
};

export function Badge({ status = "neutral", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_STYLES[status]}`}>
      {children}
    </span>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-[#2a78d6] text-white hover:bg-[#256abf] dark:bg-[#3987e5] dark:hover:bg-[#2a78d6]",
    danger: "bg-[#d03b3b] text-white hover:bg-[#b93333]",
    ghost: "border border-black/10 text-[#0b0b0b] hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10",
  };
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm text-[#0b0b0b] outline-none placeholder:text-[#898781] focus:border-[#2a78d6] dark:border-white/10 dark:text-white ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full rounded-md border border-black/10 bg-[#fcfcfb] px-2.5 py-1.5 text-sm text-[#0b0b0b] outline-none focus:border-[#2a78d6] dark:border-white/10 dark:bg-[#1a1a19] dark:text-white ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }) {
  return (
    <textarea
      className={`w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm text-[#0b0b0b] outline-none placeholder:text-[#898781] focus:border-[#2a78d6] dark:border-white/10 dark:text-white ${className}`}
      {...props}
    />
  );
}

export function EmptyState({ children }) {
  return <p className="py-8 text-center text-sm text-[#898781]">{children}</p>;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md bg-[#d03b3b]/10 px-3 py-2 text-sm text-[#d03b3b] dark:bg-[#d03b3b]/15 dark:text-[#e66767]">
      {message}
    </div>
  );
}

export function StatTile({ label, value, sub, tone = "default" }) {
  const toneClass = tone === "good" ? "text-[#006300] dark:text-[#0ca30c]" : tone === "bad" ? "text-[#d03b3b] dark:text-[#e66767]" : "text-[#0b0b0b] dark:text-white";
  return (
    <div className="rounded-lg border border-black/10 bg-[#fcfcfb] p-4 dark:border-white/10 dark:bg-[#1a1a19]">
      <p className="text-xs text-[#898781]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#898781]">{sub}</p>}
    </div>
  );
}
