# Integrations

What Mise connects to, what we learned about each service (researched October 2026), and how we'll use it.

## Recipe sites

- **Structured data first.** Most recipe sites embed a machine-readable copy of the recipe in the page, using the schema.org `Recipe` JSON-LD format. Mealie and the `recipe-scrapers` library read the same data. It gives us:
  - name, image, servings and times
  - ingredient lines
  - steps, often with sections
  - keywords and category
  - sometimes nutrition
- **AI fallback.** When a page has no recipe data, we send the page's readable text (navigation, scripts and footers removed) to the import model and get a structured draft back (see [architecture.md](architecture.md#structured-extraction)). The page's share image (`og:image`) becomes the photo.
- **Fetching.** We send a normal browser user agent, time out after 15 seconds, and cap pages at 5 MB. Tracking parameters (`utm_*`, `fbclid` and so on) are dropped from the link first.
- **Sites that block us.** Some big publishers refuse requests that don't look like a browser:
  - Node's default TLS handshake is on some blocklists, so we connect over HTTP/2 with a browser's cipher order. Bon Appétit and NYT Cooking work, and so do Allrecipes and Simply Recipes most of the time.
  - Sites behind a JavaScript challenge (Budget Bytes, for one) refuse even curl. We stop there and don't try to get around it.
  - When a site blocks us, the UI suggests pasting the text instead. A later option is a bookmarklet that sends the page from your own browser, which is already past the check.
- **Duplicates.** Importing a link that's already in the library (also checked after redirects) returns the existing recipe, with a choice to import a copy anyway.
- **Safety.** The server refuses to fetch private-network addresses (localhost, 10.x, 192.168.x, link-local, carrier NAT and IPv6 equivalents). It resolves names itself and checks every address and every redirect, so a public name pointing at a private address is refused too.
- **Images.** The recipe image is downloaded and stored under `/data/images`, so it survives the site changing. A broken image doesn't fail the import. Finding a good one:
  - Every photo the page offers is a candidate: the recipe's own (following WordPress-style `{"@id": "…#primaryimage"}` references to the page's ImageObject), then the page's share image.
  - They're tried biggest first, by the size the data gives or the link spells out ("-1200x800.jpg", "/1500x0/", "?resize=500,375"). Photos of unknown size come next (often the originals), and small copies last, after their own link without the resize settings, which image servers usually answer with the original.
  - Downloads say which page asked (`Referer`), as a browser does, since some sites refuse photos otherwise. Anything under 200 px on its short side is skipped, and the first at least 450 px wins; otherwise the biggest usable one does.
  - Checked October 2026 against RecipeTin Eats, Pinch of Yum, Love and Lemons, Serious Eats, Bon Appétit, Allrecipes and BBC Good Food (whose biggest photo is 440 px).

## Video links (TikTok, YouTube, Instagram)

Plenty of recipes now live only in short videos. The recipe is usually split across the caption, what's said and what's shown on screen.

- **yt-dlp** (in the Docker image) reads the video's details without downloading it: title, description (often the full recipe), uploader, length, thumbnail and captions.
- **Captions:** written captions in English (or the video's own language) first, then YouTube's automatic captions of what was actually said (`-orig`), never the machine-translated ones. They're turned into plain text without the repeats rolling captions have.
- **No captions?** If an OpenAI key is set and the video is under 30 minutes, the audio is downloaded, squeezed to mono 32 kbps MP3 with ffmpeg, and transcribed with `gpt-4o-mini-transcribe`. Claude has no audio input.
- **Short videos** (5 minutes or less, which covers TikTok, Reels and Shorts): a 480p copy is downloaded and ffmpeg pulls 8 frames spread across it, skipping the intro and outro. They go to the AI as images, for amounts shown on screen.
- All of that goes to the same AI extraction as pasted text. The recipe's origin is `video`, the canonical link is kept (so a short link imported twice is caught), and the thumbnail becomes the photo.
- **YouTube** needs a JavaScript runtime for yt-dlp these days. We pass `--js-runtimes node`, since Node is already in the image.
- **Signed-in sessions:** Instagram often wants one, and YouTube sometimes asks to "confirm you're not a bot." A `cookies.txt` in the data folder (or `YTDLP_COOKIES_FILE`) is passed to yt-dlp.
- **Keeping up:** yt-dlp breaks when sites change and gets fixed within days. The image installs the standalone build (checked against its release checksums), and the app runs yt-dlp's own updater at startup and weekly. `YTDLP_AUTO_UPDATE=false` turns that off.
- **Safety:** only links to the video sites above go to yt-dlp. It runs without a shell, with `--ignore-config`, a 200 MB cap and time limits, and everything it downloads goes to a temporary folder that's deleted afterwards.

## Mealie (one-time migration)

Built in **Settings → Move from Mealie** (admins). It's written for Mealie 1.x and 2.x and tested against fixtures of both shapes; it still needs a first run against the real library.

- **Mealie's REST API, with an API token** (made in Mealie under your profile → API Tokens). The token is used for the run and never saved.
  - `/api/app/about` for the version, to check the connection
  - the paginated `/api/recipes` (50 at a time), then `/api/recipes/{slug}` for each
  - photos from `/api/media/recipes/{id}/images/original.webp`
- **It reaches the home network.** Mealie usually lives there, so unlike recipe-site imports this skips the private-address block. That's why it's admin only, and it only ever calls the address that was typed in.
- **Mapping:**
  - Ingredients: Mealie's formatted `display` line, else `originalText`, else `note` (where unparsed lines live). A `title` starts a section.
  - Steps: `title` starts a section; `text` becomes one step.
  - Servings from `recipeServings` (2.x) or the yield text; times from `prepTime`, `performTime` (Mealie's cook time; `cookTime` in older versions) and `totalTime`, whether they're "1 hour 30 minutes" or ISO durations.
  - Tags and categories both become tags; rating (rounded), source link, notes, nutrition and last-made date come across.
  - Each recipe remembers its Mealie id (`external_ref`), so running it again skips what's already here.
- Mealie's foods and units aren't imported: Mise matches foods by name (see [architecture.md](architecture.md#data-model)).

## AI providers (Claude and OpenAI)

- **The server calls each provider directly through its official TypeScript SDK.** Anthropic uses `@anthropic-ai/sdk`. OpenAI uses `openai`, with the Responses API.
- **Keys** come from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` or **Settings → AI**. They're stored encrypted and never leave the server. See [architecture.md](architecture.md#providers).
- **Getting keys:** from Anthropic's developer console and from platform.openai.com.
- **Billing:** both bill per token, separately from any ChatGPT Plus or Claude subscription. A ChatGPT subscription doesn't include API usage.
- **Batch APIs:** both providers have one at about half price. Bulk cleanup of the library uses them.

| Claude model | ID | Input / output per million tokens |
|---|---|---|
| Claude Opus 5.5 (Claude default) | `claude-opus-5-5` | $4 / $20 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 |
| Claude Haiku 5.5 | `claude-haiku-5-5` | $0.10 / $0.50 |

| OpenAI model | ID | Input / output per million tokens |
|---|---|---|
| GPT-6 Astra | `gpt-6-astra` | $10 / $50 |
| GPT-6 Sol (OpenAI default) | `gpt-6-sol` | $2 / $10 |
| GPT-6 Luna | `gpt-6-luna` | $0.10 / $0.50 |

- **OpenAI models and prices** change often (GPT-6 Sol and Luna launched September 22, 2026), so Settings lists whatever models the key can use. Check OpenAI's pricing page before choosing one.
- **Photos** for recipes without one are made by OpenAI's image models; Claude can't make pictures. Mise uses `gpt-image-2.5-flare` ("fast, high-quality everyday generation"), falling back to `gpt-image-2`, `gpt-image-1.5` and `gpt-image-1-mini` if a key can't use it. Images are billed per token ($5 per million text tokens in, $30 per million image tokens out); a 1536×1024 photo at medium quality is about 340 image tokens, so roughly 1¢ (measured October 2026: 1.1–1.2¢ each). OpenAI may ask for the organization to be verified, and a new account needs credit, before it makes images. Both errors say so in the app.
- **Picking models:** Settings tracks spend by provider, model and task, so we can see where a cheaper model is good enough.
- **Web search** for the assistant uses each provider's own search tool, $10 per 1,000 searches at both. Search results add a lot of reading: a "find me a birria recipe" reply on Claude Opus 5.5 read about 52,000 tokens (about 24¢ in all), so a smaller Assistant model is worth it for heavy searching.

## Nutrition

1. **From the recipe site.** JSON-LD `NutritionInformation` (calories, proteinContent, fatContent and so on) is stored as-is, labeled "from site."
2. **Calculated from ingredients** with [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/):
   - It's free with an api.data.gov key (1,000 requests per hour by default). The shared `DEMO_KEY` allows only 10 an hour, too few to use. The key goes in the `X-Api-Key` header, so it stays out of URLs and logs.
   - We use two endpoints: `/foods/search` (Foundation and SR Legacy foods only; branded products are noise) and `/food/{fdcId}`.
   - USDA's ranking is often wrong for plain names: "chicken thighs" comes back as chicken skin first, "olive oil" as a corn, peanut and olive blend. So the AI picks from the top eight.
   - Each food is matched once (`food_matches`) and its record cached (`fdc_foods`), shared across households. That keeps API calls rare after the first few recipes.
   - Ingredient amounts are converted to grams. Weights convert directly. Volumes and counts use FDC's portion data (`foodPortions`, like "1 cup chopped = 160 g" or "1 medium = 110 g"). SR Legacy foods have rich portions; Foundation foods mostly don't, so the AI weighs those and the result is cached.
   - Energy is nutrient 1008 in SR Legacy, but 2047 or 2048 (Atwater factors) in Foundation foods; sugars are 2000 or 1063.
   - Per-serving totals are the sum divided by servings, labeled "calculated."
3. **AI estimate** when matching fails, labeled "estimate."

## Grocery stores (connections)

Researched again on October 14, 2026, for the common US chains: what it takes to get Mise's shopping list into each store.

### Three ways in

| Way | What happens | Stores |
|---|---|---|
| **Straight into the cart** (the store's official API) | Mise matches each item to a product at your store and adds it to your cart. You pick a pickup or delivery time and pay in the store's own app. | Kroger family only |
| **A shopping link** (Instacart) | Mise turns the list into an Instacart page. You pick the store there, check the matched products and check out on Instacart, at Instacart's prices and fees. | Most chains, Costco included |
| **No connection** | Mise can't reach the store's cart, so it offers a list with a search link for each item. | Walmart (for now), Target, Trader Joe's, Amazon |

### Store by store

| Store | Public cart API? | On Instacart? | Best route |
|---|---|---|---|
| **Kroger family:** Kroger, Fry's, Ralphs, King Soopers, Smith's, Fred Meyer, QFC, Harris Teeter, Dillons, Mariano's, Pick 'n Save | **Yes.** Free and self-serve; it adds to the cart | Yes | Kroger API |
| **Walmart** | Only for approved partners (Pinterest, eMeals) | No | Search links; a browser extension if wanted |
| **Costco** | No | Yes: Costco's same-day delivery is run by Instacart | Instacart |
| **Sam's Club** | No | In many areas | Instacart |
| **Albertsons family:** Safeway, Albertsons, Vons, Jewel-Osco, Acme, Shaw's, Tom Thumb, Randalls | No | Yes | Instacart |
| **Publix** | No | Yes | Instacart |
| **Aldi** | No | Yes | Instacart |
| **Ahold Delhaize:** Food Lion, Stop & Shop, Giant, Hannaford | No | Yes | Instacart |
| **Sprouts, Wegmans, Meijer** | No | Yes | Instacart |
| **H-E-B, Hy-Vee** | No | Depends on the area | Instacart where it's offered |
| **Target** | No. Its delivery is its own Shipt, which has no public API either | No | List and links |
| **Amazon Fresh, Whole Foods** | Only an add-to-cart link for Amazon affiliates, which needs Amazon's product IDs | No | Later, maybe |
| **Trader Joe's** | No online ordering at all | No | An in-store list |

Instacart coverage varies by ZIP code. Mise can ask Instacart which stores it serves near the household (below) instead of relying on this table.

### Kroger family (the best fit)

- **Getting access:** a free, self-serve developer account at [developer.kroger.com](https://developer.kroger.com). Register an app to get a client ID and secret. Each Mise server registers its own, the way it brings its own AI keys, with the redirect address `https://<your Mise address>/api/shop/kroger/callback` (Settings → Kroger shows the exact one). `KROGER_API_URL` can point Mise at Kroger's certification environment, or a stand-in for testing.
- **What the public APIs do:**
  - Locations: finds stores near a ZIP code.
  - Products: search by word, brand or UPC. Given a store (`filter.locationId`), results include that store's regular and sale price (`price.regular`, `price.promo`), the stock level (high, low or temporarily out), and the **aisle**, with side and shelf.
  - Cart: adds items by UPC and quantity, for pickup or delivery.
  - Identity: the signed-in shopper's profile.
- **Banners:** a store's `chain` code (`FRYS`, `RALPHS`, `KINGSOOPERS`…) gives the name shown ("Fry's") and the website for product and cart links (frysfood.com).
- **Signing in:** the household links a Kroger account once, on Kroger's own sign-in page (OAuth authorization code with PKCE, scopes `cart.basic:write` and `profile.compact`). Product and store searches use the app's own token (`product.compact`). Mise keeps the refresh token encrypted, like the AI keys.
- **Limits:**
  - The public cart API only **adds**. It can't read, change or empty the cart, so Mise remembers what it sent and won't add the same week twice. Viewing and removing are in Kroger's Partner tier, which needs a contract; Mise doesn't need it.
  - Daily call limits: products 10,000, cart 5,000, locations 1,600 per endpoint. That's far more than a household uses.
  - There's no checkout endpoint. You pick a time and pay in the Fry's (or Kroger) app, so Mise never touches payment.
- **Extras that come with it:**
  - Real prices and sales give an estimated total for the week. Later, plans could lean on what's on sale.
  - Aisle numbers let the list sort in the order you walk your store.

### Instacart (Costco and most other chains)

- **Not open to the public (October 14, 2026):** the docs describe self-serve keys, but the user found the Developer Platform isn't taking the public right now. Mise doesn't use it; Costco gets links instead (below).
- **Getting access (as documented):** a self-serve API key from the [Instacart Developer Dashboard](https://dashboard.instacart.com), with development and production keys. It's free. Instacart's affiliate program (Tastemakers, 3%) is optional and not needed.
- **Making the link:** `POST /idp/v1/products/products_link` with `link_type: "shopping_list"` and `line_items`. Each item has:
  - `name`: the search term
  - `line_item_measurements`: one or more amounts with quantity and unit, so Instacart can pick a product size
  - optionally `upcs` or `product_ids`
  - optionally `filters`: brands, and health filters like ORGANIC and GLUTEN_FREE

  It returns `products_link_url`. `expires_in` can keep the link for up to 365 days.
- **On the page:** the shopper picks the store. As far as the docs say, the store can't be chosen in advance. Instacart shows its matches, the shopper adds them to the Instacart cart, and checks out with Instacart's prices (often 5–15% above the shelf) and delivery or pickup fees.
- **Nearby stores:** `GET /idp/v1/retailers?postal_code=…&country_code=US` lists the stores Instacart serves near a ZIP code. Settings can show "Available near you: Costco, Fry's, Safeway…".
- **The fit:** a hand-off, not a cart fill. It's less automatic than Kroger but needs no upkeep, and it reaches Costco, whose same-day delivery Instacart already runs.

### Walmart (still hard)

- **New since the first look:** Walmart now has a Recipes and Bundle API and an AddToCart service that fill a shopper's Walmart cart from an ingredient list. They're only for approved partners, such as Pinterest's "Shop ingredients" button, eMeals (behind the WP Recipe Maker plugin's Walmart button) and Whisk/Samsung Food. There's no self-serve sign-up; it's a business deal.
- The affiliate API (product search, item IDs, prices) is read-only and needs program approval. Walmart isn't on Instacart.
- **Decided:** Walmart goes through the Mise browser extension (below), working in your own signed-in Walmart tab. It will break now and then when walmart.com changes and need a fix. Automating a retailer's site is a gray area under their terms; this is low volume, on your own account. It has to go slowly, since Walmart answers quick bursts with HTTP 429. Search links stay as the fallback.

### The Mise browser extension (planned)

One extension for Chrome, Edge and other Chromium browsers (Manifest V3; Firefox later, with small changes). It does the jobs that need your own browser:

- **Connecting:**
  - Type your Mise address in the extension and click Connect. Mise opens a page asking whether to allow it.
  - Allowing creates a personal API token for the extension, which can be revoked in Settings, and hands it back.
  - Requests carry the token in a header, not the session cookie, so the same-site check that guards cookie requests doesn't apply to them.
- **Import this page:**
  - The extension sends the page as your browser shows it (its HTML and address) to Mise, which reads it like a link import: recipe data first, AI otherwise.
  - That gets past sites that block servers (Budget Bytes, Serious Eats, Allrecipes), and works for recipes you can see through your own subscription (NYT Cooking, America's Test Kitchen).
  - If Mise's server can't download the photo, the extension sends the one your browser already loaded.
  - The toolbar icon shows when the page has a recipe.
- **Right-click:** "Import into Mise" on a link or video (sent to the normal link import), and "Add to shopping list" on selected text.
- **The list beside you:** the week's list in the browser's side panel while you shop any store's site (Costco on Instacart, say). Items get checked off as they go in the cart.
- **Walmart:**
  - On a Walmart product page, **Use this for…** saves it as the product for a list item, with its price.
  - **Fill my Walmart cart** adds the saved products for the week's list one at a time, slowly. Items without a saved product show Walmart's search results to pick from, and the pick is remembered.
  - It ends with what was added, what was skipped, and an estimated total. You pick the pickup time and pay yourself.
  - Because it works through walmart.com in your tab, the cart and search steps get a prototype first.
- **Phones:** extensions don't run in Chrome on Android, and Safari on iPhone needs an App Store app for them. Phones keep the share sheet (Android), Paste (iPhone) and an iOS Shortcut; the extension is for the computer.
- **Installing:**
  - The simplest for a self-hosted app: download it from Settings and load it unpacked. Chrome shows a developer-mode note.
  - A Chrome Web Store listing (it can be unlisted) avoids that note, for a one-time $5 developer fee and a review of each update.

### Costco

- No API of any kind. costco.com's own cart is mostly not groceries.
- Same-day grocery delivery is run by Instacart. Without Instacart's API, Mise links each list item to its search at Costco Same-Day, to add there by hand.
- For warehouse trips, a plain list is what's useful. Costco packs are big, so turning amounts into packages should know a Costco pack (three pounds of onions, not one onion).

### Everyone else

- **Target:** no API, and its Shipt delivery has none either. A list and links.
- **Amazon Fresh and Whole Foods:** Amazon's documented "Add to Cart form" (`/gp/aws/cart/add.html?ASIN.1=…&Quantity.1=…`) fills an Amazon cart. It needs an Amazon Associates account, and finding the product IDs (ASINs) needs Amazon's product API, which needs recent affiliate sales. Not worth it now.
- **Trader Joe's:** no online ordering, so the list is all there is.

### What every connection needs

These parts are the same whatever the store:

1. **A product for each list item,** picked once per store and remembered (`store_products`): name, size, UPC or store ID, last price and photo. The first time, Mise shows the store's top matches with the small AI model's pick first. After that it's automatic, and you can always swap.
2. **Amounts turned into packages.** "3 cups chopped onion" becomes 2 onions; "1½ lb chicken thighs" becomes one 2 lb pack. This uses the grams Mise already works out for each ingredient and the product's size ("16 oz", "12 ct").
3. **A review before anything is sent:** each product with packages, price and any sale, plus swap, skip and a total.
4. **Nothing extra:** what's always on hand or already in the pantry is left out, as the list does today.

## Considered and dropped: ChatGPT and Claude app connectors (MCP)

We looked at letting the ChatGPT and Claude apps reach Mise through MCP (Model Context Protocol) connectors. We decided to call the providers' APIs from the server and keep the chat in the app instead. The reasons:

- **Connectors need real login.** They connect over public HTTPS and only support OAuth or no auth. They can't send an API key, so Mise would have to act as its own OAuth server.
- **ChatGPT might not be able to save anything.** OpenAI's help center lists write actions for custom connectors only on Business, Enterprise and Edu plans. On Plus, ChatGPT might only be able to read.
- **In-app chat is a better fit.** It sits next to the recipe while cooking, knows the current screen, and works the same whatever subscription you have.

If we ever want connectors, the same service layer and tool definitions could back an `/mcp` endpoint.

## Sources

- Mealie releases (feature reference): https://github.com/mealie-recipes/mealie/releases
- Walmart APIs overview: https://www.zinc.com/blog/walmart-api
- Walmart partner APIs (Recipes and Bundle, AddToCart): https://walmart.io/apirefservices
- Walmart's partner cart fills: https://business.pinterest.com/blog/turning-recipe-inspiration-into-shoppable-experiences-with-walmart/, https://help.bootstrapped.ventures/article/339-shop-with-walmart-button
- Kroger developer portal and FAQ (public vs Partner, daily limits): https://developer.kroger.com/, https://developer.kroger.com/support/faq
- Kroger API details: https://jentic.com/apis/kroger, https://github.com/CupOfOwls/kroger-api, https://www.val.town/x/bgschiller/personalShopper/code/docs/kroger-products.md
- Instacart Developer Platform: https://docs.instacart.com/developer_platform_api/, https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page, https://docs.instacart.com/developer_platform_api/api/retailers/get_nearby_retailers, https://docs.instacart.com/developer_platform_api/get_started/api-keys
- Costco same-day delivery through Instacart: https://www.freightwaves.com/news/2017-10-10-instacart-powers-costco-same-day-delivery
- Amazon Add to Cart form: https://webservices.amazon.co.jp/paapi5/documentation/add-to-cart-form.html
- USDA FoodData Central API: https://fdc.nal.usda.gov/api-guide/
- Claude web search tool: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- OpenAI image generation and pricing: https://developers.openai.com/api/docs/guides/image-generation, https://developers.openai.com/api/docs/pricing
- ChatGPT developer mode (connector research): https://developers.openai.com/api/docs/guides/developer-mode, https://help.openai.com/articles/12584461
- ChatGPT connector auth: https://docs.atlan.com/product/capabilities/atlan-ai/how-tos/chatgpt-remote-mcp
- Claude custom connectors: https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
