import Database from 'better-sqlite3'

const STORE_TO_FILE = false

let db

if (STORE_TO_FILE) {
    db = new Database('./database/scraper-db.db') // Saves to file, keeps old runs and starets from previous run + 1
} else {
    db = new Database(':memory:') // Run in memory, always starts fresh from 1
}

const query = `
CREATE TABLE IF NOT EXISTS Requests (
    run_id INTEGER NOT NULL,
    page_id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    status INTEGER NOT NULL,
    timestamp DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
)
`
db.exec(query)

export default db
