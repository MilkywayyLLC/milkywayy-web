/** "4,000" — thousands separators, no decimals. */
export const formatNumber = (n: number) => Math.round(n).toLocaleString("en-US");

export const formatAED = (n: number) => `AED ${formatNumber(n)}`;

/** "$0.80", "$50" — cents only when the amount isn't whole. */
export const formatUSD = (n: number) => `$${Number.isInteger(n) ? formatNumber(n) : n.toFixed(2)}`;
