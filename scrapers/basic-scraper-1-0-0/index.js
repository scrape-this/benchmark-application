import Scraper from '../Scraper.js'
import * as cheerio from 'cheerio'

export default class BasicScraper extends Scraper{
    constructor(config, url, debug) {
        super(config, url, debug)
        this.requestCount = 0
        this.scrapedUrls = new Set()
      }
        
    async crawlAndScrape(url) {
        const urlsToScrape = [url]

        if (this.debug) {
            console.log(`Starting crawl with ${urlsToScrape.length} URLs to scrape.`)
        }

        while (urlsToScrape.length > 0 && this.requestCount < this.maxRequestsPerRun) {
            const currentUrl = urlsToScrape.shift()
            if (this.scrapedUrls.has(currentUrl)) {
                if (this.debug) {
                    console.log(`Already scraped ${currentUrl}, skipping.`)
                }
                continue
            }
            try {
                const response = await fetch(currentUrl, {
                    headers: this?.customUserAgent ? { 'User-Agent': this.customUserAgent } : {},
                })
    
                if (!response.ok) {
                    throw new Error(`${response.status}`)
                }
    
                const html = await response.text()
                const $ = cheerio.load(html)
    
                const textContent = $(this.elementToScrape).text().trim() || null

                const statusCode = response.status
        
                const title = $('title').text()
                if (this.debug) {
                    console.log(`Title of ${currentUrl} is '${title}', status code: ${statusCode}`)
                }
        
                // Save result to sqlite database.
                await this.logSuccessfulScrape({ url: currentUrl, content: textContent, title, status: statusCode })

                if (this.debug) {
                    console.log(`Scraped ${currentUrl} successfully.`)
                }
                
                const newUrls = this.extractNewUrls($, currentUrl)
                urlsToScrape.push(...newUrls)
                
                await this.applyDelay()
            } catch (error) {
                if (this.debug) {
                    console.log(`Failed to scrape ${currentUrl}: ${error.message}`)
                }
                await this.logFailedScrape({ url: currentUrl, status: error.message })
            }
            this.requestCount++
            this.scrapedUrls.add(currentUrl)
        }
    }
    extractNewUrls($, currentUrl) {
        const urls = []
        const a = $('body').find('a')

        for (let i = 0; i < a.length; i++) {
            const href = $(a[i]).attr('href')
            if (href != null) {
                urls.push(new URL(href, currentUrl).href)
            }
        }
        if (this.debug) {
            console.log(`Found ${urls.length} new URLs on the page.`)
        }
        return urls
    }

    async run () {
        super.run()
        await this.crawlAndScrape(this.urlToStartScrapingForm)
    }
}
