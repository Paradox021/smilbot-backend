// service for card

import mongoose from 'mongoose'
import { Card } from '../models/card.js'
import crypto from 'crypto'

// Errores de dominio con code, mapeados a status HTTP en cardController (mismo patrón que marketService)
const cardError = (code, message) => {
    const error = new Error(message)
    error.code = code
    return error
}

const getCards = async () => await Card.find().sort({type:1})

const getRandomTypeCard = async (type) => {
    const cards = await Card.find({ type: type })

    if (cards.length === 0)
        throw cardError('NO_CARDS_FOR_TYPE', 'No cards found for this type')

    const randomIndex = crypto.randomInt(0, cards.length)
    return cards[randomIndex]
}

const getMythicCard = async () => await getRandomTypeCard(4)

const getLegendaryCard = async () => await getRandomTypeCard(3)

const getEpicCard = async () => await getRandomTypeCard(2)

const getRareCard = async () => await getRandomTypeCard(1)

const getCommonCard = async () => await getRandomTypeCard(0)

// null si no existe (o si el id no es un ObjectId válido)
const getCard = async (id) => {
    if (!mongoose.isValidObjectId(id)) return null
    return await Card.findById(id)
}

// Probabilidades acumuladas sobre 1000 (cada umbral incluye los anteriores)
const CARD_TIERS = [
    { maxRoll: 5,    type: 4 },  // Mythic    — 0.5%
    { maxRoll: 25,   type: 3 },  // Legendary — 2%
    { maxRoll: 125,  type: 2 },  // Epic      — 10%
    { maxRoll: 425,  type: 1 },  // Rare      — 30%
    { maxRoll: 1000, type: 0 },  // Common    — 57.5%
]

const getRandomCard = async () => {
    const roll = crypto.randomInt(0, 1000)
    const tier = CARD_TIERS.find(t => roll < t.maxRoll)
    const card = await getRandomTypeCard(tier.type)
    return { card, roll }
}

const createCard = async (cardData) => {
    const newCard = new Card(cardData)
    return await newCard.save()
}

const deleteCard = async (id) => {
    const card = await Card.findById(id)
    if (!card) throw new Error('Card not found')
    await Card.findByIdAndDelete(id)
    return card
}

export { getCards, getMythicCard, getLegendaryCard, getEpicCard,
    getRareCard, getCommonCard, getCard, getRandomCard, createCard, deleteCard }