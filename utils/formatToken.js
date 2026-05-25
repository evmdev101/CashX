export function formatToken(value, options = {}) {
  const number = Number(value ?? 0);
  const maximumFractionDigits = options.maximumFractionDigits ?? (number >= 1_000_000 ? 2 : 4);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    notation: options.compact ? "compact" : "standard",
  }).format(Number.isFinite(number) ? number : 0);
}

export function formatUsd(value) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number) || number <= 0) return "$0";
  if (number < 0.01) return `$${number.toPrecision(3)}`;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: number >= 1 ? 2 : 6,
  }).format(number);
}

export function formatPercent(value, digits = 6) {
  const number = Number(value ?? 0);
  return `${(Number.isFinite(number) ? number : 0).toFixed(digits)}%`;
}
