import Database from 'better-sqlite3'

const db = new Database('./websites/simple-page-website/src/database/db.db')

const query = `
CREATE TABLE IF NOT EXISTS Request_logger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER,
    method TEXT,
    url TEXT,
    ip TEXT,
    user_agent TEXT,
    headers TEXT,
    params TEXT,
    body TEXT,
    is_bot INTEGER DEFAULT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
`
db.exec(query)

export const setBotStatus = (id, isBot) => {
    try {
        const insertBotStatus = db.prepare(`UPDATE Request_logger SET is_bot = ? WHERE id = ?`);
        insertBotStatus.run(isBot, id);
        return true
    } catch (error) {
        console.error("Error when updating bot status of bot id:", id, "with error:", error)
        return false
    }
}

export default db
