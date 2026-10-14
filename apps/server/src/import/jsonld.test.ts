import { describe, expect, test } from "vitest"

import { cleanText, extractRecipeFromHtml, parseDuration } from "./jsonld.ts"

function page(...blocks: unknown[]) {
  const scripts = blocks
    .map(
      (block) =>
        `<script type="application/ld+json">${typeof block === "string" ? block : JSON.stringify(block)}</script>`
    )
    .join("\n")
  return `<!doctype html><html><head>${scripts}</head><body><h1>Hi</h1></body></html>`
}

// Shaped like WordPress Recipe Maker output, which a lot of food blogs use.
const WPRM = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Some Blog" },
    { "@type": "WebPage", "@id": "https://blog.example/#webpage" },
    {
      "@type": "Recipe",
      name: "Mom&#39;s Chicken &amp; Rice",
      description: "<p>Cozy, <strong>one-pan</strong> dinner.</p>",
      image: [
        { "@type": "ImageObject", url: "/wp-content/uploads/chicken.jpg" },
      ],
      recipeYield: ["4", "4 servings"],
      prepTime: "PT15M",
      cookTime: "PT45M",
      totalTime: "PT1H",
      recipeCategory: ["Main Course"],
      recipeCuisine: "American",
      keywords: "chicken, rice, one pan, Chicken, web",
      recipeIngredient: [
        "1 ½ lb chicken thighs",
        "1 cup long-grain rice",
        "2&nbsp;cups chicken stock",
      ],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Prep",
          itemListElement: [
            { "@type": "HowToStep", text: "Season the chicken." },
          ],
        },
        {
          "@type": "HowToSection",
          name: "Cook",
          itemListElement: [
            { "@type": "HowToStep", text: "Brown the chicken." },
            { "@type": "HowToStep", text: "Add rice &amp; stock; simmer." },
          ],
        },
      ],
      nutrition: {
        "@type": "NutritionInformation",
        calories: "540 kcal",
        proteinContent: "38 g",
        sodiumContent: "820 mg",
      },
    },
  ],
}

describe("extractRecipeFromHtml", () => {
  test("reads a recipe out of an @graph with sections and nutrition", () => {
    const result = extractRecipeFromHtml(
      page(WPRM),
      "https://blog.example/chicken-rice/"
    )
    expect(result).not.toBeNull()
    const { input, imageUrl } = result!
    expect(input.name).toBe("Mom's Chicken & Rice")
    expect(input.description).toBe("Cozy, one-pan dinner.")
    expect(input.servings).toBe(4)
    expect(input.yieldText).toBeNull()
    expect(input.prepMinutes).toBe(15)
    expect(input.cookMinutes).toBe(45)
    expect(input.totalMinutes).toBe(60)
    expect(input.tags).toEqual([
      "main course",
      "american",
      "chicken",
      "rice",
      "one pan",
    ])
    expect(input.ingredients).toEqual([
      "1 ½ lb chicken thighs",
      "1 cup long-grain rice",
      "2 cups chicken stock",
    ])
    expect(input.steps).toEqual([
      "# Prep",
      "Season the chicken.",
      "# Cook",
      "Brown the chicken.",
      "Add rice & stock; simmer.",
    ])
    expect(input.nutrition).toMatchObject({
      calories: 540,
      protein: 38,
      sodium: 820,
      fat: null,
      source: "site",
    })
    expect(input.sourceUrl).toBe("https://blog.example/chicken-rice/")
    expect(imageUrl).toBe("https://blog.example/wp-content/uploads/chicken.jpg")
  })

  test("handles plain string instructions and a yield with a unit", () => {
    const result = extractRecipeFromHtml(
      page({
        "@context": "https://schema.org",
        "@type": ["Recipe"],
        name: "Chocolate Chip Cookies",
        recipeYield: "24 cookies",
        cookTime: "PT10M",
        prepTime: "PT20M",
        image: "https://cdn.example/cookies.jpg",
        recipeIngredient: ["2 cups flour", "1 cup chocolate chips"],
        recipeInstructions: "Mix everything.\nScoop onto a sheet.\n\nBake.",
      }),
      "https://example.com/cookies"
    )!
    expect(result.input.servings).toBe(24)
    expect(result.input.yieldText).toBe("24 cookies")
    expect(result.input.totalMinutes).toBe(30)
    expect(result.input.steps).toEqual([
      "Mix everything.",
      "Scoop onto a sheet.",
      "Bake.",
    ])
    expect(result.imageUrl).toBe("https://cdn.example/cookies.jpg")
  })

  test("skips other JSON-LD blocks and tolerates trailing commas", () => {
    const result = extractRecipeFromHtml(
      page(
        { "@type": "BreadcrumbList", itemListElement: [] },
        `{"@type": "Recipe", "name": "Toast", "recipeIngredient": ["1 slice bread",], "recipeInstructions": ["Toast it."],}`
      ),
      "https://example.com/toast"
    )
    expect(result?.input.name).toBe("Toast")
    expect(result?.input.ingredients).toEqual(["1 slice bread"])
  })

  test("returns null when the page has no recipe", () => {
    expect(
      extractRecipeFromHtml(
        page({ "@type": "Article", name: "Ten kitchen tips" }),
        "https://example.com/"
      )
    ).toBeNull()
    expect(
      extractRecipeFromHtml(
        "<html><body>Nothing</body></html>",
        "https://example.com/"
      )
    ).toBeNull()
  })
})

describe("parseDuration", () => {
  test.each([
    ["PT1H30M", 90],
    ["PT45M", 45],
    ["P0DT0H20M", 20],
    ["PT90S", 2],
    ["P1D", 1440],
    ["PT0M", null],
    ["20 minutes", null],
    [undefined, null],
  ])("%s → %s", (value, expected) => {
    expect(parseDuration(value)).toBe(expected)
  })
})

describe("cleanText", () => {
  test("decodes entities, strips tags and collapses spaces", () => {
    expect(cleanText("  Salt &amp; <em>pepper</em>\n\n to taste ")).toBe(
      "Salt & pepper to taste"
    )
    expect(cleanText(12)).toBe("12")
    expect(cleanText(null)).toBe("")
  })
})
