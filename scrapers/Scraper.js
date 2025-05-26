import db from '../database/scraper-db.js'

export default class Scraper {
  #nextRun = 0
  #results
  #config

  constructor(config, url, debug) {
    if (new.target === Scraper) {
      throw new Error("Scraper should only be instantiated through a subclass.");
    }
    if (this.run === Scraper.prototype.run) {
      throw new Error("A subclass must implement the run method.");
    }
    this.#config = config
    this.urlToStartScrapingForm = url
    this.debug = debug
    this.maxRequestsPerRun = this.#config.maxRequestsPerRun
    this.customUserAgent = this.#config.custom_user_agent
    this.elementToScrape = this.#config.elementToScrape
  }

  async logSuccessfulScrape ({ url, status, title, content }) {
    const insertPage = db.prepare('INSERT INTO Requests (run_id, url, content, title, status) VALUES (?, ?, ?, ?, ?)')
    insertPage.run(this.nextRun, url, content, title, status)
  }

  async logFailedScrape ({ url, status }) {
    const insertPage = db.prepare('INSERT INTO Requests (run_id, url, status) VALUES (?, ?, ?)')
    insertPage.run(this.nextRun, url, status)
  }

  async run () {
    // Create a new run_id for the current crawl.
    const lastRun = db.prepare(`SELECT MAX(run_id) AS run_id FROM Requests`).get()
    this.nextRun = (lastRun?.run_id || 0) + 1
  }

  async start () {
    const start = Date.now()
    await this.run()
    const end = Date.now()
    
    // Extract measurments from db
    const totalRequests = db.prepare(`SELECT COUNT(*) AS totalRequests FROM Requests WHERE run_id = ?`).get(this.nextRun).totalRequests
    const successfulRequests = db.prepare(`SELECT COUNT(*) AS successfulRequests FROM Requests WHERE run_id = ? AND status = 200`).get(this.nextRun).successfulRequests
    const blockedRequests = db.prepare(`SELECT COUNT(*) AS blockedRequests FROM Requests WHERE run_id = ? AND status != 200`).get(this.nextRun).blockedRequests
    const pagesScraped = db.prepare(`SELECT COUNT(*) AS pagesScraped FROM Requests WHERE run_id = ? AND content IS NOT NULL`).get(this.nextRun).pagesScraped
    const pageFailedToScrape = db.prepare(`SELECT COUNT(*) AS pageFailedToScrape FROM Requests WHERE run_id = ? AND content IS NULL`).get(this.nextRun).pageFailedToScrape
    const successfulRequestsBeforeBlocked = db.prepare(`SELECT COUNT(*) AS successfulRequestsBeforeBlocked FROM Requests WHERE run_id = ? AND status = 200 AND page_id < (SELECT MIN(page_id) FROM Requests WHERE run_id = ? AND status != 200)`).get(this.nextRun, this.nextRun).successfulRequestsBeforeBlocked
    const pagesScrapedBeforeBlocked = db.prepare(`SELECT COUNT(*) AS pagesScrapedBeforeBlocked FROM Requests WHERE run_id = ? AND content IS NOT NULL AND page_id < (SELECT MIN(page_id) FROM Requests WHERE run_id = ? AND status != 200)`).get(this.nextRun, this.nextRun).pagesScrapedBeforeBlocked
    const timestampOfFirstBlock = db.prepare(`SELECT timestamp FROM Requests WHERE run_id = ? AND status != 200 ORDER BY page_id LIMIT 1`).get(this.nextRun)?.timestamp
    const firstBlockTime = new Date(timestampOfFirstBlock + 'Z').getTime() // convert the date to milliseconds, use UTC time to be consistent with sqlite db
    const timeUntilFirstBlockInSeconds = parseFloat(((firstBlockTime - start) / 1000).toFixed(3))
    const startingURL = this.url

    // Do some measurements
    const totalTime = parseFloat(((end - start) / 1000 ).toFixed(3))
    const successfulRequestsPrint = successfulRequests + ' (' + (successfulRequests / totalRequests * 100).toFixed(2) + '%)'
    const blockedRequestsPrint = blockedRequests + ' (' + (blockedRequests / totalRequests * 100).toFixed(2) + '%)'
    const pagesScrapedPrint = pagesScraped + ' (' + (pagesScraped / totalRequests * 100).toFixed(2) + '%)'
    const pagesFailedToScrapePrint = pageFailedToScrape + ' (' + (pageFailedToScrape / totalRequests * 100).toFixed(2) + '%)'
    const successfulRequestsBeforeBlockedPrint = blockedRequests > 0 ? successfulRequestsBeforeBlocked + ' (' + (successfulRequestsBeforeBlocked / totalRequests * 100).toFixed(2) + '%)' : 'N/A'
    const pagesScrapedBeforeBlockedPrint = blockedRequests > 0 ? pagesScrapedBeforeBlocked + ' (' + (pagesScrapedBeforeBlocked / totalRequests * 100).toFixed(2) + '%)' : 'N/A'
    const timeUntilFirstBlockPrint = blockedRequests > 0 ? timeUntilFirstBlockInSeconds + ' (' + (timeUntilFirstBlockInSeconds / ((end - start) / 1000) * 100).toFixed(2) + '%)' : 'N/A'
    
    // Show table with measurements to the console
    if (this.debug) {
      console.table({
        'Run ID': this.nextRun,
        'URL': startingURL,
        'Total requests': totalRequests,
        'Total time (s)': totalTime,
        'Successful Requests': successfulRequestsPrint,
        'Blocked Requests': blockedRequestsPrint,
        'Pages Scraped': pagesScrapedPrint,
        'Pages Failed to Scrape': pagesFailedToScrapePrint,
        'Successful Requests Before Blocked': successfulRequestsBeforeBlockedPrint,
        'Pages Scraped Before Blocked': pagesScrapedBeforeBlockedPrint,
        'Time until first block (s)':timeUntilFirstBlockPrint
      })
    }

    this.#results = {
      runID: this.nextRun,
      URL: startingURL,
      totalRequests: totalRequests,
      totalTime: totalTime,
      successfulRequests: successfulRequestsPrint,
      blockedRequests: blockedRequestsPrint,
      pagesScraped: pagesScrapedPrint,
      pagesFailedtoScrape: pagesFailedToScrapePrint,
      successfulRequestsBeforeBlocked: successfulRequestsBeforeBlockedPrint,
      pagesScrapedBeforeBlocked: pagesScrapedBeforeBlockedPrint,
      timeUntilFirstBlock: timeUntilFirstBlockPrint
    }
  }

  async close () {
    // Optional. Terminate the scraper, add any cleanup code here
  }

  async applyDelay () {
    if (this.#config?.delay_ms) {
      const delay = this.#config.delay_ms
      if (this.debug) {
        console.log(`Applying delay of ${delay} ms`)
      }
      return new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  getResults () {
    return this.#results
  }
}
