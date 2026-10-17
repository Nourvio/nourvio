import { SALE_LEANS } from "@merran/shared"
import { z } from "zod"
import {
  choiceSetting,
  numberSetting,
  secretSetting,
  textSetting,
} from "../../core/settings.ts"

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
  leanOnSales: choiceSetting({
    key: "stores.leanOnSales",
    level: "household",
    choices: SALE_LEANS,
    description:
      "How much Fill the week and the weekly autoplan lean on what's on sale at the household's store: off, some, or lots. Only real deals count, not sales barely off the usual price.",
    default: "some",
  }),
  weeklyBudget: numberSetting({
    key: "stores.weeklyBudget",
    level: "household",
    schema: z.number().positive().max(100_000),
    description:
      "What the household means to spend on food in a week, in its store's currency (dollars at Kroger). Fill the week and the weekly autoplan pick recipes that fit what's left of it more often. Empty for none.",
  }),
}
