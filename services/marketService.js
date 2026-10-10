// service for market with independent MarketOffer collection
//
// Publicar, comprar y cancelar se ejecutan dentro de una transacción de MongoDB:
// si algún paso falla no se aplica ninguno (oferta, inventarios, saldos y Ledger).

import mongoose from 'mongoose'
import { MarketOffer } from '../models/marketOffer.js'
import { User } from '../models/user.js'
import { Card } from '../models/card.js'
import { createTransaction } from './transactionService.js'

// Las ofertas antiguas no tienen status, solo active
const ACTIVE_FILTER = { $or: [{ status: 'ACTIVE' }, { status: { $exists: false }, active: true }] }

// Del vendedor solo se exponen los datos públicos
const SELLER_FIELDS = 'discordId username'

const marketError = (code, message) => {
    const error = new Error(message)
    error.code = code
    return error
}

const isActive = (offer) => offer.status ? offer.status === 'ACTIVE' : offer.active !== false

// mongoose.connection.transaction reintenta la función ante conflictos de escritura
// (p. ej. dos compras simultáneas de la misma oferta), por eso el resultado se captura fuera.
const runInTransaction = async (fn) => {
    let result
    await mongoose.connection.transaction(async (session) => {
        result = await fn(session)
    })
    return result
}

const findOrCreateUser = async (discordId, username, session) => {
    const user = await User.findOne({ discordId }).session(session)
    if (user) return user
    if (!username) throw marketError('INVALID_BODY', 'username is required for new users')
    const [created] = await User.create([{ discordId, username }], { session })
    return created
}

const findInventoryIndex = (user, cardId) =>
    user.cards.findIndex(item => item.cardId && item.cardId.toString() === cardId.toString())

const takeCardFromInventory = (user, cardId) => {
    const index = findInventoryIndex(user, cardId)
    if (index === -1 || user.cards[index].count <= 0) {
        throw marketError('CARD_NOT_OWNED', 'Card not found in your collection')
    }
    user.cards[index].count -= 1
    if (user.cards[index].count === 0) user.cards.splice(index, 1)
}

const addCardToInventory = (user, cardId) => {
    const index = findInventoryIndex(user, cardId)
    if (index > -1) {
        user.cards[index].count += 1
    } else {
        user.cards.push({ cardId, count: 1 })
    }
}

const getActiveOffers = async (serverId) => {
    return await MarketOffer.find({ serverId, ...ACTIVE_FILTER })
        .populate('cardId')
        .populate('seller', SELLER_FIELDS)
        .sort({ createdAt: -1 })
}

// Cualquier oferta del servidor (activa o no). null si no existe
const getOffer = async (serverId, offerId) => {
    if (!mongoose.isValidObjectId(offerId)) return null
    return await MarketOffer.findOne({ _id: offerId, serverId })
        .populate('cardId')
        .populate('seller', SELLER_FIELDS)
}

/**
 * Publica una carta del inventario del vendedor. La carta queda retenida (escrow) hasta que se venda o se cancele.
 * La carta se identifica por cardId o, si no se envía, por cardName.
 */
const publishOffer = async ({ serverId, discordId, username, cardId, cardName, price }) => {
    return await runInTransaction(async (session) => {
        const seller = await findOrCreateUser(discordId, username, session)

        const card = cardId
            ? await Card.findById(cardId).session(session)
            : await Card.findOne({ name: cardName }).session(session)
        if (!card) throw marketError('CARD_NOT_OWNED', 'Card not found in your collection')

        takeCardFromInventory(seller, card._id)
        await seller.save({ session })

        const [offer] = await MarketOffer.create([{
            serverId,
            seller: seller._id,
            sellerDiscordId: seller.discordId,
            cardId: card._id,
            price,
            status: 'ACTIVE',
            active: true
        }], { session })
        return offer
    })
}

/**
 * Compra una oferta activa: marca la oferta como vendida, transfiere la carta,
 * mueve el dinero y registra MARKET_BUY y MARKET_SELL en el Ledger.
 */
const buyOffer = async ({ serverId, offerId, discordId, username }) => {
    if (!mongoose.isValidObjectId(offerId)) throw marketError('OFFER_NOT_FOUND', 'Offer not found')

    return await runInTransaction(async (session) => {
        const offer = await MarketOffer.findOne({ _id: offerId, serverId }).session(session)
        if (!offer) throw marketError('OFFER_NOT_FOUND', 'Offer not found')
        if (!isActive(offer)) throw marketError('OFFER_NOT_ACTIVE', 'Offer is not active')

        const buyer = await findOrCreateUser(discordId, username, session)
        if (offer.seller.equals(buyer._id)) throw marketError('OWN_OFFER', 'You can\'t buy your own offer')

        const seller = await User.findById(offer.seller).session(session)
        if (!seller) throw marketError('SELLER_NOT_FOUND', 'Seller not found')

        if (buyer.balance < offer.price) throw marketError('INSUFFICIENT_BALANCE', 'You don\'t have enough money')

        offer.status = 'SOLD'
        offer.active = false
        offer.buyer = buyer._id
        offer.buyerDiscordId = buyer.discordId
        offer.soldPrice = offer.price
        offer.soldAt = new Date()
        await offer.save({ session })

        const buyerBalanceBefore = buyer.balance
        buyer.balance -= offer.price
        buyer.totalCoinsSpent = (buyer.totalCoinsSpent || 0) + offer.price
        addCardToInventory(buyer, offer.cardId)
        await buyer.save({ session })

        const sellerBalanceBefore = seller.balance
        seller.balance += offer.price
        seller.totalCoinsEarned = (seller.totalCoinsEarned || 0) + offer.price
        await seller.save({ session })

        const cardIdStr = offer.cardId.toString()
        const offerIdStr = offer._id.toString()

        await createTransaction({
            discordId: buyer.discordId,
            type: 'MARKET_BUY',
            amount: -offer.price,
            balanceBefore: buyerBalanceBefore,
            balanceAfter: buyer.balance,
            metadata: { cardId: cardIdStr, sellerDiscordId: seller.discordId, offerId: offerIdStr }
        }, { session })

        await createTransaction({
            discordId: seller.discordId,
            type: 'MARKET_SELL',
            amount: offer.price,
            balanceBefore: sellerBalanceBefore,
            balanceAfter: seller.balance,
            metadata: { cardId: cardIdStr, buyerDiscordId: buyer.discordId, offerId: offerIdStr }
        }, { session })

        return offer
    })
}

/**
 * Cancela una oferta activa del propio vendedor y le devuelve la carta.
 */
const cancelOffer = async ({ serverId, offerId, discordId }) => {
    if (!mongoose.isValidObjectId(offerId)) throw marketError('OFFER_NOT_FOUND', 'Offer not found')

    return await runInTransaction(async (session) => {
        const offer = await MarketOffer.findOne({ _id: offerId, serverId }).session(session)
        if (!offer) throw marketError('OFFER_NOT_FOUND', 'Offer not found')

        const seller = await User.findOne({ discordId }).session(session)
        if (!seller || !offer.seller.equals(seller._id)) {
            throw marketError('NOT_OFFER_OWNER', 'You can\'t remove an offer that is not yours!')
        }
        if (!isActive(offer)) throw marketError('OFFER_NOT_ACTIVE', 'Offer is not active')

        offer.status = 'CANCELLED'
        offer.active = false
        offer.cancelledAt = new Date()
        await offer.save({ session })

        addCardToInventory(seller, offer.cardId)
        await seller.save({ session })

        return offer
    })
}

export {
    getActiveOffers,
    getOffer,
    publishOffer,
    buyOffer,
    cancelOffer
}
