import { forgetKrogerTokens } from "../../services/stores/kroger.ts"
import type { Module } from "../module.ts"
import { STORE_SETTINGS } from "./settings.ts"

/**
 * Stores with an API: Kroger (Fry's, Ralphs...), on with the server
 * admin's Kroger developer app. Link-only stores (a search address) need
 * nothing and are always there.
 */
export const stores: Module = {
  id: "stores",
  settings: Object.values(STORE_SETTINGS),
  capabilities: ["stores.kroger"],

  async status({ settings }) {
    const [id, secret] = await Promise.all([
      settings.server(STORE_SETTINGS.krogerClientId),
      settings.server(STORE_SETTINGS.krogerClientSecret),
    ])
    return id && secret ? { on: true } : { on: false, needs: "krogerApp" }
  },

  /** A new client ID or secret: the old app's tokens are no good. */
  async apply() {
    forgetKrogerTokens()
  },
}
