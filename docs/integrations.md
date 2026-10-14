# Integrations

What Mise connects to, what we learned about each service (researched October 2026), and how we'll use it.

## Recipe sites

- **Structured data first.** Most recipe sites embed a machine-readable copy of the recipe in the page, using the schema.org `Recipe` JSON-LD format. Mealie and the `recipe-scrapers` library read the same data. It gives us:
  - name, image, servings and times
  - ingredient lines
  - steps, often with sections
  - keywords and category
  - sometimes nutrition
- **AI fallback.** When a page has no recipe data, we send the page's readable text (navigation, scripts and footers removed) to the import model and get a structured draft back (see [architecture.md](architecture.md#structured-extraction)). The page's `og:image` becomes the photo.
- **Fetching.** We send a normal browser user agent, time out after 15 seconds, and cap pages at 5 MB. Tracking parameters (`utm_*`, `fbclid` and so on) are dropped from the link first.
- **Sites that block us.** Some big publishers refuse requests that don't look like a browser:
  - Node's default TLS handshake is on some blocklists, so we connect over HTTP/2 with a browser's cipher order. Bon Appétit and NYT Cooking work, and so do Allrecipes and Simply Recipes most of the time.
  - Sites behind a JavaScript challenge (Budget Bytes, for one) refuse even curl. We stop there and don't try to get around it.
  - When a site blocks us, the UI suggests pasting the text instead. A later option is a bookmarklet that sends the page from your own browser, which is already past the check.
- **Duplicates.** Importing a link that's already in the library (also checked after redirects) returns the existing recipe, with a choice to import a copy anyway.
- **Safety.** The server refuses to fetch private-network addresses (localhost, 10.x, 192.168.x, link-local, carrier NAT and IPv6 equivalents). It resolves names itself and checks every address and every redirect, so a public name pointing at a private address is refused too.
- **Images.** The recipe image is downloaded and stored under `/data/images`, so it survives the site changing. A broken image doesn't fail the import.

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
- **Picking models:** Settings tracks spend by provider, model and task, so we can see where a cheaper model is good enough.

## Nutrition

1. **From the recipe site.** JSON-LD `NutritionInformation` (calories, proteinContent, fatContent and so on) is stored as-is, labeled "from site."
2. **Calculated from ingredients** with [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/):
   - It's free with an api.data.gov key (1,000 requests per hour by default).
   - We use two endpoints: `/foods/search` and `/food/{fdcId}`.
   - Each food is matched to an FDC entry once and saved as `foods.fdc_id`, with its nutrients per 100 g cached locally. That keeps API calls rare.
   - Ingredient amounts are converted to grams. Weights convert directly. Volumes and counts use FDC's portion data (`foodPortions`, like "1 cup chopped = 160 g" or "1 medium = 110 g"), stored in `foods.grams_per_unit`.
   - Per-serving totals are the sum divided by servings, labeled "calculated."
3. **AI estimate** when matching fails, labeled "estimate."

## Grocery ordering

### Walmart (our store)

**What exists:**
- There's no public API that adds items to a shopper's cart.
- Walmart's affiliate API is read-only: product data and links.
- The Commerce API can complete transactions but needs business approval.

([Zinc's overview](https://www.zinc.com/blog/walmart-api))

**Plan: a browser extension** (Chrome/Edge, Manifest V3) that works inside our own logged-in Walmart session.

1. Open walmart.com, signed in, and click the Mise extension.
2. It fetches the current list from Mise, using the personal API token from Settings.
3. Items already mapped to a product are added to the cart one at a time, with a short delay. Walmart rate-limits bursts with HTTP 429 errors.
4. For unmapped items, the extension shows Walmart search results for the item. Pick one and the mapping is saved back to Mise (`store_products`), so it's only asked once.
5. It ends with a summary: what was added, what was skipped, and estimated cost. Then you pick a pickup time and check out yourself.

**Before the cart, AI translates amounts** into product quantities using our saved products. For example, 3 cups of chopped onion becomes 2 yellow onions.

**Risks:**
- The extension depends on how Walmart's site works, so it will break now and then and need fixes.
- Automating a retailer's site is a gray area under their terms. This is low volume and on our own account.
- **Fallback:** the List screen can always show plain product links.

### Kroger family (if that's ever an option)

Kroger's banners include King Soopers, Ralphs, Fred Meyer, Smith's, Fry's and Harris Teeter. They have an official public API ([developer.kroger.com](https://developer.kroger.com)):

- product search and store locations
- a cart endpoint that adds items to a shopper's cart after they sign in with OAuth (scope `cart.basic:write`)
- no checkout endpoint; you finish in their app

This would be much sturdier than the Walmart extension. ([API overview](https://jentic.com/apis/kroger), [example client](https://pypi.org/project/kroger-cart/))

### Instacart

The [Instacart Developer Platform](https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page) turns a list into a shareable link. You pick a store on Instacart and check out there. It covers most chains, but as far as we know not Walmart. It's an option for stores other than Walmart.

## Considered and dropped: ChatGPT and Claude app connectors (MCP)

We looked at letting the ChatGPT and Claude apps reach Mise through MCP (Model Context Protocol) connectors. We decided to call the providers' APIs from the server and keep the chat in the app instead. The reasons:

- **Connectors need real login.** They connect over public HTTPS and only support OAuth or no auth. They can't send an API key, so Mise would have to act as its own OAuth server.
- **ChatGPT might not be able to save anything.** OpenAI's help center lists write actions for custom connectors only on Business, Enterprise and Edu plans. On Plus, ChatGPT might only be able to read.
- **In-app chat is a better fit.** It sits next to the recipe while cooking, knows the current screen, and works the same whatever subscription you have.

If we ever want connectors, the same service layer and tool definitions could back an `/mcp` endpoint.

## Sources

- Mealie releases (feature reference): https://github.com/mealie-recipes/mealie/releases
- Walmart APIs overview: https://www.zinc.com/blog/walmart-api
- Kroger API: https://jentic.com/apis/kroger, https://pypi.org/project/kroger-cart/
- Instacart Developer Platform: https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page
- USDA FoodData Central API: https://fdc.nal.usda.gov/api-guide/
- ChatGPT developer mode (connector research): https://developers.openai.com/api/docs/guides/developer-mode, https://help.openai.com/articles/12584461
- ChatGPT connector auth: https://docs.atlan.com/product/capabilities/atlan-ai/how-tos/chatgpt-remote-mcp
- Claude custom connectors: https://support.anthropic.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers
