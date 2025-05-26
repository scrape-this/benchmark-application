/**
 * @version 1.0.0
 */

import { isbot } from "isbot"

export default class IsBot {
  check (req) {
    const userAgent = req.get('User-Agent')
    return isbot(userAgent)
  }
}
