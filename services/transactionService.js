// service for transactions ledger
import { Transaction } from '../models/transaction.js'

/**
 * Creates and saves an immutable transaction record.
 * Pass { session } to write it inside a MongoDB transaction.
 */
const createTransaction = async ({ discordId, type, amount, balanceBefore, balanceAfter, metadata = {} }, { session } = {}) => {
    const transaction = new Transaction({
        discordId,
        type,
        amount,
        balanceBefore,
        balanceAfter,
        metadata
    })
    return await transaction.save({ session })
}

/**
 * Gets paginated transactions for a specific user
 */
const getUserTransactions = async (discordId, { page = 1, limit = 10 } = {}) => {
    const parsedPage = Math.max(1, parseInt(page) || 1)
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 10))
    const skip = (parsedPage - 1) * parsedLimit

    const [transactions, total] = await Promise.all([
        Transaction.find({ discordId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parsedLimit),
        Transaction.countDocuments({ discordId })
    ])

    const totalPages = Math.ceil(total / parsedLimit) || 1

    return {
        transactions,
        total,
        page: parsedPage,
        totalPages
    }
}

export {
    createTransaction,
    getUserTransactions
}
