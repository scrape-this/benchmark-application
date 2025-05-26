import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { writeResultsToFile, getPackageVersion } from './benchmark-helper.js'

const websites = []
const scraperResults = []
const detectorResults = []

/*
 * This is the main function that runs the benchmark.
 */
async function main() {
  try {
    const applicationVersion = await getPackageVersion()
    console.log(`Running application version ${applicationVersion}`)

    // Load the benchmark configuration file
    const benchmarkConfig = (await loadConfigFile('benchmark.json'))

    if (applicationVersion !== benchmarkConfig.application_version) {
      console.log(`Benchmark application version ${applicationVersion} does not match the benchmark configuration version ${benchmarks.application_version} in benchmark.json. Download the correct version of the benchmark application and run again.`)
      throw new Error('Version mismatch')
    }

    // For each benchmark
    for (const benchmark of benchmarkConfig.benchmarks) {
      // Load the scraper and website configuration file
      let debug = benchmark.debug ? benchmark.debug : false
      const scraperConfig = await loadConfigFile(benchmark.scraper_config)
      const websiteConfig = await loadConfigFile(benchmark.website_config)
      const detectorConfig = await loadConfigFile(benchmark.detector_config)
      const delayConfig = await loadConfigFile(benchmark.delay_config)
      const useragentConfig = await loadConfigFile(benchmark.useragent_config)
      
      await runScraper(scraperConfig, websiteConfig, detectorConfig, delayConfig, useragentConfig, debug)
    }
  } catch (error) {
    console.log(`Benchmark failed with error: ${error.message}`)
    console.error(error)
  }
}

async function runScraper (scraperConfig, websiteConfig, detectorConfig, delayConfig, useragentConfig, debug) {
  try {
    console.log(JSON.stringify(scraperConfig, null, 2)) // Print the scraper configuration
    console.log(JSON.stringify(websiteConfig, null, 2)) // Print the website configuration
    console.log(JSON.stringify(detectorConfig, null, 2)) // Print the detector configuration
    console.log(JSON.stringify(delayConfig, null, 2)) // Print the delay configuration
    console.log(JSON.stringify(useragentConfig, null, 2)) // Print the user agent configuration

    const scrapers = scraperConfig.scrapers
    const websites = websiteConfig.websites
    const detectors = detectorConfig.detectors
    const delays = delayConfig.delays
    const userAgents = useragentConfig.custom_user_agents

    const activeScrapers = scrapers.filter(scraper => scraper.active)
    const activeDelays   = delays.filter(delay   => delay.active)
    const activeUserAgents = userAgents.filter(useragent => useragent.active)
    const activeWebsites = websites.filter(website => website.active)
    const activeDetectors = detectors.filter(detector => detector.active)

    const numberOfScrapers = activeScrapers.length ? activeScrapers.length : 0
    const numberOfDelays = activeDelays.length ? activeDelays.length : 0
    const numberOfUserAgents = activeUserAgents.length ? activeUserAgents.length : 0
    const numberOfWebsites = activeWebsites.length ? activeWebsites.length : 0
    const numberOfDetectors = activeDetectors.length ? activeDetectors.length : 0
    
    const numberOfTests = numberOfScrapers * numberOfDelays * numberOfUserAgents * numberOfWebsites * numberOfDetectors

    if (numberOfScrapers === 0) {
      throw new Error("Error: No scrapers provided. Please define at least one scraper in the scraper.json configuration.")
    }
    if (numberOfWebsites === 0) {
      throw new Error("Error: No websites provided. Please define at least one website in the website.json configuration.")
    }
    if (numberOfDetectors === 0) {
      throw new Error("Error: No detectors provided. Please define at least one detector in the detector.json configuration (can be set to none for no detector).")
    }
    if (numberOfDelays === 0) {
      throw new Error("Error: No delays provided. Please define at least one delay in the delay.json configuration (can be set to 0 for no delay).")
    }
    if (numberOfUserAgents === 0) {
      throw new Error("Error: No user agents provided. Please define at least one user agent in the useragent.json configuration (can be set to none for no custom user agent).")
    }

    console.log(`Number of scrapers: ${numberOfScrapers}`)
    console.log(`Number of delays: ${numberOfDelays}`)
    console.log(`Number of user agents: ${numberOfUserAgents}`)
    console.log(`Number of websites: ${numberOfWebsites}`)
    console.log(`Number of detectors: ${numberOfDetectors}`)
    console.log(`Number of tests: = ${numberOfScrapers} * ${numberOfDelays} * ${numberOfUserAgents} * ${numberOfWebsites} * ${numberOfDetectors} = ${numberOfTests}`)
    console.log(`-------------------------------------------------`)
    console.log(`BENCHMARKING STARTED`)
    console.time(`\nTotal runtime`)

    let currentTest = 1

    for (const scraper of activeScrapers) {
      for (const delay of activeDelays) {
        for (const useragent of activeUserAgents) {
          for (const website of activeWebsites) {
            for (const detector of activeDetectors) {
              if (!debug) {
                process.stdout.write(`\rRunning test ${currentTest} of ${numberOfTests} (${((currentTest - 1) / numberOfTests * 100).toFixed(2)}%)`)
              }
              currentTest++
        
              // BUG FIX: the cfg and site copies fixes a bug where settings where carried over from one scraper to another (user agent didnt get cleared)
              // deep copy clone so we don’t overwrite the originals, and to make sure that no settings are carried over from one test to another
              const config  = JSON.parse(JSON.stringify(scraper.config))
              const site = { ...website, detection_technique: detector.name }

              // inject this iteration’s settings
              config.delay_ms = delay.delay_ms
              
              // Only set the custom_user_agent if there is a value, otherwise delete any existing custom_user_agent
              if (useragent.user_agent) {
                config.custom_user_agent = useragent.user_agent
              } else {
                delete config.custom_user_agent
              }

              runWebsite(site, debug)
              await sleep(2000)
              if (debug) {
                console.log("-------------------------------------------------")
                console.log("Running scraper against website with the following config...")
                console.table({
                  'Website': site.name + ` (port: ${site.port})`,
                  'Detection technique': detector.name,
                  'Scraper': scraper.name,
                  'Delay (ms)': delay.delay_ms,
                  'User agent': useragent.user_agent ? useragent.user_agent : 'Scraper default value',
                })
              }
                
              // Import the scraper module dynamically
              const modulePath = new URL(`./scrapers/${scraper.module}/index.js`, import.meta.url)
              const importedModule = await import(modulePath.href)
              const ScraperClass = importedModule.default     
      
              // Create an instance of the scraper class and run it
              const scraperInstance = new ScraperClass(config, site.url, debug)
              await scraperInstance.start()

              const result = await scraperInstance.getResults()
              const siteResults = await closeWebsite(debug)
              const detectedUserAgent = siteResults.userAgents
              delete siteResults.userAgents // Delete to avoid affecting the generated HTML table

              scraperResults.push({
                scraper: scraper.name,
                runID: result.runID,
                delayMs: delay.delay_ms,
                userAgent:  config.custom_user_agent ? config.custom_user_agent : "None",
                detailedUserAgent: detectedUserAgent,
                website: site.name,
                detector: detector.name,
                totalRequests: result.totalRequests,
                totalTime: result.totalTime,
                pagesSuccessfullyScraped: result.pagesScraped,
                pagesFailedtoScrape: result.pagesFailedtoScrape,
                totalPagesToScrape: website.pagesToScrape,
                maxRequests: config.maxRequestsPerRun,
                totalRequestsWithoutHoneypot: siteResults.totalRequestsWithoutHoneypot
              })

              // print out the whole object
              if (debug) {
                console.log("Scraper results:")
                console.table({
                  scraper: scraper.name,
                  runID: result.runID,
                  delayMs: delay.delay_ms,
                  userAgent:  config.custom_user_agent ? config.custom_user_agent : "None",
                  detailedUserAgent: detectedUserAgent,
                  website: site.name,
                  detector: detector.name,
                  totalRequests: result.totalRequests,
                  totalTime: result.totalTime,
                  pagesSuccessfullyScraped: result.pagesScraped,
                  pagesFailedtoScrape: result.pagesFailedtoScrape
                })
              }
    
              detectorResults.push({
                detector: site.detection_technique,
                website: site.name,
                scraper: scraper.name,
                delayMs: delay.delay_ms,
                userAgent:  config.custom_user_agent ? config.custom_user_agent : "None",
                detailedUserAgent: detectedUserAgent,
                runID: result.runID,
                ...siteResults
              })
              if (debug) {
                console.log("Detector results:")
                console.table({
                  detector: site.detection_technique,
                  website: site.name,
                  scraper: scraper.name,
                  delayMs: delay.delay_ms,
                  userAgent:  config.custom_user_agent ? config.custom_user_agent : "None",
                  detailedUserAgent: detectedUserAgent,
                  runID: result.runID,
                  ...siteResults
                })
              }
              // Close the scraper instance
              await scraperInstance.close()
            }
          }
        }
      }
    }
    if (!debug) {
      process.stdout.write(`\rRunning test ${currentTest - 1} of ${numberOfTests} (${((currentTest - 1) / numberOfTests * 100).toFixed(2)}%)`)
      console.log(`\nBENCHMARKING COMPLETED`)
    }
    console.timeEnd(`\nTotal runtime`)

    await writeResultsToFile(detectorResults, scraperResults)
  } catch (error) {
    console.log(`Scraper failed with error: ${error.message}`)
    console.error(error)
  }
}

async function runWebsite (websiteConfig, debug) {
 try {
    if (debug) {
      console.log(`Starting website: ${websiteConfig.name}`)
    }

    // Import the website module dynamically
    const modulePath = new URL(`./websites/${websiteConfig.name}/src/server.js`, import.meta.url)
    const importedModule = await import(modulePath.href)
    const WebsiteClass = importedModule.default    
    
    const website = new WebsiteClass()
    websites.push(website)
    website.run(websiteConfig.detection_technique, websiteConfig.port, debug)
 } catch (error) {
  console.log(`Website failed with error: ${error.message}`)
  console.error(error)
 } 
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadConfigFile (fileName) {
  console.log(`Loading config file: ${fileName}`)
  try {
    const configPath = fileURLToPath(new URL(`./configs/${fileName}`, import.meta.url))
    const data = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error(`Failed to load config file ${fileName}, error message: ${error.message}`)
    throw error
  }
}

function closeWebsite (debug) {
  const site = websites.shift()
  const dbInfo = site.getDbInfo()
  site.close(debug)
  return dbInfo
}

main()
