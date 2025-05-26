# Benchmark application

## Scraping ethically
Web scraping can have many legitimate uses, without any ill intent. It is however always important to concider wether scraping a website's content will do any harm to the website/content owner. In order to scrape a live website ethically, please concider the following things:
- Ask for consent before scraping a website. There is usually a robots.txt file, which specifies what scraping is allowed and by who.
- Avoid overloading the servers by sending a lot of requests very fast. Instead, add a delay in between requests.
- Make sure to follow any privacy laws, such as GDPR, when scraping a website that may contain personal information.

## How to run:
1. Install nodejs from https://nodejs.org/en/download
2. Open the terminal
3. Git clone the repo from github  
4. ```cd /benchmark-application```
5. ```npm install```
6. Optional: change config files if desired
7. ```npm run start```

## Adding a new bot detector
- Add a class for the bot detector under /websites/services
  - NOTE: this class **must** have the method ```check (req)``` which returns true if the request is a bot, otherwise false
- Add the detector in /websites/middleware/botDetector.js

## Adding a new scraper
- Add a folder to /scrapers and add a class extends Scraper.js
  - The new scraper should call this.logSuccessfulScrape() and this.logFailedScrape() for each scrape
  - The new scraper should run this.applyDelay() between each scrape
  - The new scraper should scrape the element as specified in this.config.elementToScrape
  - The new scraper should only perform a maximum requests as specified in this.config.maxRequestsPerRun
  - The new scraper should apply the useragent in this.config.custom_user_agent, if there is any value
  - The new scraper should stop scraping directly when not receving status 200

## Changing the configuration files
- The benchmark runs a test suit as specified in /configs/benchmark.js
  - scraper.json: specifies the scrapers to run
  - detector.json: specifies the detectors to run
  - website.json: specifies the websites to run, currently two options
  - delay.json: specifies the delays between each request, you can add or remove delays, change the delay_ms (does currently only support 1 delat value per specification. no arrays or random values)
  - useragent.json: specifies the useragent to be used by the scraper, you can add or remove useragents, change the useragent value (does currently only support 1 useragent value per specification. no arrays)