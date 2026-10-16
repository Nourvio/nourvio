/**
 * What common baking ingredients weigh, in grams per US cup (236.6 ml).
 * Dry goods use the spoon-and-level weights bakers go by (all-purpose flour
 * is 120 g, not USDA's 125); liquids use their density. More specific names
 * come first: "brown sugar" before "sugar", "peanut butter" before "butter".
 */
const GRAMS_PER_CUP: [RegExp, number][] = [
  // Flours and starches
  [/\b(almond flour|almond meal)\b/, 96],
  [/\bwhole[- ]wheat flour\b/, 113],
  [/\b(cake|pastry) flour\b/, 114],
  [/\brye flour\b/, 106],
  [/\bcoconut flour\b/, 112],
  [/\bcornmeal\b/, 138],
  [/\b(cornstarch|corn starch)\b/, 112],
  [/\bflour\b/, 120],
  // Sugars and syrups
  [/\b(powdered|confectioners'?|icing) sugar\b/, 113],
  [/\b(brown|muscovado) sugar\b/, 213],
  [/\bsugar\b/, 198],
  [/\bhoney\b/, 336],
  [/\bmaple syrup\b/, 315],
  [/\bmolasses\b/, 337],
  [/\bcorn syrup\b/, 328],
  // Leaveners, salt and flavorings
  [/\bbaking soda\b/, 288],
  [/\bbaking powder\b/, 192],
  [/\byeast\b/, 149],
  [/\bmorton\b.*\bkosher salt\b|\bkosher salt\b.*\bmorton\b/, 230],
  // Diamond Crystal, which most American recipes with "kosher salt" mean.
  [/\bkosher salt\b/, 135],
  [/\b(flaky|sea) salt\b/, 160],
  [/\bsalt\b/, 292],
  [/\bvanilla( extract)?\b/, 202],
  [/\bcinnamon\b/, 125],
  [/\b(cocoa|cacao) powder\b|\bcocoa\b/, 85],
  // Dairy and fats
  [/\bpeanut butter\b/, 270],
  [/\bcream cheese\b/, 232],
  [/\bsour cream\b/, 230],
  [/\b(greek )?yogh?urt\b/, 245],
  [/\bbuttermilk\b/, 242],
  [
    /\b(heavy|whipping|double|light|single) cream\b|\bhalf[- ]and[- ]half\b/,
    238,
  ],
  [/\bcoconut milk\b/, 240],
  [/\bmilk\b/, 242],
  [/\bbutter\b/, 227],
  [/\b(olive|vegetable|canola|sunflower|avocado|coconut) oil\b|\boil\b/, 218],
  [/\bmayonnaise\b|\bmayo\b/, 220],
  [/\bwater\b/, 237],
  // Mix-ins and grains
  [/\b(rolled|old[- ]fashioned|quick) oats\b|\boats\b/, 90],
  [/\bchocolate chips?\b|\bchocolate chunks?\b/, 170],
  [/\b(walnuts?|pecans?)\b/, 113],
  [/\braisins?\b/, 145],
  [/\b(shredded|desiccated|flaked) coconut\b/, 85],
  [/\bpanko\b/, 50],
  [/\b(bread ?crumbs?)\b/, 112],
  [/\b(grated )?parmesan\b/, 100],
  [
    /\bshredded (cheddar|mozzarella|cheese)\b|\b(cheddar|mozzarella), shredded\b/,
    113,
  ],
  [/\b(white |long[- ]grain |basmati |jasmine )?rice\b/, 190],
]

const ML_PER_CUP = 236.588

/**
 * Grams per millilitre for a baking staple ("all-purpose flour", "packed
 * light brown sugar"), or null when it isn't one we know.
 */
export function bakingDensity(food: string): number | null {
  const name = food.toLowerCase()
  // "cooked rice" or "melted chocolate chips" aren't what's weighed here.
  if (/\b(cooked|melted|whipped)\b/.test(name)) return null
  const found = GRAMS_PER_CUP.find(([pattern]) => pattern.test(name))
  return found ? found[1] / ML_PER_CUP : null
}

/**
 * Liquids, which metric recipes measure by volume even though they could
 * be weighed. Not "cream cheese" or "sour cream", which are weighed.
 */
const LIQUID =
  /\b(water|milk|buttermilk|(heavy|whipping|double|light|single) cream|half[- ]and[- ]half|oil|stock|broth|juice|wine|vinegar)\b/

export function isLiquid(food: string): boolean {
  return LIQUID.test(food.toLowerCase())
}

/** A stick of butter. */
export const STICK_OF_BUTTER_GRAMS = 113
