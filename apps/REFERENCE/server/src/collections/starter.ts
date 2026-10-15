import type { StarterCollection } from "@mise/shared"

/**
 * Hand-picked recipes from free sites (and a few NYT Cooking classics),
 * each checked to import with Nourvio's importer in October 2026. Serious
 * Eats, Simply Recipes and Allrecipes are left out: they block bursts of
 * requests, so "Import all" would stall.
 */
export const STARTER_COLLECTIONS: StarterCollection[] = [
  {
    id: "weeknight",
    title: "Weeknight wins",
    description: "Dinners on the table in 40 minutes or less.",
    recipes: [
      {
        url: "https://www.recipetineats.com/honey-garlic-chicken/",
        title: "Honey Garlic Chicken Breast",
        site: "RecipeTin Eats",
        minutes: 12,
        image:
          "https://www.recipetineats.com/tachyon/2020/02/Honey-Garlic-Chicken-Breast_5-SQ.jpg",
      },
      {
        url: "https://www.recipetineats.com/taiwanese-three-cup-chicken/",
        title: "Taiwanese Three Cup Chicken",
        site: "RecipeTin Eats",
        minutes: 18,
        image:
          "https://www.recipetineats.com/tachyon/2026/07/Taiwanese-Three-Cup-Chicken-9a.jpg",
      },
      {
        url: "https://www.recipetineats.com/chicken-stir-fry-chop-suey/",
        title: "Chicken Stir Fry (Chop Suey)",
        site: "RecipeTin Eats",
        minutes: 14,
        image:
          "https://www.recipetineats.com/tachyon/2018/10/Chicken-Stir-Fry-Chop-Suey-5-landscape-1.jpg",
      },
      {
        url: "https://www.recipetineats.com/chicken-fried-rice/",
        title: "Chicken Fried Rice",
        site: "RecipeTin Eats",
        minutes: 20,
        image:
          "https://www.recipetineats.com/tachyon/2019/09/Chicken-fried-rice-copy.jpg",
      },
      {
        url: "https://www.recipetineats.com/thai-red-curry-with-chicken/",
        title: "Thai Red Curry with Chicken",
        site: "RecipeTin Eats",
        minutes: 25,
        image:
          "https://www.recipetineats.com/tachyon/2018/02/Thai-Red-Curry-Chicken-1.jpg",
      },
      {
        url: "https://www.recipetineats.com/french-chicken-au-poivre-sauce/",
        title: "Chicken au Poivre",
        site: "RecipeTin Eats",
        minutes: 28,
        image:
          "https://www.recipetineats.com/tachyon/2026/02/Chicken-Au-Poivre_4-copy.jpg",
      },
      {
        url: "https://www.recipetineats.com/beef-stroganoff/",
        title: "Beef Stroganoff",
        site: "RecipeTin Eats",
        minutes: 30,
        image:
          "https://www.recipetineats.com/tachyon/2018/01/Beef-Stroganoff_2-1-1.jpg",
      },
      {
        url: "https://cooking.nytimes.com/recipes/12965-spaghetti-carbonara",
        title: "Carbonara",
        site: "NYT Cooking",
        minutes: 30,
        image:
          "https://static01.nyt.com/images/2021/02/14/dining/carbonara-horizontal/carbonara-horizontal-mediumSquareAt3X-v2.jpg",
      },
      {
        url: "https://pinchofyum.com/peanut-chicken-with-ginger-slaw",
        title: "Peanut Chicken with Ginger Slaw",
        site: "Pinch of Yum",
        minutes: 35,
        image:
          "https://pinchofyum.com/tachyon/Peanut-Chicken-with-Ginger-Slaw-Square.jpg",
      },
      {
        url: "https://www.recipetineats.com/coconut-chicken-curry-quick-easy/",
        title: "Coconut Chicken Curry",
        site: "RecipeTin Eats",
        minutes: 35,
        image:
          "https://www.recipetineats.com/tachyon/2026/04/Coconut-chicken-curry-quick-easy_7.jpg",
      },
    ],
  },
  {
    id: "chicken",
    title: "Chicken, every way",
    description:
      "Curries, roasts, crispy and saucy: the chicken dinners people keep coming back to.",
    recipes: [
      {
        url: "https://www.recipetineats.com/butter-chicken/",
        title: "Butter Chicken",
        site: "RecipeTin Eats",
        minutes: 35,
        image:
          "https://www.recipetineats.com/tachyon/2019/01/Butter-Chicken_5-SQ.jpg",
      },
      {
        url: "https://www.recipetineats.com/chicken-tikka-masala/",
        title: "Chicken Tikka Masala",
        site: "RecipeTin Eats",
        minutes: 60,
        image:
          "https://www.recipetineats.com/tachyon/2018/04/Chicken-Tikka-Masala_0-SQ.jpg",
      },
      {
        url: "https://www.recipetineats.com/orange-chicken/",
        title: "Chinese Orange Chicken",
        site: "RecipeTin Eats",
        minutes: 35,
        image:
          "https://www.recipetineats.com/tachyon/2026/06/Orange-chicken-0.jpg",
      },
      {
        url: "https://www.recipetineats.com/poulet-roti-french-roast-chicken/",
        title: "Poulet Rôti - French Roast Chicken",
        site: "RecipeTin Eats",
        minutes: 110,
        image:
          "https://www.recipetineats.com/tachyon/2026/04/Poulet-Roti_6.jpg",
      },
      {
        url: "https://www.recipetineats.com/one-pan-portuguese-chicken-and-potato-bake/",
        title: "One-Pan Portuguese Chicken and Potatoes",
        site: "RecipeTin Eats",
        minutes: 80,
        image:
          "https://www.recipetineats.com/tachyon/2026/08/Portuguese-chicken-and-potatoes-2.jpg",
      },
      {
        url: "https://pinchofyum.com/chicken-with-cajun-cream-sauce",
        title: "Chicken with Cajun Cream Sauce",
        site: "Pinch of Yum",
        minutes: 40,
        image:
          "https://pinchofyum.com/tachyon/Chicken-with-Cajun-Sauce-scaled.jpg",
      },
      {
        url: "https://pinchofyum.com/crispy-parmesan-chicken-with-creamy-lemon-pasta",
        title: "Crispy Parmesan Chicken with Creamy Lemon Pasta",
        site: "Pinch of Yum",
        minutes: 40,
        image:
          "https://pinchofyum.com/tachyon/Crispy-Chicken-with-Lemon-Pasta-5-Square.jpg",
      },
      {
        url: "https://www.bonappetit.com/recipe/bas-best-chicken-parm",
        title: "BA's Best Chicken Parmesan",
        site: "Bon Appétit",
        minutes: null,
        image:
          "https://assets.bonappetit.com/photos/5ea8f0df16738800085ad5d2/16:9/w_2000,h_1125,c_limit/Chicken-Parmesean-Recipe-Lede.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/easy-chicken-curry",
        title: "Easy Chicken Curry",
        site: "BBC Good Food",
        minutes: 50,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/easy-chicken-curry-aa22a0b.jpg",
      },
      {
        url: "https://www.recipetineats.com/tuscan-chicken-stew/",
        title: "Tuscan Chicken Stew",
        site: "RecipeTin Eats",
        minutes: 35,
        image:
          "https://www.recipetineats.com/tachyon/2026/06/Tuscan-chicken-stew-5.jpg",
      },
    ],
  },
  {
    id: "pasta",
    title: "Pasta & noodles",
    description: "Sauces worth the simmer, and quick noodle bowls.",
    recipes: [
      {
        url: "https://www.recipetineats.com/spaghetti-bolognese/",
        title: "Spaghetti Bolognese",
        site: "RecipeTin Eats",
        minutes: 40,
        image:
          "https://www.recipetineats.com/tachyon/2018/07/Spaghetti-Bolognese.jpg",
      },
      {
        url: "https://cooking.nytimes.com/recipes/1020830-caramelized-shallot-pasta",
        title: "Caramelized Shallot Pasta",
        site: "NYT Cooking",
        minutes: 40,
        image:
          "https://static01.nyt.com/images/2020/01/29/dining/27Romanrex/merlin_167079174_ecc032e7-071b-44ab-8852-0d5025d0e90d-superJumbo.jpg",
      },
      {
        url: "https://cooking.nytimes.com/recipes/1015178-marcella-hazans-tomato-sauce",
        title: "Marcella Hazan’s Tomato Sauce",
        site: "NYT Cooking",
        minutes: 60,
        image:
          "https://static01.nyt.com/images/2024/08/05/multimedia/Marcella-Hazan-Tomato-Sauce-jpcf/Marcella-Hazan-Tomato-Sauce-jpcf-mediumSquareAt3X.jpg",
      },
      {
        url: "https://www.recipetineats.com/mushroom-ragu-pasta-recipe/",
        title: "Mushroom Ragu Pasta",
        site: "RecipeTin Eats",
        minutes: 55,
        image:
          "https://www.recipetineats.com/tachyon/2026/08/Mushroom-Ragu_0.jpg",
      },
      {
        url: "https://www.loveandlemons.com/french-onion-pasta/",
        title: "French Onion Pasta",
        site: "Love and Lemons",
        minutes: 60,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/09/french-onion-pasta.jpg",
      },
      {
        url: "https://www.loveandlemons.com/butternut-squash-gnocchi/",
        title: "Butternut Squash Gnocchi",
        site: "Love and Lemons",
        minutes: 50,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/09/butternut-squash-gnocchi.jpg",
      },
      {
        url: "https://www.recipetineats.com/one-pan-mongolian-beef-noodles-with-broccoli/",
        title: "One-Pan Mongolian Beef Noodles with broccoli",
        site: "RecipeTin Eats",
        minutes: null,
        image:
          "https://www.recipetineats.com/tachyon/2026/09/One-pan-Mongolian-Beef-Noodles-with-Broccoli-3.jpg",
      },
      {
        url: "https://www.recipetineats.com/beef-rice-noodles/",
        title: "Beef Rice Noodles",
        site: "RecipeTin Eats",
        minutes: 40,
        image:
          "https://www.recipetineats.com/tachyon/2026/08/Beef-flat-rice-noodles-4.jpg",
      },
      {
        url: "https://cooking.nytimes.com/recipes/12965-spaghetti-carbonara",
        title: "Carbonara",
        site: "NYT Cooking",
        minutes: 30,
        image:
          "https://static01.nyt.com/images/2021/02/14/dining/carbonara-horizontal/carbonara-horizontal-mediumSquareAt3X-v2.jpg",
      },
    ],
  },
  {
    id: "soups",
    title: "Soups & stews",
    description: "Big pots for cold nights, most of them better the next day.",
    recipes: [
      {
        url: "https://www.recipetineats.com/french-onion-soup/",
        title: "French Onion Soup",
        site: "RecipeTin Eats",
        minutes: 110,
        image:
          "https://www.recipetineats.com/tachyon/2018/11/French-Onion-Soup_1.jpg",
      },
      {
        url: "https://pinchofyum.com/pastina-soup-italian-penicillin",
        title: "Pastina Soup (Italian Penicillin)",
        site: "Pinch of Yum",
        minutes: 45,
        image: "https://pinchofyum.com/tachyon/Pastina-Soup-Square.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/carrot-coriander-soup",
        title: "Carrot & Coriander Soup",
        site: "BBC Good Food",
        minutes: 40,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2010/12/carrot-and-coriander-soup-recipe-e71fd8f.jpg?resize=695,632",
      },
      {
        url: "https://www.loveandlemons.com/vegetable-soup/",
        title: "Vegetable Soup",
        site: "Love and Lemons",
        minutes: 40,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2019/12/vegetable-soup.jpg",
      },
      {
        url: "https://www.loveandlemons.com/lentil-soup/",
        title: "Best Lentil Soup",
        site: "Love and Lemons",
        minutes: 60,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2023/12/lentil-soup.jpg",
      },
      {
        url: "https://www.loveandlemons.com/black-bean-soup-recipe/",
        title: "Black Bean Soup",
        site: "Love and Lemons",
        minutes: 60,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2020/10/black-bean-soup-2.jpg",
      },
      {
        url: "https://www.loveandlemons.com/minestrone-soup/",
        title: "Minestrone Soup",
        site: "Love and Lemons",
        minutes: 45,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2021/11/minestrone-soup.jpg",
      },
      {
        url: "https://www.loveandlemons.com/vegetarian-chili-recipe/",
        title: "Vegetarian Chili",
        site: "Love and Lemons",
        minutes: 45,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2019/10/vegetarian-chili-1.jpg",
      },
      {
        url: "https://pinchofyum.com/the-best-detox-crockpot-lentil-soup",
        title: "The Best Detox Crockpot Lentil Soup",
        site: "Pinch of Yum",
        minutes: 390,
        image: "https://pinchofyum.com/tachyon/Crockpot-Lentil-Soup-Recipe.jpg",
      },
    ],
  },
  {
    id: "vegetarian",
    title: "Vegetarian mains",
    description:
      "Meatless dinners that don't feel like they're missing anything.",
    recipes: [
      {
        url: "https://www.loveandlemons.com/chickpea-curry/",
        title: "Chickpea Curry",
        site: "Love and Lemons",
        minutes: 40,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/01/chickpea-curry.jpg",
      },
      {
        url: "https://www.loveandlemons.com/stuffed-peppers-recipe/",
        title: "Stuffed Peppers",
        site: "Love and Lemons",
        minutes: 40,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2020/08/stuffed-peppers.jpg",
      },
      {
        url: "https://www.loveandlemons.com/best-veggie-burger-recipe/",
        title: "Best Veggie Burger",
        site: "Love and Lemons",
        minutes: 140,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2018/06/veggie-burger-2.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/vegan-chilli",
        title: "Vegan Chilli",
        site: "BBC Good Food",
        minutes: 60,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/vegan-chilli-be48585.jpg",
      },
      {
        url: "https://minimalistbaker.com/easy-vegan-fried-rice/",
        title: "Easy Vegan Fried Rice",
        site: "Minimalist Baker",
        minutes: 75,
        image:
          "https://minimalistbaker.com/wp-content/uploads/2015/08/Fried-Rice-SQUARE.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/shakshuka",
        title: "Shakshuka",
        site: "BBC Good Food",
        minutes: 25,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-12141_11-fd804a3.jpg",
      },
      {
        url: "https://www.loveandlemons.com/falafel/",
        title: "Falafel",
        site: "Love and Lemons",
        minutes: 1480,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2019/09/falafel-recipe-1.jpg",
      },
      {
        url: "https://www.loveandlemons.com/hummus-recipe/",
        title: "Best Hummus",
        site: "Love and Lemons",
        minutes: 5,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2019/12/hummus.jpg",
      },
    ],
  },
  {
    id: "comfort",
    title: "Comfort classics",
    description: "Weekend projects and family favorites.",
    recipes: [
      {
        url: "https://www.recipetineats.com/lasagna/",
        title: "Lasagna",
        site: "RecipeTin Eats",
        minutes: 260,
        image:
          "https://www.recipetineats.com/tachyon/2017/05/Lasagne-recipe-3-main-square.jpg",
      },
      {
        url: "https://www.recipetineats.com/shepherds-pie/",
        title: "Shepherd's Pie",
        site: "RecipeTin Eats",
        minutes: 80,
        image:
          "https://www.recipetineats.com/tachyon/2018/06/Shepherds-Pie_1.jpg",
      },
      {
        url: "https://www.recipetineats.com/chicken-pot-pie/",
        title: "Chicken Pot Pie",
        site: "RecipeTin Eats",
        minutes: 75,
        image:
          "https://www.recipetineats.com/tachyon/2018/10/Chicken-Pot-Pie_2.jpg",
      },
      {
        url: "https://www.recipetineats.com/birria-tacos/",
        title: "Birria Tacos",
        site: "RecipeTin Eats",
        minutes: 210,
        image:
          "https://www.recipetineats.com/tachyon/2025/09/Birria-tacos_4.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/chilli-con-carne-recipe",
        title: "Chilli con Carne",
        site: "BBC Good Food",
        minutes: 70,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1001451_6-c8d72b8.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/chicken-tikka-masala",
        title: "Chicken tikka masala",
        site: "BBC Good Food",
        minutes: 65,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-202451_12-50a0c95.jpg",
      },
      {
        url: "https://www.recipetineats.com/beef-stroganoff/",
        title: "Beef Stroganoff",
        site: "RecipeTin Eats",
        minutes: 30,
        image:
          "https://www.recipetineats.com/tachyon/2018/01/Beef-Stroganoff_2-1-1.jpg",
      },
    ],
  },
  {
    id: "baking",
    title: "Bake it",
    description: "Bread, cakes and muffins from bakers who test everything.",
    recipes: [
      {
        url: "https://www.kingarthurbaking.com/recipes/classic-sandwich-bread-recipe",
        title: "Classic Sandwich Bread",
        site: "King Arthur Baking",
        minutes: 162,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/2026-02/Classic-Sandwich-Bread-12.jpg",
      },
      {
        url: "https://www.kingarthurbaking.com/recipes/no-knead-crusty-white-bread-recipe",
        title: "No-Knead Crusty White Bread",
        site: "King Arthur Baking",
        minutes: 335,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/2026-02/No-Knead-Crusty-White-Bread-12.jpg",
      },
      {
        url: "https://sallysbakingaddiction.com/homemade-pizza-crust-recipe/",
        title: "Easy Homemade Pizza Dough",
        site: "Sally's Baking Addiction",
        minutes: 150,
        image:
          "https://sallysbakingaddiction.com/wp-content/uploads/2019/01/pizza-dough-on-floured-counter.jpg",
      },
      {
        url: "https://www.recipetineats.com/banana-bread-recipe/",
        title: "Banana Bread",
        site: "RecipeTin Eats",
        minutes: 150,
        image:
          "https://www.recipetineats.com/tachyon/2026/03/Banana-bread-19Mar2026_2.jpg",
      },
      {
        url: "https://www.loveandlemons.com/apple-bread-recipe/",
        title: "Apple Bread",
        site: "Love and Lemons",
        minutes: 75,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/09/apple-bread-recipe.jpg",
      },
      {
        url: "https://sallysbakingaddiction.com/blueberry-muffins/",
        title: "My Best Blueberry Muffins",
        site: "Sally's Baking Addiction",
        minutes: 45,
        image:
          "https://sallysbakingaddiction.com/wp-content/uploads/2019/05/blueberry-muffin.jpg",
      },
      {
        url: "https://www.kingarthurbaking.com/recipes/fudge-brownies-recipe",
        title: "Fudge Brownies",
        site: "King Arthur Baking",
        minutes: 40,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/2026-08/Fudge-Brownies_2026_Lifesyle_H_1560.jpg",
      },
      {
        url: "https://www.recipetineats.com/chocolate-cake/",
        title: "Chocolate Cake",
        site: "RecipeTin Eats",
        minutes: 45,
        image:
          "https://www.recipetineats.com/tachyon/2018/03/Chocolate-Cake_9-SQ.jpg",
      },
      {
        url: "https://www.kingarthurbaking.com/recipes/classic-birthday-cake-recipe",
        title: "Classic Birthday Cake",
        site: "King Arthur Baking",
        minutes: 180,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/recipe_legacy/9918-3-large.jpg",
      },
      {
        url: "https://sallysbakingaddiction.com/apple-pie-recipe/",
        title: "My Best Apple Pie Recipe",
        site: "Sally's Baking Addiction",
        minutes: 420,
        image:
          "https://sallysbakingaddiction.com/wp-content/uploads/2017/07/slice-of-apple-pie-2.jpg",
      },
    ],
  },
  {
    id: "cookies",
    title: "The chocolate chip cookie lineup",
    description:
      "Four famous takes, from NYT Cooking's to King Arthur's. Bake them all and pick a favorite.",
    recipes: [
      {
        url: "https://cooking.nytimes.com/recipes/1015819-chocolate-chip-cookies",
        title: "NYT Chocolate Chip Cookies",
        site: "NYT Cooking",
        minutes: 45,
        image:
          "https://static01.nyt.com/images/2022/02/12/dining/JT-Chocolate-Chip-Cookies/JT-Chocolate-Chip-Cookies-mediumSquareAt3X.jpg",
      },
      {
        url: "https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies",
        title: "BA’s Best Chocolate Chip Cookies",
        site: "Bon Appétit",
        minutes: null,
        image:
          "https://assets.bonappetit.com/photos/5ca534485e96521ff23b382b/16:9/w_4800,h_2700,c_limit/chocolate-chip-cookie.jpg",
      },
      {
        url: "https://www.kingarthurbaking.com/recipes/classic-chocolate-chip-cookies-recipe",
        title: "King Arthur Chocolate Chip Cookies",
        site: "King Arthur Baking",
        minutes: 36,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/2026-04/Classic-Chocolate-Chip-Cookie-5.jpg",
      },
      {
        url: "https://pinchofyum.com/the-best-soft-chocolate-chip-cookies",
        title: "Soft Chocolate Chip Cookies",
        site: "Pinch of Yum",
        minutes: 20,
        image:
          "https://pinchofyum.com/tachyon/Chocolate-Chip-Cookies-Recipe.jpg",
      },
    ],
  },
  {
    id: "breakfast",
    title: "Weekend breakfast",
    description: "Slow mornings: pancakes, eggs and something baked.",
    recipes: [
      {
        url: "https://www.bbcgoodfood.com/recipes/easy-pancakes",
        title: "Easy Pancakes",
        site: "BBC Good Food",
        minutes: 30,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-1273477_8-ad36e3b.jpg",
      },
      {
        url: "https://www.loveandlemons.com/cottage-cheese-pancakes/",
        title: "Cottage Cheese Pancakes",
        site: "Love and Lemons",
        minutes: 30,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/09/cottage-cheese-pancakes.jpg",
      },
      {
        url: "https://www.bbcgoodfood.com/recipes/shakshuka",
        title: "Shakshuka",
        site: "BBC Good Food",
        minutes: 25,
        image:
          "https://images.immediate.co.uk/production/volatile/sites/30/2020/08/recipe-image-legacy-id-12141_11-fd804a3.jpg",
      },
      {
        url: "https://www.loveandlemons.com/turkish-eggs/",
        title: "Turkish Eggs (Çılbır)",
        site: "Love and Lemons",
        minutes: 20,
        image:
          "https://cdn.loveandlemons.com/wp-content/uploads/2026/09/turkish-eggs.jpg",
      },
      {
        url: "https://www.kingarthurbaking.com/recipes/blueberry-muffins-recipe",
        title: "Blueberry Muffins",
        site: "King Arthur Baking",
        minutes: 38,
        image:
          "https://www.kingarthurbaking.com/sites/default/files/2022-12/KABC_Quick-Breads_Blueberry-Muffin_08304.jpg",
      },
      {
        url: "https://www.recipetineats.com/banana-bread-recipe/",
        title: "Banana Bread",
        site: "RecipeTin Eats",
        minutes: 150,
        image:
          "https://www.recipetineats.com/tachyon/2026/03/Banana-bread-19Mar2026_2.jpg",
      },
    ],
  },
]
