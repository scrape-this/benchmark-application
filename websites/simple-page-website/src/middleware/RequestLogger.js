import db from '../database/db.js'
import { setBotStatus } from '../database/db.js'

export const requestLogger = async (req, res, next) => {
  try {
    const logRequest = db.prepare('INSERT INTO Request_logger (run_id, method, url, ip, user_agent, headers, params, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    const info = logRequest.run(req.runId, req.method, req.url, req.ip, req.get('User-Agent'), JSON.stringify(req.headers), JSON.stringify(req.params), JSON.stringify(req.body))
    req.lastInsertRowId = info.lastInsertRowid


    res.on('finish', () => {
      const isbot = req.isBot ?? false
      setBotStatus(req.lastInsertRowId, isbot ? 1 : 0)
    })

  } catch (error) {
    console.error("requestLogger failed with error::", error)
  }
  next()
}