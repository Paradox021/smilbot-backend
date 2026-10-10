import { Router } from 'express'
import * as marketController from '../controllers/marketController.js'
import { selfFromBody } from '../middleware/auth.js'

const marketRouter = Router()

marketRouter.get('/:serverId/offers', marketController.getAllMarketOffers)
marketRouter.get('/:serverId/offers/:offerId', marketController.getMarketOffer)
marketRouter.post('/:serverId/offers', selfFromBody, marketController.addOffer)
marketRouter.post('/:serverId/offers/:offerId/buy', selfFromBody, marketController.buyOffer)
marketRouter.delete('/:serverId/offers/:offerId', selfFromBody, marketController.removeOffer)

export default marketRouter
