import { Router } from 'express'
import * as marketController from '../controllers/marketController.js'
import { selfFromBody } from '../middleware/auth.js'

const marketRouter = Router()

marketRouter.get('/:marketId/offers', marketController.getAllMarketOffers)
marketRouter.post('/:marketId/offers', selfFromBody, marketController.addOffer)
marketRouter.post('/:marketId/offers/:offerId/buy', selfFromBody, marketController.buyOffer)
marketRouter.delete('/:marketId/offers/:offerId', selfFromBody, marketController.removeOffer)

export default marketRouter
