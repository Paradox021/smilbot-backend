// service for card

import mongoose from 'mongoose'
import { Card } from '../models/card.js'
import { User } from '../models/user.js'
import { MarketOffer } from '../models/marketOffer.js'
import { createTransaction } from './transactionService.js'
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

// Las ofertas antiguas no tienen status, solo active
const ACTIVE_OFFER_FILTER = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false }, active: true }] }

/**
 * Elimina una carta del catálogo y limpia todas sus referencias en una única transacción:
 * - Quita la carta de todos los inventarios (User.cards).
 * - Cancela (no borra) las ofertas activas del mercado. La copia retenida en escrow
 *   no se devuelve al vendedor porque la carta deja de existir.
 * - Registra un CARD_REMOVED (amount 0) en el Ledger por cada usuario afectado.
 * Devuelve { card, summary }. Lanza CARD_NOT_FOUND si la carta no existe.
 */
const deleteCard = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw cardError('CARD_NOT_FOUND', 'Card not found')

    let result
    // mongoose.connection.transaction puede reintentar la función, por eso el resultado se captura fuera
    await mongoose.connection.transaction(async (session) => {
        const card = await Card.findById(id).session(session)
        if (!card) throw cardError('CARD_NOT_FOUND', 'Card not found')

        const cardId = card._id
        const cardIdStr = cardId.toString()
        // userId -> { user, copiesRemoved, offersCancelled }
        const affected = new Map()
        const track = (user) => {
            const key = user._id.toString()
            if (!affected.has(key)) affected.set(key, { user, copiesRemoved: 0, offersCancelled: 0 })
            return affected.get(key)
        }

        // 1. Inventarios
        const owners = await User.find({ 'cards.cardId': cardId }).session(session)
        for (const user of owners) {
            const entry = track(user)
            user.cards = user.cards.filter(item => {
                if (item.cardId && item.cardId.toString() === cardIdStr) {
                    entry.copiesRemoved += item.count || 0
                    return false
                }
                return true
            })
        }

        // 2. Ofertas activas: se cancelan; la copia en escrow se pierde
        const offers = await MarketOffer.find({ cardId, ...ACTIVE_OFFER_FILTER }).session(session)
        const cancelledAt = new Date()
        for (const offer of offers) {
            offer.status = 'CANCELLED'
            offer.active = false
            offer.cancelledAt = cancelledAt
            await offer.save({ session })

            const key = offer.seller.toString()
            if (!affected.has(key)) {
                const seller = await User.findById(offer.seller).session(session)
                if (!seller) continue
                track(seller)
            }
            affected.get(key).offersCancelled += 1
        }

        // 3. Guardar inventarios y registrar en el Ledger
        let copiesRemoved = 0
        for (const { user, copiesRemoved: copies, offersCancelled } of affected.values()) {
            copiesRemoved += copies
            if (user.isModified('cards')) await user.save({ session })
            await createTransaction({
                discordId: user.discordId,
                type: 'CARD_REMOVED',
                amount: 0,
                balanceBefore: user.balance,
                balanceAfter: user.balance,
                metadata: { cardId: cardIdStr, cardName: card.name, cardType: card.type, copiesRemoved: copies, offersCancelled }
            }, { session })
        }

        // 4. Borrar la carta
        await Card.deleteOne({ _id: cardId }).session(session)

        result = {
            card,
            summary: {
                deleted: true,
                cardId: cardIdStr,
                usersAffected: affected.size,
                copiesRemoved,
                offersCancelled: offers.length
            }
        }
    })
    return result
}

export { getCards, getMythicCard, getLegendaryCard, getEpicCard,
    getRareCard, getCommonCard, getCard, getRandomCard, createCard, deleteCard }