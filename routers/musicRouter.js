// router for music activity

import { Router } from 'express'
import * as musicController from '../controllers/musicController.js'
import { requireBot } from '../middleware/auth.js'

const musicRouter = Router()

musicRouter.post('/events', requireBot, musicController.recordEvents)

export default musicRouter
