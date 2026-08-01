const CURRENCY_MARKER = /[$€£¥₩₹₽₺₫฿₱₴₦₲₵₡₸₼₾]/u;

export function formatMembershipPriceLabel(
  price: string,
  currencyCode: string | null | undefined
): string {
  const currency = currencyCode?.trim().toUpperCase();
  if (!currency || CURRENCY_MARKER.test(price)) return price;
  if (price.toUpperCase().includes(currency)) return price;
  return `${price} · ${currency}`;
}
