import { Schema, model } from 'mongoose'

export const TRANSACTION_TYPES = [
    'DAILY_CLAIM',
    'CARD_BUY',
    'MARKET_BUY',
    'MARKET_SELL',
    'TRADE',
    'ADMIN_ADJUST',
    'CARD_REMOVED'
]

const transactionSchema = new Schema(
    {
        _id: { type: Schema.ObjectId, auto: true },
        discordId: { type: String, required: true, trim: true, index: true },
        type: {
            type: String,
            required: true,
            enum: TRANSACTION_TYPES
        },
        amount: { type: Number, required: true },
        balanceBefore: { type: Number, required: true },
        balanceAfter: { type: Number, required: true },
        // Metadata flexible para auditoría contable y telemetría:
        // - CARD_BUY: { cardId, cardType, cardName, roll, isPity, pityCountBefore, pityCountAfter }
        //   (roll es null cuando la carta sale por pity)
        // - DAILY_CLAIM: { streakAtClaim, previousStreak, previousMaxStreak, isNewRecord, streakBroken }
        // - MARKET_BUY: { cardId, sellerDiscordId, offerId }  (cardId y offerId como string)
        // - MARKET_SELL: { cardId, buyerDiscordId, offerId }  (cardId y offerId como string)
        // - ADMIN_ADJUST: {} desde addBalance/removeBalance; el snapshot de migración
        //   (scripts/backfillStatsAndLedger.js) escribe { note, migratedAt, legacySnapshot }
        // - CARD_REMOVED (admin borra una carta del catálogo, amount 0):
        //   { cardId, cardName, cardType, copiesRemoved, offersCancelled }
        // - TRADE: reservado, ningún código lo escribe actualmente
        metadata: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
)

transactionSchema.index({ discordId: 1, createdAt: -1 })
transactionSchema.index({ type: 1 })

const Transaction = model('Transaction', transactionSchema)

export { Transaction }
