// router for auth

import { Router } from 'express'
import * as authController from '../controllers/authController.js'
import { authenticate, requireUser } from '../middleware/auth.js'

const authRouter = Router()

authRouter.get('/discord', authController.discordLogin)
authRouter.get('/discord/callback', authController.discordCallback)
authRouter.post('/refresh', authController.refresh)
authRouter.post('/logout', authenticate, requireUser, authController.logout)
authRouter.get('/me', authenticate, requireUser, authController.me)

export default authRouter
