/** Store sections the list is grouped by, in a typical walk through the store. */
export const STORE_SECTIONS = [
  { id: "produce", name: "Produce", sortOrder: 10 },
  { id: "bakery", name: "Bakery", sortOrder: 20 },
  { id: "meat-seafood", name: "Meat & seafood", sortOrder: 30 },
  { id: "dairy-eggs", name: "Dairy & eggs", sortOrder: 40 },
  { id: "deli", name: "Deli", sortOrder: 50 },
  { id: "pantry", name: "Pantry", sortOrder: 60 },
  { id: "canned-jarred", name: "Canned & jarred", sortOrder: 70 },
  { id: "spices", name: "Spices & seasonings", sortOrder: 80 },
  { id: "condiments", name: "Condiments & sauces", sortOrder: 90 },
  { id: "international", name: "International", sortOrder: 100 },
  { id: "frozen", name: "Frozen", sortOrder: 110 },
  { id: "snacks", name: "Snacks", sortOrder: 120 },
  { id: "beverages", name: "Beverages", sortOrder: 130 },
  { id: "household", name: "Household", sortOrder: 140 },
  { id: "other", name: "Other", sortOrder: 999 },
] as const

export type StoreSectionId = (typeof STORE_SECTIONS)[number]["id"]

export const STORE_SECTION_IDS = STORE_SECTIONS.map((s) => s.id) as [
  StoreSectionId,
  ...StoreSectionId[],
]
