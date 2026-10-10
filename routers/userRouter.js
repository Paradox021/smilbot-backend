// router for user

import { Router } from 'express'
import * as userController from '../controllers/userController.js'
import { requireAdmin, requireBot, selfFromParams } from '../middleware/auth.js'

const userRouter = Router()

userRouter.get('/', requireAdmin, userController.getUsers)

userRouter.post('/id', requireAdmin, userController.getUserWithBody)
userRouter.post('/', requireAdmin, userController.createUser)
userRouter.delete('/:id', requireAdmin, userController.deleteUser)
userRouter.post('/:id/dailyBalance', selfFromParams, userController.dailyBalance)

userRouter.delete('/:id/card/:cardId', requireAdmin, userController.removeCard)
userRouter.post('/:id/balance/:amount', requireAdmin, userController.addBalance)
userRouter.delete('/:id/balance/:amount', requireAdmin, userController.removeBalance)
userRouter.get('/:id/cards', userController.getUserWithCards)
userRouter.get('/:id/cards/number', userController.getUserWithNumberOfCards)
userRouter.post('/:id/card/random', selfFromParams, userController.rollRandomCard)

userRouter.post('/:id/card/:cardId', requireAdmin, userController.addCard)

userRouter.get('/:id/stats', userController.getUserStats)
userRouter.patch('/:id/profile', requireBot, userController.updateUserProfile)
userRouter.get('/:id/transactions', selfFromParams, userController.getUserTransactions)

userRouter.get('/:id', userController.getUser)

export default userRouter
