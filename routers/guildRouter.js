// router for guild (Discord server) settings

import { Router } from 'express'
import * as guildController from '../controllers/guildController.js'
import { requireBot } from '../middleware/auth.js'

const guildRouter = Router()

guildRouter.get('/:guildId/settings', guildController.getSettings)
// Solo el bot: es quien comprueba que el miembro es admin de ese servidor de Discord
guildRouter.patch('/:guildId/settings', requireBot, guildController.updateSettings)

export default guildRouter
