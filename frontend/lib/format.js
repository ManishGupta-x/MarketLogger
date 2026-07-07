export function formatINR(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export function formatPct(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
