import express from 'express'
import http from 'node:http'
import { HomeController } from '../controllers/HomeController.js'

export const router = express.Router()

const controller = new HomeController()

router.get('/', (req, res, next) => controller.index(req, res, next))

router.get('/:id', (req, res, next) => controller.showBlogPost(req, res, next))

router.get('/honeypot', (req, res, next) => controller.index(req, res, next))

router.use('*', (req, res, next) => {
  const statusCode = 404
  const error = new Error(http.STATUS_CODES[statusCode])
  error.status = statusCode
  next(error)
})
