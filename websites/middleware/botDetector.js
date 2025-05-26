/**
 * Bot detection middleware, for configuring which bot detector will be used on the website.
 */

import  IsBot  from '../services/IsBot.js'
import  CrawlerCheck  from '../services/CrawlerDetect.js'
import SimpleHoneyPot from '../services/simpleHoneyPot.js'
import DelayedHoneyPot from '../services/delayedHoneyPot.js'
import None from '../services/None.js'

// Configured detectors to pick from: "none", "isbot", "crawlerDetector", "simpleHoneyPot", "delayedHoneyPot", "robotstxt"
// If you want to, you can also add your own detector to this file
let ACTIVE_METHOD

let botDetectorObj

// If adding your own, make sure to add it here:
const botDetectionClasses = {
  isbot: IsBot,
  crawlerDetector: CrawlerCheck,
  simpleHoneyPot: SimpleHoneyPot,
  delayedHoneyPot: DelayedHoneyPot,
  robotstxt: None,
  none: None
}

export const init = (detector, app) =>  {
  ACTIVE_METHOD = detector
  const botDetectorClass = botDetectionClasses[ACTIVE_METHOD]
  botDetectorObj = new botDetectorClass() 

  if (ACTIVE_METHOD === 'robotstxt') {
    app.get('/robots.txt', (req, res, next) => {
      res.type('text/plain')
      res.send(`User-agent: *\nDisallow: /`)
    })
  }
  
  return (req, res, next) => {
    next()
  }
}

export const botDetector = (req, res, next) => {

  // This will add a hidden honeypot link to each page, if adding another honeypot method add it to this if statement to activate the honeypot link leading to /honeypot
  if (ACTIVE_METHOD === 'simpleHoneyPot' || ACTIVE_METHOD === 'delayedHoneyPot') {
    res.locals.botMethod = 'honeypot'
  } else {
    res.locals.botMethod = 'other'
  }

  if (botDetectorObj.check(req)) { // if true, a bot has been detected
    // console.log(`[Bot Detected] Method: ${ACTIVE_METHOD}, IP: ${req.ip}`)
    req.isBot = true
    return res.status(403).send('Access denied: Bot detected')
  }

  next()
}
