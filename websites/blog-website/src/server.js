import httpContext from 'express-http-context' 
import express from 'express'
import expressLayouts from 'express-ejs-layouts'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { router } from './routes/router.js'
import db from './database/db.js'
import { populateDatabase } from './database/populateDb.js'
import { botDetector, init } from '../../middleware/botDetector.js'
import { requestLogger } from './middleware/RequestLogger.js'

export default class BlogWebsite {
  #server
  #nextRun = 0
  #userAgents = new Set()
  /**
   * Starts and runs the server
   */
  run (detector, PORT, debug) {
    try {
      populateDatabase()

      // Create a new run_id for the current run.
      const lastRun = db.prepare(`SELECT MAX(run_id) AS run_id FROM Request_logger`).get()
      this.#nextRun = (lastRun?.run_id || 0) + 1

      const app = express()
    
      app.use(httpContext.middleware)
    
      const directoryFullName = dirname(fileURLToPath(import.meta.url))
    
      app.set('view engine', 'ejs')
      app.set('views', join(directoryFullName, 'views'))
      app.set('layout', join(directoryFullName, 'views', 'layouts', 'default'))
      app.set('layout extractScripts', true)
      app.set('layout extractStyles', true)
      app.use(expressLayouts)
      app.use(express.static('./websites/blog-website/public'))

      app.use((req, res, next) => {
        req.runId = this.#nextRun
        const newUserAgent = req.get('user-agent') ?? '(error: no user-agent)'
        this.#userAgents.add(newUserAgent)
        next()
      })
      
      app.use(init(detector, app))
      app.use(requestLogger)
      app.use(botDetector)
    
      app.use('/', router)
    
      this.#server = app.listen(PORT, () => {
        // console.log(`Server running at http://localhost:${this.#server.address().port}`)
        // console.log('Press Ctrl-C to terminate...')
      })
    } catch (err) {
      console.error(err)
    }
  }

  close (debug) {
    this.#server.close(() => {
      // console.log('server closed')
      return true
    })
  }

  getDbInfo () {
    const totalRequests = db.prepare(`SELECT COUNT(*) AS totalRequests FROM Request_logger WHERE run_id = ?`).get(this.#nextRun).totalRequests

    // TODO: to also implement human requests to check for false positives, change the code down below
    let incorrectlyClassifiedRequests = db.prepare(`SELECT COUNT(*) AS successfulRequests FROM Request_logger WHERE run_id = ? AND is_bot = 0`).get(this.#nextRun).successfulRequests
    incorrectlyClassifiedRequests = incorrectlyClassifiedRequests

    const correctlyClassifiedRequestsNumber = db.prepare(`SELECT COUNT(*) AS unSuccessfulRequests FROM Request_logger WHERE run_id = ? AND is_bot = 1`).get(this.#nextRun).unSuccessfulRequests
    const correctlyClassifiedRequests = correctlyClassifiedRequestsNumber

    // select number of requests where the url does not have /honeypot in it
    const totalRequestsWithoutHoneypot = db.prepare(`SELECT COUNT(*) AS totalRequestsWithoutHoneypot FROM Request_logger WHERE run_id = ? AND url NOT LIKE '%/honeypot%'`).get(this.#nextRun).totalRequestsWithoutHoneypot

    let accuracy
    if ( correctlyClassifiedRequestsNumber !== 0) {
      accuracy = ( correctlyClassifiedRequestsNumber / totalRequests )
      accuracy = (accuracy * 100).toFixed(2) + '%'
    } else {
      accuracy = '0.00%'
    }

    return {
      totalRequests,
      incorrectlyClassifiedRequests,
      correctlyClassifiedRequests,
      accuracy,
      userAgents: Array.from(this.#userAgents),
      totalRequestsWithoutHoneypot
    }
  }
}