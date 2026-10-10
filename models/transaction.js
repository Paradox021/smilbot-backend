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
        // - DAILY_CLAIM: { streakAtClaim, previousStreak, previousMaxStreak, isNewRecord, streakBroken }
        // - MARKET_BUY / MARKET_SELL: { offerId, cardId, cardName, cardType, serverId, counterpartyDiscordId }
        // - CARD_REMOVED (admin borra una carta del catálogo, amount 0):
        //   { cardId, cardName, cardType, copiesRemoved, offersCancelled }
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
