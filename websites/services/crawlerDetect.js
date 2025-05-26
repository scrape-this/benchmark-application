/**
 * @version 1.0.0
 */

import { Crawler } from 'es6-crawler-detect'

export default class CrawlerDetecr {
  check (req) {
    const CrawlerDetector = new Crawler(req)
    return CrawlerDetector.isCrawler()
  }
}