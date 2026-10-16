// Stores a household can split its list by, offered for its country. Any
// other store works too, by name. Store connections (Kroger, link-only
// stores) build on these keys later.

export type Store = {
  /** A stable key: "kroger", "tesco". */
  key: string
  name: string
  /** ISO 3166 countries it's offered in. */
  countries: readonly string[]
}

export const STORES: readonly Store[] = [
  // United States
  { key: "kroger", name: "Kroger", countries: ["US"] },
  { key: "walmart", name: "Walmart", countries: ["US", "CA"] },
  { key: "costco", name: "Costco", countries: ["US", "CA", "GB", "AU"] },
  { key: "target", name: "Target", countries: ["US"] },
  { key: "trader-joes", name: "Trader Joe's", countries: ["US"] },
  { key: "whole-foods", name: "Whole Foods", countries: ["US"] },
  { key: "publix", name: "Publix", countries: ["US"] },
  { key: "safeway", name: "Safeway", countries: ["US"] },
  { key: "heb", name: "H-E-B", countries: ["US"] },
  { key: "wegmans", name: "Wegmans", countries: ["US"] },
  { key: "sams-club", name: "Sam's Club", countries: ["US"] },
  // Canada
  { key: "loblaws", name: "Loblaws", countries: ["CA"] },
  { key: "no-frills", name: "No Frills", countries: ["CA"] },
  { key: "superstore", name: "Real Canadian Superstore", countries: ["CA"] },
  { key: "sobeys", name: "Sobeys", countries: ["CA"] },
  { key: "metro", name: "Metro", countries: ["CA"] },
  // Britain and Ireland
  { key: "tesco", name: "Tesco", countries: ["GB", "IE"] },
  { key: "sainsburys", name: "Sainsbury's", countries: ["GB"] },
  { key: "asda", name: "Asda", countries: ["GB"] },
  { key: "morrisons", name: "Morrisons", countries: ["GB"] },
  { key: "waitrose", name: "Waitrose", countries: ["GB"] },
  { key: "co-op", name: "Co-op", countries: ["GB"] },
  { key: "marks-and-spencer", name: "M&S", countries: ["GB"] },
  { key: "ocado", name: "Ocado", countries: ["GB"] },
  { key: "dunnes", name: "Dunnes Stores", countries: ["IE"] },
  { key: "supervalu", name: "SuperValu", countries: ["IE"] },
  // Australia and New Zealand
  { key: "woolworths", name: "Woolworths", countries: ["AU", "NZ"] },
  { key: "coles", name: "Coles", countries: ["AU"] },
  { key: "iga", name: "IGA", countries: ["AU"] },
  { key: "new-world", name: "New World", countries: ["NZ"] },
  { key: "paknsave", name: "PAK'nSAVE", countries: ["NZ"] },
  // Across Europe and beyond
  { key: "aldi", name: "Aldi", countries: ["US", "GB", "IE", "AU", "DE"] },
  { key: "lidl", name: "Lidl", countries: ["US", "GB", "IE", "DE"] },
]

export const STORES_BY_KEY: ReadonlyMap<string, Store> = new Map(
  STORES.map((store) => [store.key, store])
)

/**
 * The stores offered for a country, by name: every one Merran knows when
 * the household hasn't said its country, none for a country it has no
 * stores for (any store can still be named).
 */
export function storesFor(country: string | null | undefined) {
  const code = country?.toUpperCase()
  return STORES.filter((store) => !code || store.countries.includes(code))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
}
