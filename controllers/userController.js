// controller for user

import * as userService from '../services/userService.js'
import * as cardService from '../services/cardService.js'
import * as transactionService from '../services/transactionService.js'

const getUsers = async (req, res) => {
    try {
        const users = await userService.getUsers()
        res.status(200).json(users)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const getUserWithBody = async (req, res) => {
    try {
        const auxUser = req.body
        const user = await userService.getUser(auxUser.discordId)
        if (!user) {
            const newUser = await userService.createUser(auxUser)
            return res.status(200).json(newUser)
        }
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const getUser = async (req, res) => {
    try {
        const user = await userService.getUser(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const createUser = async (req, res) => {
    try {
        const user = await userService.createUser(req.body)
        res.status(201).json(user)
    } catch (error) {
        if (error.code === 'USER_ALREADY_EXISTS') {
            return res.status(409).json({ error: error.message })
        }
        res.status(500).json({ error: error.message })
    }
}

const deleteUser = async (req, res) => {
    try {
        const user = await userService.deleteUser(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const addCard = async (req, res) => {
    try {
        const user = await userService.addCard(req.params.id, req.params.cardId)
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const removeCard = async (req, res) => {
    try {
        const user = await userService.removeCard(req.params.id, req.params.cardId)
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const addBalance = async (req, res) => {
    try {
        const user = await userService.addBalance(req.params.id, req.params.amount)
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const removeBalance = async (req, res) => {
    try {
        const user = await userService.removeBalance(req.params.id, req.params.amount)
        res.status(200).json(user)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const dailyBalance = async (req, res) => {
    try {
        const result = await userService.dailyBalance(req.params.id, 100)
        return res.status(200).json(result)
    } catch (error) {
        if (error.code === 'COOLDOWN_ACTIVE') {
            return res.status(400).json({
                error: error.message,
                diffHours: error.diffHours,
                diffMinutes: error.diffMinutes
            })
        }
        res.status(500).json({ error: error.message })
    }
}

const getUserWithCards = async (req, res) => {
    try {
        const user = await userService.getUser(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        const userWithCards = await userService.getUserCards(user.discordId)
        res.status(200).json(userWithCards)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const getUserWithNumberOfCards = async (req, res) => {
    try {
        const user = await userService.getUser(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        const userWithCards = await userService.getUserWithNumberOfCards(user.discordId)
        res.status(200).json(userWithCards)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const ROLL_COST = 100

const rollRandomCard = async (req, res) => {
    try {
        const user = await userService.getUser(req.params.id)
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

        if (user.balance < ROLL_COST) {
            return res.status(400).json({ error: `No tienes suficientes monedas. Necesitas ${ROLL_COST} y tienes ${user.balance}` })
        }

        const isPity = (user.pityCount || 0) >= userService.PITY_THRESHOLD
        let card, roll

        if (isPity) {
            card = await cardService.getMythicCard()
            roll = null
        } else {
            const rollResult = await cardService.getRandomCard()
            card = rollResult.card
            roll = rollResult.roll
        }

        const purchaseResult = await userService.rollRandomCardPurchase(user.discordId, card, ROLL_COST, roll, isPity)

        // Devolver la carta incluyendo el número de roll obtenido y datos del sistema de pity
        const cardObj = typeof card.toObject === 'function' ? card.toObject() : card
        res.status(200).json({
            ...cardObj,
            roll,
            isPity: purchaseResult.isPity,
            pity: purchaseResult.pity
        })
    } catch (error) {
        if (error.code === 'INSUFFICIENT_BALANCE') {
            return res.status(400).json({ error: error.message })
        }
        // La rareza obtenida no tiene cartas en el catálogo (no se cobra: la compra va después)
        if (error.code === 'NO_CARDS_FOR_TYPE') {
            return res.status(404).json({ error: error.message })
        }
        res.status(500).json({ error: error.message })
    }
}

const getUserStats = async (req, res) => {
    try {
        const stats = await userService.getUserStats(req.params.id)
        if (!stats) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        res.status(200).json(stats)
    } catch (error) {
        if (error.code === 'USER_NOT_FOUND') {
            return res.status(404).json({ error: error.message })
        }
        res.status(500).json({ error: error.message })
    }
}

const PROFILE_USERNAME_MAX_LENGTH = 32
const DISCORD_AVATAR_HASH = /^(a_)?[0-9a-f]{32}$/

// Valida el body de PATCH /user/:id/profile. Devuelve { fields } o { error }
const parseProfileBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Body inválido' }
    }
    const fields = {}
    if (body.username !== undefined) {
        if (typeof body.username !== 'string') return { error: 'username debe ser un string' }
        const username = body.username.trim()
        if (!username) return { error: 'username no puede estar vacío' }
        if (username.length > PROFILE_USERNAME_MAX_LENGTH) {
            return { error: `username no puede superar ${PROFILE_USERNAME_MAX_LENGTH} caracteres` }
        }
        fields.username = username
    }
    if (body.avatar !== undefined) {
        if (body.avatar !== null && (typeof body.avatar !== 'string' || !DISCORD_AVATAR_HASH.test(body.avatar))) {
            return { error: 'avatar debe ser un hash de avatar de Discord o null' }
        }
        fields.avatar = body.avatar
    }
    if (Object.keys(fields).length === 0) {
        return { error: 'Debe indicarse username y/o avatar' }
    }
    return { fields }
}

// PATCH /user/:id/profile (solo bot): sincroniza username y avatar de Discord
const updateUserProfile = async (req, res) => {
    try {
        const { fields, error } = parseProfileBody(req.body)
        if (error) {
            return res.status(400).json({ error })
        }
        const profile = await userService.updateUserProfile(req.params.id, fields)
        if (!profile) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        res.status(200).json(profile)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const getUserTransactions = async (req, res) => {
    try {
        const user = await userService.getUser(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        const result = await transactionService.getUserTransactions(user.discordId, {
            page: req.query.page,
            limit: req.query.limit
        })
        res.status(200).json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export {
    getUsers,
    getUserWithBody,
    getUser,
    createUser,
    deleteUser,
    addCard,
    removeCard,
    addBalance,
    removeBalance,
    dailyBalance,
    getUserWithCards,
    getUserWithNumberOfCards,
    rollRandomCard,
    getUserStats,
    updateUserProfile,
    getUserTransactions
}