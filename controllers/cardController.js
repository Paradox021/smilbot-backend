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

const getCards = async (req, res) => {
    try {
        const cards = await cardService.getCards()
        res.status(200).json(cards)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getMythicCard = async (req, res) => {
    try {
        const mythicCard = await cardService.getMythicCard()
        res.status(200).json(mythicCard)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getLegendaryCard = async (req, res) => {
    try {
        const legendaryCard = await cardService.getLegendaryCard()
        res.status(200).json(legendaryCard)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getEpicCard = async (req, res) => {
    try {
        const epicCard = await cardService.getEpicCard()
        res.status(200).json(epicCard)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getRareCard = async (req, res) => {
    try {
        const rareCard = await cardService.getRareCard()
        res.status(200).json(rareCard)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getCommonCard = async (req, res) => {
    try {
        const commonCard = await cardService.getCommonCard()
        res.status(200).json(commonCard)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const getCard = async (req, res) => {
    try {
        const card = await cardService.getCard(req.params.id)
        res.status(200).json(card)
    } catch (error) {
        res.status(500).json({error: error.message})
    }
}

const createCard = async (req, res) => {
    try {
        const cardData = JSON.parse(req.body.data)
        cardData.type = cardTypes[cardData.type]

        // Upload image to the configured provider
        const { url, publicId } = await imageService.upload(req.file)
        cardData.imageUrl = url
        cardData.imagePublicId = publicId

        const card = await cardService.createCard(cardData)
        res.status(201).json(card)
    } catch (error) {
        res.status(500).json({error: error.message})
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
        if (error.code === 'CARD_NOT_FOUND') return res.status(404).json({error: error.message})
        res.status(500).json({error: error.message})
    }
}

export { getCards, getMythicCard, getLegendaryCard, getEpicCard, 
    getRareCard, getCommonCard, getCard, createCard, deleteCard }
