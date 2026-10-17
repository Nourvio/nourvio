import { secretSetting, textSetting } from "../../core/settings.ts"

export const STORE_SETTINGS = {
  krogerClientId: textSetting({
    key: "stores.krogerClientId",
    env: "MERRAN_KROGER_CLIENT_ID",
    description:
      "Your Kroger developer app's client ID, from developer.kroger.com: for Kroger's stores (Fry's, Ralphs, King Soopers...), their products, prices and sales, and sending a list to the cart.",
  }),
  krogerClientSecret: secretSetting({
    key: "stores.krogerClientSecret",
    env: "MERRAN_KROGER_CLIENT_SECRET",
    description: "Your Kroger developer app's client secret.",
  }),
}
