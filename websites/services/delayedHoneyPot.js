/**
 * @version 1.0.0
 */

export default class DelayedHoneyPot {
  blacklist = new Set()

  check (req) {
    if (this.blacklist.has(req.ip)) {
      return true
    } else {
      if (req.path === '/honeypot') {
        setTimeout(this.blacklistUser, 5000, req.ip, this.blacklist) // wait 5 second before black listing the user
      }
      return false
    }
  }

  blacklistUser (ip, blacklist) {
    blacklist.add(ip)
  }
}
