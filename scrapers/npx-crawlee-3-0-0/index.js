import Scraper from '../Scraper.js'
import { log, PlaywrightCrawler, Configuration } from 'crawlee'
import * as cheerio from 'cheerio'

export default class CrawleeScraper extends Scraper {
  constructor(config, url, debug) {
    super(config, url, debug)
  }
  async run() {
    await super.run()

    const customUserAgent = this?.customUserAgent

    if (!this.debug) {
      log.setLevel(log.LEVELS.OFF)
    }

    this.crawler = new PlaywrightCrawler({
      launchContext: customUserAgent ? { userAgent: customUserAgent } : {},
      requestHandler: async ({ request, page, response, enqueueLinks, log, pushData }) => {
        if (this.debug) {
          console.log(`Processing ${request.loadedUrl}`)
        }
        const pageContent = await page.content()
        const $ = cheerio.load(pageContent)
        let textContent = $(this.elementToScrape).text()
        if (textContent === '') {
          textContent = null
        }

        const statusCode = response.status()

        const title = await page.title()
        if (this.debug) {
          console.log(`Title of ${request.loadedUrl} is '${title}', status code: ${statusCode}`)
        }
        // Save results as JSON to ./storage/datasets/default
        //await pushData({ title, url: request.loadedUrl })

        // Save result to sqlite database.
        await this.logSuccessfulScrape({ url: request.loadedUrl, content: textContent, title, status: statusCode })

        // Extract links from the current page
        // and add them to the crawling queue.
        await enqueueLinks()
       
        await this.applyDelay()
      },
      failedRequestHandler: async ({ request, error }) => {
        await this.logFailedScrape({ url: request.url, status: error.message })
        if (this.debug) {
          console.log(`Failed request: ${request.url}, error: ${error.message}`)
        }
      },
      maxRequestsPerCrawl: this.maxRequestsPerRun,
      maxConcurrency: 1,
      maxRequestRetries: 0,
    },new Configuration({ persistStorage: false }))
    await this.crawler.run([this.urlToStartScrapingForm])
  }

  async close() {
    if (this.debug) {
      console.log('event listeners:', Configuration.getEventManager().listenerCount('aborting'))
    }
    await this.crawler.teardown()
    Configuration.resetGlobalState() // avoid lingering event listeners when recreating the crawler
    await super.close()
  }
}