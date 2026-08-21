/**
 * Money, kept in ordinary code.
 *
 * A hard budget is only a rule if the two numbers being compared are in the same
 * unit. The traveller states a ceiling in their own currency; a provider quotes a
 * fare in whichever currency it likes. Comparing 6,000 with 4,980 without asking
 * what either means is exactly the class of mistake this product refuses to make,
 * so the translation is explicit, deterministic, and allowed to fail.
 *
 * These rates are indicative and are used for one purpose only: expressing a
 * personal spending ceiling in the currency a fare is quoted in. They never quote
 * a fare, never appear as a price to the traveller, and are never asked of a
 * language model.
 */

/** Units of each currency per 1 CNY. Indicative. */
const PER_CNY: Record<string, number> = {
  CNY: 1,
  USD: 0.14,
  EUR: 0.13,
  GBP: 0.11,
  JPY: 20.5,
  SGD: 0.185,
  AED: 0.51,
  HKD: 1.09,
  AUD: 0.21,
};

/** The currencies a traveller may state a budget in. */
export const SUPPORTED_CURRENCIES = Object.keys(PER_CNY);

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(PER_CNY, code.toUpperCase());
}

/**
 * Convert an amount between two currencies.
 *
 * Returns `null` when either side is unknown, so a caller has to decide what to
 * do about it rather than receiving a number that quietly means nothing.
 */
export function convertAmount(amount: number, from: string, to: string): number | null {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return amount;
  const rateFrom = PER_CNY[a];
  const rateTo = PER_CNY[b];
  if (!rateFrom || !rateTo) return null;
  // Via CNY, rounded to whole units: a ceiling does not need decimals, and a
  // fractional one only invites a floating-point argument at the boundary.
  return Math.round((amount / rateFrom) * rateTo);
}
