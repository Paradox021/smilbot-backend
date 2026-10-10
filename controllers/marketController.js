// controller for market page
import mongoose from 'mongoose'
import * as marketService from '../services/marketService.js'

const ERROR_STATUS = {
    INVALID_BODY: 400,
    OFFER_NOT_ACTIVE: 400,
    INSUFFICIENT_BALANCE: 400,
    OWN_OFFER: 400,
    NOT_OFFER_OWNER: 403,
    OFFER_NOT_FOUND: 404,
    SELLER_NOT_FOUND: 404,
    CARD_NOT_OWNED: 404
}

const handleError = (res, error) => {
    const status = ERROR_STATUS[error.code]
    if (status) return res.status(status).json({ error: error.message })
    console.error('Error en el mercado:', error)
    res.status(500).json({ error: error.message })
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Devuelve el mensaje de error de validación, o null si el body es válido
const validateActor = (body) => {
    if (!isNonEmptyString(body?.discordId)) return 'discordId is required'
    if (body.username !== undefined && !isNonEmptyString(body.username)) return 'username must be a non-empty string'
    return null
}

const validateNewOffer = (body) => {
    const actorError = validateActor(body)
    if (actorError) return actorError
    if (body.cardId !== undefined) {
        if (!mongoose.isValidObjectId(body.cardId)) return 'cardId is not valid'
    } else if (!isNonEmptyString(body.cardName)) {
        return 'cardId or cardName is required'
    }
    const price = Number(body.price)
    if (!Number.isInteger(price) || price <= 0) return 'price must be a positive integer'
    return null
}

const getAllMarketOffers = async (req, res) => {
    try {
        const offers = await marketService.getActiveOffers(req.params.serverId)
        res.status(200).json(offers)
    } catch (error) {
        handleError(res, error)
    }
}

const getMarketOffer = async (req, res) => {
    try {
        const offer = await marketService.getOffer(req.params.serverId, req.params.offerId)
        if (!offer) return res.status(404).json({ error: 'Offer not found' })
        res.status(200).json(offer)
    } catch (error) {
        handleError(res, error)
    }
}

const addOffer = async (req, res) => {
    const validationError = validateNewOffer(req.body)
    if (validationError) return res.status(400).json({ error: validationError })

    try {
        const offer = await marketService.publishOffer({
            serverId: req.params.serverId,
            discordId: req.body.discordId,
            username: req.body.username,
            cardId: req.body.cardId,
            cardName: req.body.cardName,
            price: Number(req.body.price)
        })
        res.status(201).json(offer)
    } catch (error) {
        handleError(res, error)
    }
}

const buyOffer = async (req, res) => {
    const validationError = validateActor(req.body)
    if (validationError) return res.status(400).json({ error: validationError })

    try {
        const offer = await marketService.buyOffer({
            serverId: req.params.serverId,
            offerId: req.params.offerId,
            discordId: req.body.discordId,
            username: req.body.username
        })
        res.status(200).json(offer)
    } catch (error) {
        handleError(res, error)
    }
}

const removeOffer = async (req, res) => {
    const validationError = validateActor(req.body)
    if (validationError) return res.status(400).json({ error: validationError })

    try {
        const offer = await marketService.cancelOffer({
            serverId: req.params.serverId,
            offerId: req.params.offerId,
            discordId: req.body.discordId
        })
        res.status(200).json(offer)
    } catch (error) {
        handleError(res, error)
    }
}

export { getAllMarketOffers, getMarketOffer, addOffer, buyOffer, removeOffer }
