import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import path from 'path'
import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { format } from 'date-fns'

/*
 * This function creates a HTML file out of the benchmark results.
 *
 * @param {Array} detectorResults - The results of the detector.
 * @param {Array} scraperResults - The results of the scraper.
 * @return {Promise<void>} - A promise that resolves when the results are written to the file.
 */
export async function writeResultsToFile (detectorResults, scraperResults) {
  // Date for the folder name
  const date = format(new Date(), 'yyyy-MM-dd-HH-mm')

  // Date for the HTML results
  const [year, month, day, hour, minute] = date.split('-')
  const formattedDate = `${year}-${month}-${day}`
  const formattedTime = `${hour}:${minute}`

  // Create the folder
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const mainFolder = `results-${date}`
  await fs.mkdir(mainFolder, { recursive: true })

  // Copy the configs folder to the results folder
  const sourceFolder = path.join(__dirname, 'configs')
  const targetFolder = path.join(mainFolder, 'configs')
  await fs.cp(sourceFolder, targetFolder, { recursive: true })

  const zipName = `${mainFolder}.zip`

  // Group results by detector and scraper
  let groupedDetectorResults = {}
  for (const result of detectorResults) {
    const key = result.detector
    if (!groupedDetectorResults[key]) {
      groupedDetectorResults[key] = []
    }
    groupedDetectorResults[key].push(result)
  }

  let groupedScraperResults = {}
  for (const result of scraperResults) {
    const key = result.scraper
    if (!groupedScraperResults[key]) {
      groupedScraperResults[key] = []
    }
    groupedScraperResults[key].push(result)
  } 
  
  // Create variables to store the averages
  const scraperAverages = []
  const detectorAverages = []

  const htmlTemplate = async ({ content, active }) => {
    const version = await getPackageVersion()
    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <title>Benchmark Results</title>
          ${css}
        </head>
        <body>
          <header>
            <div class="header-left">
              <span>Benchmark v${version}</span>
              <span>Run: ${formattedDate} ${formattedTime}</span>
            </div>
            <div class="header-center">
              <nav class="segmented-control">
                <a href="index.html" class="${active === 'summary' ? 'active' : ''}">Summary</a>
                <a href="detector.html" class="${active === 'detector' ? 'active' : ''}">Detector</a>
                <a href="scraper.html" class="${active === 'scraper' ? 'active' : ''}">Scraper</a>
              </nav>
            </div>
            <div class="header-right">
              <span>Configs: <a href="configs">/configs</a></span>
              <a href="${zipName}" class="btn-download" download>Download results</a>
            </div>
          </header>
          <main class="container">
            ${content}
          </main>
        </body>
      </html>
    `
  }

  let htmlDetector = `
  <h1>Detector results</h1>`

  for (const [detectorName, results] of Object.entries(groupedDetectorResults)) {
    htmlDetector += `
      <h2 id="${detectorName}"> ${detectorName} </h2>
      <div class="table-wrapper">
      <table class="detectTable">
      <thead>
        <tr>
          <th> Run ID </th>
          <th> Website </th>
          <th> Scraper </th>
          <th> Delay (ms) </th>
          <th> Custom User-Agent </th>
          <th> Total Requests </th>
          <th title="True Positive Bot Detection"> Correctly Classified </th>
          <th title="False Negative Bot Detection"> Incorrectly Classified </th>
          <th> Accuracy </th>
        </tr>
        </thead>
        <tbody>`

    let theTotalRequests = 0
    let avgIncorrectlyClassified = 0
    let totalCorrectlyClassified = 0
    let detectorIdentifiedBots = 0

    for (const result of results) {
      let title = ''
      if (result.userAgent === "None") {
        let value = Array.isArray(result.detailedUserAgent) ? result.detailedUserAgent.join('\n\n') : result.detailedUserAgent
        title = `title="Scraper user agents:\n\n${value}"`
      }

      htmlDetector +=`
      <tr>
        <td> ${result.runID} </td>
        <td> ${result.website} </td>
        <td> ${result.scraper} </td>
        <td> ${result.delayMs} </td>
        <td ${title}> ${result.userAgent} </td>
        <td> ${result.totalRequests} </td>
        <td> ${result.correctlyClassifiedRequests} </td>
        <td> ${result.incorrectlyClassifiedRequests} </td>
        <td> ${result.accuracy} </td>
      </tr>`

      theTotalRequests += extractNumber(result.totalRequests)
      avgIncorrectlyClassified += extractNumber(result.incorrectlyClassifiedRequests)
      totalCorrectlyClassified += extractNumber(result.correctlyClassifiedRequests)

      if (Number(result.correctlyClassifiedRequests > 0)) {
        detectorIdentifiedBots += 1
      }
    }

    const numOfResults = results.length
    let avgRequests = (theTotalRequests / numOfResults)
    avgIncorrectlyClassified = (avgIncorrectlyClassified / numOfResults)
    avgIncorrectlyClassified = avgIncorrectlyClassified.toFixed(2) 
    let avgCorrectlyClassified = (totalCorrectlyClassified / numOfResults)
    const accuracyPercentage = ((totalCorrectlyClassified / theTotalRequests) * 100).toFixed(2)
    avgCorrectlyClassified = avgCorrectlyClassified.toFixed(2)
    let botsDetectedPercentage = ((detectorIdentifiedBots / numOfResults) * 100).toFixed(2)

    htmlDetector +=`
    <tr>
      <td> Average: </td>
      <td> - </td>
      <td> - </td>
      <td> - </td>
      <td> - </td>
      <td> ${avgRequests} </td>
      <td> ${avgCorrectlyClassified} </td>
      <td> ${avgIncorrectlyClassified}  </td>
      <td> ${accuracyPercentage}% </td>
    </tr>
    </tbody>
    </table>
    </div>`

    detectorAverages.push({
      detector: detectorName,
      totalCorrectlyClassified: totalCorrectlyClassified,
      theTotalRequests: theTotalRequests,
      accuracy: accuracyPercentage,
      totalExperiments: results.length,
      detectorIdentifiedBots: detectorIdentifiedBots,
      botsDetectedPercentage: botsDetectedPercentage
    })
  } 

  let htmlScraper = `
    <h1>Scraper results</h1>`

  for (const [scraperName, results] of Object.entries(groupedScraperResults)) {
    htmlScraper += `
      <h2 id="${scraperName}"> ${scraperName} </h2>
      <div class="table-wrapper">
      <table class="scrapeTable">
      <thead>
        <tr>
          <th> Run ID </th>
          <th> Delay (ms) </th>
          <th> Custom User-Agent </th>
          <th> Website </th>
          <th> Detector </th>
          <th> Total Requests </th>
          <th> Total Time (s) </th>
          <th> Pages Successfully Scraped </th>
          <th> Pages failed to scrape </th>
        </tr>
        </thead>
        <tbody>`

    let theTotalRequests = 0
    let avgTime = 0
    let totalPagesScraped = 0
    let avgPagesFailedScrape = 0
    let scraperUndetected = 0
    let totalPagesToScrape = 0
    let totalRequestsWithoutHoneypot = 0


  
    for (const result of results) {
      let title = ''
      if (result.userAgent === "None") {
        let value = Array.isArray(result.detailedUserAgent) ? result.detailedUserAgent.join('\n\n') : result.detailedUserAgent
        title = `title="Scraper user agents:\n\n${value}"`
      }

      htmlScraper += `
      <tr>
        <td> ${result.runID} </td>
        <td> ${result.delayMs} </td>
        <td ${title}> ${result.userAgent} </td>
        <td> ${result.website} </td>
        <td> ${result.detector} </td>
        <td> ${result.totalRequests} </td>
        <td> ${result.totalTime} </td>
        <td> ${result.pagesSuccessfullyScraped} </td>
        <td> ${result.pagesFailedtoScrape} </td>
      </tr>`

      totalPagesToScrape += extractNumber(result.totalPagesToScrape)
      theTotalRequests += extractNumber(result.totalRequests)
      avgTime += extractNumber(result.totalTime)
      totalPagesScraped += extractNumber(result.pagesSuccessfullyScraped)
      avgPagesFailedScrape += extractNumber(result.pagesFailedtoScrape)
      totalRequestsWithoutHoneypot += extractNumber(result.totalRequestsWithoutHoneypot)
      // console log pagesFailedtoScrape
      if (Number(extractNumber(result.pagesFailedtoScrape))  === 0) {
        scraperUndetected += 1
      }
    }

    const numOfResults = results.length
    let avgRequests = (theTotalRequests / numOfResults)
    avgTime = (avgTime / numOfResults).toFixed(2)

    let avgPagesScraped = (totalPagesScraped / numOfResults)
    
    const successRateRequests = ((totalPagesScraped / theTotalRequests) * 100).toFixed(2)
    const successRateExperiments = ((scraperUndetected / numOfResults) * 100).toFixed(2)

    avgPagesScraped = avgPagesScraped.toFixed(2) + ' (' + ((avgPagesScraped / avgRequests) * 100).toFixed(2) + '%)'
    avgPagesFailedScrape = (avgPagesFailedScrape / numOfResults)
    avgPagesFailedScrape = avgPagesFailedScrape.toFixed(2) + ' (' + ((avgPagesFailedScrape / avgRequests) * 100).toFixed(2) + '%)'
    avgRequests = avgRequests.toFixed(2)
    
    const coverage = (totalRequestsWithoutHoneypot /  totalPagesToScrape * 100).toFixed(2) 
    htmlScraper += `
    <tr>
      <td> Average: </td>
      <td> - </td>
      <td> - </td>
      <td> - </td>
      <td> - </td>
      <td> ${avgRequests} </td>
      <td> ${avgTime} </td>
      <td> ${avgPagesScraped} </td>
      <td> ${avgPagesFailedScrape} </td>
    </tr>
    </tbody>
    </table>
    </div>`

    scraperAverages.push({
      scraper: scraperName,
      totalRequests: theTotalRequests,
      totalPagesScraped: totalPagesScraped,
      totalRequestsWithoutHoneypot: totalRequestsWithoutHoneypot,
      successRate: successRateRequests,
      totalExperiments : numOfResults,
      scraperUndetected: scraperUndetected,
      successRateExperiments: successRateExperiments,
      coverage: coverage,
      totalPagesToScrape: totalPagesToScrape
    })
  } 

  // Generate the matrix
  // Pivot: group by scraper → UA → delay
  const pivot = {}
  const detMap = {}

  for (const r of detectorResults) {
    // Build pivot structure
    pivot[r.scraper] ??= {}
    pivot[r.scraper][r.userAgent] ??= {}
    pivot[r.scraper][r.userAgent][r.delayMs] ??= []
    pivot[r.scraper][r.userAgent][r.delayMs].push(r)

    // Build detector-to-websites map
    detMap[r.detector] ??= new Set()
    detMap[r.detector].add(r.website)
  }

  // All detectors and websites
  const detectors = Object.keys(detMap)
  const detWebsitePairs = detectors.flatMap(det => 
    Array.from(detMap[det]).map(site => [det, site])
  )

  // Generate matrix headers
  let htmlSummary = `
  <h1>Detector accuracy matrix</h1>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th rowspan="2">Scraper</th>
          <th rowspan="2">Custom User-Agent</th>
          <th rowspan="2">Delay</th>
  `

  // First header row: detectors with colspan
  for (const det of detectors) {
    htmlSummary += `<th colspan="${detMap[det].size}">${det}</th>\n`
  }
  htmlSummary += `</tr>\n<tr>\n`

  // Second header row: websites
  for (const det of detectors) {
    for (const site of detMap[det]) {
      htmlSummary += `<th>${site}</th>\n`
    }
  }
  htmlSummary += `</tr>\n</thead>\n<tbody>\n`

  // Generate body rows
  for (const [scraper, uaGroup] of Object.entries(pivot)) {
    const scraperRowspan = Object.values(uaGroup).reduce((sum, delays) => sum + Object.keys(delays).length, 0)
    let scraperFirst = true

    for (const [ua, delays] of Object.entries(uaGroup)) {
      const uaRowspan = Object.keys(delays).length
      let uaFirst = true

      for (const delay of Object.keys(delays).sort((a, b) => a - b)) {
        const runs = delays[delay]
        htmlSummary += `<tr>\n`

        // Scraper column
        if (scraperFirst) {
          htmlSummary += `<td rowspan="${scraperRowspan}" class="label darkGrayBackground">${scraper}</td>\n`
          scraperFirst = false
        }

        // User-Agent column
        if (uaFirst) {
          htmlSummary += `<td rowspan="${uaRowspan}" class="label darkGrayBackground">${ua}</td>\n`
          uaFirst = false
        }

        // Delay
        htmlSummary += `<td class="label darkGrayBackground">${delay} ms</td>\n`

        // Detector/site cells
        for (const [det, site] of detWebsitePairs) {
          const run = runs.find(r => r.detector === det && r.website === site)

          if (run) {
            const percent = parseFloat(run.accuracy.replace('%', '')) || 0
            const badge = percent >= 1 ? 'badge-success' : 'badge-fail'

            const userAgentTooltip = run.userAgent === "None" && run.detailedUserAgent
              ? `title="Scraper user agents:\n\n${Array.isArray(run.detailedUserAgent)
                ? run.detailedUserAgent.join('\n\n')
                : run.detailedUserAgent}"`
              : ''

            htmlSummary += `
              <td ${userAgentTooltip}>
                <span class="badge ${badge}" title="Correct: ${run.correctlyClassifiedRequests}
  Incorrect: ${run.incorrectlyClassifiedRequests}
  Total: ${run.totalRequests}">${percent.toFixed(0)}%</span>
                <small>Run ${run.runID}</small>
              </td>\n`
          } else {
            htmlSummary += `<td class="cell" style="background:#999; color:#fff">–</td>\n`
          }
        }

        htmlSummary += `</tr>\n`
      }
    }
  }

  htmlSummary += `</tbody></table></div>\n`

  // Sort the lists by descending order
  detectorAverages.sort((a, b) => {
    const primary = b.botsDetectedPercentage - a.botsDetectedPercentage
    const secondary = b.accuracy - a.accuracy
    return primary || secondary // secondary is used to break ties
  })
  scraperAverages.sort((a, b) => {
    const primary = b.successRateExperiments - a.successRateExperiments
    const secondary = b.coverage - a.coverage
    return primary || secondary // secondary is used to break ties
  })

  htmlSummary += `
  <h2>Top Detectors</h2>
  <ul class="stats-list">
    <li class="stats-header">
      <span>Name</span>
      <span title="Formula: Runs that identified a scraper / Total Runs">Scrapers Detected</span>
      <span title="Formula: Requests Correctly Identified / Total Requests">Accuracy</span>
    </li>`

  for (const d of detectorAverages) {
    const accuracyBadge = d.accuracy >= 1 ? 'badge-success' : 'badge-fail'
    const botBadge = d.botsDetectedPercentage > 0 ? 'badge-success' : 'badge-fail'

    htmlSummary += `
    <li>
      <a href="detector.html#${d.detector}">${d.detector}</a>
      <span>
        <span class="badge ${botBadge}"title="${d.detectorIdentifiedBots}/${d.totalExperiments} runs">${d.botsDetectedPercentage}%</span>
      </span>
      <span>
        <span class="badge ${accuracyBadge}" title="${d.totalCorrectlyClassified}/${d.theTotalRequests} requests">${d.accuracy}%</span>
      </span>
    </li>`
  }
  htmlSummary += '</ul>'

  htmlSummary += `
  <h2>Top Scrapers</h2>
  <ul class="stats-list">
    <li class="stats-header">
      <span>Name</span>
      <span title="Formula: Runs where scraper was identified / Total Runs">Detectors Avoided</span>
      <span title="Formula: Pages Successfully Scraped / Total Pages available to Scrape">Page Coverage</span>
    </li>`

  for (const s of scraperAverages) {
    const experimentBadge = s.successRateExperiments > 0 ? 'badge-success' : 'badge-fail'
    const coverageBadge = s.coverage > 0 ? 'badge-success' : 'badge-fail'

    htmlSummary += `
    <li>
      <a href="scraper.html#${s.scraper}">${s.scraper}</a>
      <span>
        <span class="badge ${experimentBadge}" title="${s.scraperUndetected}/${s.totalExperiments} runs">${s.successRateExperiments}%</span>
      </span>
      <span>
        <span class="badge ${coverageBadge}" title="${s.totalRequestsWithoutHoneypot}/${s.totalPagesToScrape} pages (excluding honeypot pages)">${s.coverage}%</span>
      </span>  
    </li>`
  }
  htmlSummary += '</ul>'

  // Write the HTML files
  await fs.writeFile(mainFolder + '/index.html', await htmlTemplate({ content: htmlSummary, active: 'summary' }))
  await fs.writeFile(mainFolder + '/detector.html', await htmlTemplate({ content: htmlDetector, active: 'detector' }))
  await fs.writeFile(mainFolder + '/scraper.html', await htmlTemplate({ content: htmlScraper, active: 'scraper' }))

  const absolutePath = path.resolve(mainFolder + '/index.html')
  const fileUrl = pathToFileURL(absolutePath).href
  console.log(`\nResults available at: ${fileUrl}\n`)

  // Create a zip file of the results folder
  const zipPathTemp = path.join(__dirname, zipName)
  const output = createWriteStream(zipPathTemp)
  
  const archive = archiver('zip', {
    zlib: { level: 9 }
  })
  
  archive.pipe(output)
  archive.directory(mainFolder, false) 
  
  await archive.finalize()

  // move the zip file to the main folder by using rename
  const zipPath = path.join(mainFolder, zipName)
  await fs.rename(zipPathTemp, zipPath)
}

function extractNumber(string) {
  if (typeof string === 'number') return string
  const match = String(string).match(/^(\d+(\.\d+)?)/)
  return Number(match ? parseFloat(match[1]) : 0)
}

export async function getPackageVersion() {
  try {
    const configPath = fileURLToPath(new URL('./package.json', import.meta.url))
    const data = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(data).version
  } catch (error) {
    console.error(`Failed to load package version file: ${error.message}`)
    throw error
  }}

const css = `
   <style>
    /* Reset & Base */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      background: #f0f2f5;
      color: #333;
    }

    a {
      color: #17a2b8;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    /* Top Bar */
    header {
      background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .header-left,
    .header-center,
    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left span,
    .header-right span {
      font-size: 14px;
      color: #666;
    }

    /* Navigation */
    .segmented-control {
      display: inline-flex;
      background: #e0e0e0;
      border-radius: 6px;
      overflow: hidden;
    }

    .segmented-control a {
      padding: 8px 16px;
      font-size: 14px;
      color: #555;
      text-decoration: none;
      border-right: 1px solid #ffffff;
      transition: background 0.3s, color 0.3s;
    }

    .segmented-control a:last-child {
      border-right: none;
    }

    .segmented-control a.active {
      background: #17a2b8;
      color: #fff;
    }

    .segmented-control a:hover {
      color: #000;
    }

    /* Download Button */
    .btn-download {
      padding: 8px 16px;
      background: #17a2b8;
      color: #fff;
      border-radius: 4px;
      font-size: 14px;
      white-space: nowrap;
    }

    .btn-download:hover {
      background: #138496;
    }

    /* Content Container */
    .container {
      margin: 24px auto;
      padding: 0 24px;
    }

    /* Headings */
    h1 {
      margin-bottom: 16px;
      font-size: 28px;
      color: #222;
    }

    h2 {
      margin: 32px 0 12px;
      font-size: 22px;
      color: #222;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 8px;
    }

    /* Table */
    .table-wrapper {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
      overflow-x: auto;
      width: fit-content;
      min-width: 500px;
      max-width: 100%;
      display: inline-block;
      margin: 0 auto 24px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    thead th {
      padding: 16px 20px;
      text-align: center;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border: none;
    }

    thead tr:first-child th[rowspan] {
      background: rgb(115, 125, 156);
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }

    thead tr:first-child th:nth-child(3) {
      max-width: 300px;
    }

    thead tr:first-child th[colspan] {
      background: #17a2b8;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }

    thead tr:first-child th:last-child,
    thead tr:nth-child(2) th:last-child {
      border-right: none;
    }

    thead tr:nth-child(2) th {
      background: #138496;
      border-right: 1px solid rgba(255, 255, 255, 0.2);
    }

    tbody tr {
      border-bottom: 1px solid #e0e0e0;
    }

    tbody td {
      padding: 14px 16px;
    }

    tbody td small {
      display: block;
      margin-top: 4px;
      color: #777;
    }

    tbody tr:hover {
      background: rgba(23, 162, 184, 0.05);
    }

    tbody .darkGrayBackground {
      background: #f1f1f1;
    }

    .scrapeTable thead tr th,
    .detectTable thead tr th {
      background: #17a2b8;
    }

    .scrapeTable tbody tr:last-child,
    .detectTable tbody tr:last-child {
      background-color: #f6f6f6;
    }

    /* Matrix Status Badges */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
    }

    .badge-success {
      background: #28a745;
    }

    .badge-fail {
      background: #dc3545;
    }

    /* Scraper and detector lists */
    ul.stats-list {
      list-style: none;
      margin-top: 16px;
      display: inline-grid;
      gap: 12px;
      width: fit-content;
      min-width: 700px;
      max-width: 100%;
      margin: 0 auto 24px;
    }

    ul.stats-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fff;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    ul.stats-list a {
      font-weight: 500;
    }

    /* Add columns for stats */
    ul.stats-list li {
      display: grid;
      grid-template-columns: 1fr 120px 120px; // Add 120px for each stat
      align-items: center;
    }

    ul.stats-list .stats-header {
      background: transparent;
      box-shadow: none;
      font-weight: 600;
      padding: 0 4px 6px 4px;
    }

    ul.stats-list .stats-header span {
      color: #666; 
      font-size: 12px;
    }

    ul.stats-list .stats-header span:nth-child(2),
    ul.stats-list .stats-header span:nth-child(3),
    ul.stats-list .stats-header span:nth-child(4) {
      margin-left: -10px;
    }

    ul.stats-list li:not(.stats-header):hover {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      background: rgba(23, 162, 184, 0.05);
    }

    /* Responsive */
    @media (max-width: 900px) {
      header {
        flex-direction: column;
        align-items: center;
      }

      .header-left,
      .header-right {
        display: none;
        height: 0;
        width: 0;
      }

      .header-center {
        order: -1;
      }
    }
  </style>`