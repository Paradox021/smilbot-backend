// controller for card

import * as cardService from '../services/cardService.js'
import { imageService } from '../libs/imageHosting/index.js'

const cardTypes = {
    common: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
    mythic: 4
}

// Errores de dominio de cardService -> status HTTP (mismo patrón que marketController)
const ERROR_STATUS = {
    NO_CARDS_FOR_TYPE: 404,
    CARD_NOT_FOUND: 404
}

const handleError = (res, error) => {
    const status = ERROR_STATUS[error.code]
    if (status) return res.status(status).json({ error: error.message })
    if (error.name === 'ValidationError') return res.status(400).json({ error: error.message })
    if (error.code === 11000) return res.status(409).json({ error: 'A card with that name already exists' })
    console.error('Error en cartas:', error)
    res.status(500).json({ error: error.message })
}

const getCards = async (req, res) => {
    try {
        const cards = await cardService.getCards()
        res.status(200).json(cards)
    } catch (error) {
        handleError(res, error)
    }
}

const getMythicCard = async (req, res) => {
    try {
        const mythicCard = await cardService.getMythicCard()
        res.status(200).json(mythicCard)
    } catch (error) {
        handleError(res, error)
    }
}

const getLegendaryCard = async (req, res) => {
    try {
        const legendaryCard = await cardService.getLegendaryCard()
        res.status(200).json(legendaryCard)
    } catch (error) {
        handleError(res, error)
    }
}

const getEpicCard = async (req, res) => {
    try {
        const epicCard = await cardService.getEpicCard()
        res.status(200).json(epicCard)
    } catch (error) {
        handleError(res, error)
    }
}

const getRareCard = async (req, res) => {
    try {
        const rareCard = await cardService.getRareCard()
        res.status(200).json(rareCard)
    } catch (error) {
        handleError(res, error)
    }
}

const getCommonCard = async (req, res) => {
    try {
        const commonCard = await cardService.getCommonCard()
        res.status(200).json(commonCard)
    } catch (error) {
        handleError(res, error)
    }
}

const getCard = async (req, res) => {
    try {
        const card = await cardService.getCard(req.params.id)
        if (!card) return res.status(404).json({ error: 'Card not found' })
        res.status(200).json(card)
    } catch (error) {
        handleError(res, error)
    }
}

// Devuelve { cardData } si el body es válido, o { error } con el mensaje de validación
const parseNewCard = (req) => {
    if (!req.file) return { error: 'image is required' }

    let cardData
    try {
        cardData = JSON.parse(req.body?.data)
    } catch {
        return { error: 'data must be a valid JSON string' }
    }
    if (!cardData || typeof cardData !== 'object') return { error: 'data must be a JSON object' }

    if (typeof cardData.type !== 'string' || !Object.hasOwn(cardTypes, cardData.type)) {
        return { error: `type must be one of: ${Object.keys(cardTypes).join(', ')}` }
    }
    cardData.type = cardTypes[cardData.type]
    return { cardData }
}

// Elimina una imagen ya almacenada cuando la creación de la carta falla, para no dejar huérfanos
const discardImage = async (publicId) => {
    if (!publicId) return
    try {
        await imageService.delete(publicId)
    } catch (error) {
        console.error('No se pudo eliminar la imagen huérfana:', error)
    }
}

const createCard = async (req, res) => {
    // Con IMAGE_PROVIDER=local multer ya guardó el fichero en disco (req.file.filename)
    let storedPublicId = req.file?.filename

    const { cardData, error: validationError } = parseNewCard(req)
    if (validationError) {
        await discardImage(storedPublicId)
        return res.status(400).json({ error: validationError })
    }

    try {
        // Upload image to the configured provider
        const { url, publicId } = await imageService.upload(req.file)
        storedPublicId = publicId
        cardData.imageUrl = url
        cardData.imagePublicId = publicId

        const card = await cardService.createCard(cardData)
        res.status(201).json(card)
    } catch (error) {
        await discardImage(storedPublicId)
        handleError(res, error)
    }
}

const deleteCard = async (req, res) => {
    try {
        const { card, summary } = await cardService.deleteCard(req.params.id)

        // La carta ya está borrada en BD: un fallo al borrar la imagen no debe revertir la respuesta
        if (card.imagePublicId) {
            try {
                await imageService.delete(card.imagePublicId)
            } catch (imageError) {
                console.error(`Failed to delete image ${card.imagePublicId} for card ${summary.cardId}:`, imageError.message)
            }
        }

        res.status(200).json(summary)
    } catch (error) {
        handleError(res, error)
    }
}

export { getCards, getMythicCard, getLegendaryCard, getEpicCard,
    getRareCard, getCommonCard, getCard, createCard, deleteCard }
