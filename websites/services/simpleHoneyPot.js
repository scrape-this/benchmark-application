/**
 * @version 1.0.0
 */

export default class SimpleHoneyPot {
  #blacklist = new Set()

  check (req) {
    if (this.#blacklist.has(req.ip)) {
      return true
    } else {
      if (req.path === '/honeypot') {
        this.#blacklist.add(req.ip)
        return true
      }
      return false
    }
  }
}
