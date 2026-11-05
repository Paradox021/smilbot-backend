// service for user

import {
    User,
    DAILY_COOLDOWN_HOURS,
    STREAK_WINDOW_HOURS,
    STREAK_RESTORE_WINDOW_HOURS,
    STREAK_RESTORE_MIN_STREAK,
    STREAK_RESTORE_COOLDOWN_DAYS,
    HOUR_MS,
    getStreakRestoreCost
} from '../models/user.js'
import { Card } from '../models/card.js'
import { Market, MarketOffer } from '../models/market.js'
import { createTransaction } from './transactionService.js'
import { buildAvatarUrl } from '../libs/discordAvatar.js'

const getUsers = async () => await User.find()

const getUser = async (discordId) => await User.findOne({ discordId: discordId })

// Forma pública de un usuario: racha efectiva (la guardada solo se recalcula al reclamar) y avatarUrl
const toUserResponse = (user) => ({
    ...user.toObject(),
    dailyStreak: user.getEffectiveStreak(),
    avatarUrl: buildAvatarUrl(user.discordId, user.avatar)
})

const createUser = async (user) => { 
    const existingUser = await User.findOne({ discordId: user.discordId })
    if (existingUser) {
        const error = new Error('Ya existe un usuario con ese discordId')
        error.code = 'USER_ALREADY_EXISTS'
        throw error
    }
    const newUser = new User(user)
    return await newUser.save()
}

// Devuelve el usuario con las cartas que tiene manteniendo retrocompatibilidad exacta con el cliente
const getUserCards = async (discordId) => {
    const user = await User.findOne({ discordId: discordId }).populate('cards.cardId')
    if (!user) return null

    const activeCards = (user.cards || [])
        .filter(item => item.cardId && item.count > 0)
        .map(item => {
            const cardObj = typeof item.cardId.toObject === 'function' ? item.cardId.toObject() : item.cardId
            return {
                ...cardObj,
                count: item.count
            }
        })
        .sort((a, b) => (a.type || 0) - (b.type || 0))

    const copiaUsuario = toUserResponse(user)
    copiaUsuario.cards = activeCards
    return copiaUsuario
}

// Borra por discordId (como el resto de rutas /user/:id). null si no existe
const deleteUser = async (discordId) => await User.findOneAndDelete({ discordId })

const addCard = async (discordId, cardId) => {
    const user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')

    const cardIdStr = cardId.toString()
    const existing = user.cards.find(item => item.cardId && item.cardId.toString() === cardIdStr)

    if (existing) {
        existing.count += 1
    } else {
        user.cards.push({ cardId, count: 1 })
    }
    return await user.save()
}

const removeCard = async (discordId, cardId) => {
    const user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')

    const cardIdStr = cardId.toString()
    const existingIndex = user.cards.findIndex(item => item.cardId && item.cardId.toString() === cardIdStr)

    if (existingIndex === -1 || user.cards[existingIndex].count <= 0) {
        throw new Error('No se encontró ninguna carta con ese ID en tu colección.')
    }

    user.cards[existingIndex].count -= 1
    if (user.cards[existingIndex].count === 0) {
        user.cards.splice(existingIndex, 1)
    }

    await user.save()
    return cardId
}

const addBalance = async (discordId, amount) => {
    const user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')
    const parsedAmount = Number(amount)
    const balanceBefore = user.balance
    user.balance += parsedAmount
    const balanceAfter = user.balance
    user.totalCoinsEarned = (user.totalCoinsEarned || 0) + (parsedAmount > 0 ? parsedAmount : 0)
    await user.save()

    await createTransaction({
        discordId: user.discordId,
        type: 'ADMIN_ADJUST',
        amount: parsedAmount,
        balanceBefore,
        balanceAfter
    })

    return user
}

const addBalanceWithId = async (userId, amount) => {
    const user = await User.findById(userId)
    if (!user) throw new Error('Usuario no encontrado')
    const parsedAmount = Number(amount)
    user.balance += parsedAmount
    return await user.save()
}

const removeBalance = async (discordId, amount) => {
    const user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')
    const parsedAmount = Number(amount)
    const balanceBefore = user.balance
    user.balance -= parsedAmount
    const balanceAfter = user.balance
    user.totalCoinsSpent = (user.totalCoinsSpent || 0) + (parsedAmount > 0 ? parsedAmount : 0)
    await user.save()

    await createTransaction({
        discordId: user.discordId,
        type: 'ADMIN_ADJUST',
        amount: -parsedAmount,
        balanceBefore,
        balanceAfter
    })

    return user
}

/**
 * Reclamo de Daily Balance con lógica de rachas (23h a 48h suma, >48h resetea a 1) y registro en Ledger
 */
const dailyBalance = async (discordId, amount = 100) => {
    let user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')

    const diffHours = user.getDiffHoursSinceLastDaily()
    if (diffHours < DAILY_COOLDOWN_HOURS) {
        const { diffHours: h, diffMinutes: m } = user.getTimeToUseCommand()
        const error = new Error(`You can't use this command yet\nYou have to wait ${h} hours and ${m} minutes to use it again!`)
        error.code = 'COOLDOWN_ACTIVE'
        error.diffHours = h
        error.diffMinutes = m
        throw error
    }

    const previousStreak = user.dailyStreak || 0
    const isStreakBroken = diffHours > STREAK_WINDOW_HOURS && previousStreak > 0

    // Si se rompió la racha anterior, consolidamos el récord de la racha previa en previousMaxStreak
    // y la guardamos como racha perdida para poder recuperarla (ver restoreStreak)
    if (isStreakBroken) {
        user.previousMaxStreak = user.maxDailyStreak || previousStreak
        user.lostStreak = previousStreak
        user.streakLostAt = new Date(new Date(user.getLastDailyDate()).getTime() + STREAK_WINDOW_HOURS * HOUR_MS)
    }

    const previousMaxStreak = user.previousMaxStreak || 0

    // Comprobar racha: entre 23h y 48h mantiene/suma racha; más de 48h o primera vez -> racha = 1
    if (diffHours <= STREAK_WINDOW_HOURS) {
        user.dailyStreak = previousStreak + 1
    } else {
        user.dailyStreak = 1
    }

    // Detectar si hoy supera por primera vez su récord previo consolidado
    const isNewRecord = previousMaxStreak > 0 && user.dailyStreak === previousMaxStreak + 1

    // Actualizar récord histórico global
    user.maxDailyStreak = Math.max(user.dailyStreak, user.maxDailyStreak || 0)

    const balanceBefore = user.balance
    user.balance += amount
    const balanceAfter = user.balance

    user.totalCoinsEarned = (user.totalCoinsEarned || 0) + amount
    user.totalDailiesClaimed = (user.totalDailiesClaimed || 0) + 1
    user.updateLastTimeCommand()

    await user.save()

    // Registrar transacción en el Ledger
    await createTransaction({
        discordId: user.discordId,
        type: 'DAILY_CLAIM',
        amount,
        balanceBefore,
        balanceAfter,
        metadata: {
            streakAtClaim: user.dailyStreak,
            previousStreak,
            previousMaxStreak,
            isNewRecord,
            streakBroken: isStreakBroken
        }
    })

    return {
        ok: true,
        balance: user.balance,
        dailyStreak: user.dailyStreak,
        previousStreak,
        maxDailyStreak: user.maxDailyStreak,
        previousMaxStreak,
        isNewRecord,
        totalDailiesClaimed: user.totalDailiesClaimed,
        // Solo si este reclamo rompió la racha: si y cuánto cuesta recuperarla
        streakRestore: isStreakBroken ? getStreakRestoreQuote(user) : null
    }
}

/**
 * Recuperación de racha
 *
 * Una racha rota se puede recuperar durante STREAK_RESTORE_WINDOW_HOURS desde que se rompió,
 * pagando getStreakRestoreCost(lostStreak). Hay que reclamar antes el daily que la rompe (que la
 * guarda en lostStreak): la racha recuperada es lostStreak + la racha nueva, que sigue contando.
 */
const STREAK_RESTORE_MESSAGES = {
    NO_LOST_STREAK: 'No tienes ninguna racha perdida que recuperar',
    RESTORE_EXPIRED: 'El plazo para recuperar tu racha ya terminó',
    CLAIM_DAILY_FIRST: 'Reclama primero el daily y después recupera la racha',
    RESTORE_COOLDOWN: 'Ya recuperaste una racha recientemente',
    INSUFFICIENT_BALANCE: 'No tienes suficientes monedas para recuperar la racha'
}

// Devuelve si el usuario puede recuperar una racha y en qué condiciones (no modifica nada)
const getStreakRestoreQuote = (user) => {
    const now = Date.now()
    const currentStreak = user.getEffectiveStreak()
    const balance = user.balance

    let lostStreak = 0
    let lostAt = null
    let reason = null

    if (currentStreak === 0 && (user.dailyStreak || 0) >= STREAK_RESTORE_MIN_STREAK) {
        // Racha rota pero aún sin reclamar el daily que la consolida en lostStreak
        lostStreak = user.dailyStreak
        lostAt = new Date(new Date(user.getLastDailyDate()).getTime() + STREAK_WINDOW_HOURS * HOUR_MS)
        reason = 'CLAIM_DAILY_FIRST'
    } else if (currentStreak > 0 && (user.lostStreak || 0) >= STREAK_RESTORE_MIN_STREAK && user.streakLostAt) {
        lostStreak = user.lostStreak
        lostAt = user.streakLostAt
    }

    if (lostStreak === 0) {
        return { available: false, reason: 'NO_LOST_STREAK', currentStreak, balance }
    }

    const expiresAt = new Date(lostAt.getTime() + STREAK_RESTORE_WINDOW_HOURS * HOUR_MS)
    const nextRestoreAt = user.lastStreakRestoreAt
        ? new Date(user.lastStreakRestoreAt.getTime() + STREAK_RESTORE_COOLDOWN_DAYS * 24 * HOUR_MS)
        : null
    const cost = getStreakRestoreCost(lostStreak)

    if (now > expiresAt.getTime()) {
        reason = 'RESTORE_EXPIRED'
    } else if (nextRestoreAt && now < nextRestoreAt.getTime()) {
        reason = 'RESTORE_COOLDOWN'
    } else if (!reason && balance < cost) {
        reason = 'INSUFFICIENT_BALANCE'
    }

    return {
        available: reason === null,
        reason,
        lostStreak,
        currentStreak,
        // Con CLAIM_DAILY_FIRST la racha nueva será 1 al reclamar el daily
        restoredStreak: lostStreak + Math.max(currentStreak, 1),
        cost,
        balance,
        streakLostAt: lostAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        nextRestoreAt: nextRestoreAt ? nextRestoreAt.toISOString() : null
    }
}

const streakRestoreError = (code, quote) =>
    Object.assign(new Error(STREAK_RESTORE_MESSAGES[code] || 'No se pudo recuperar la racha'), { code, quote })

const getStreakRestore = async (discordId) => {
    const user = await getUser(discordId)
    if (!user) return null
    return getStreakRestoreQuote(user)
}

const restoreStreak = async (discordId) => {
    const user = await getUser(discordId)
    if (!user) throw Object.assign(new Error('Usuario no encontrado'), { code: 'USER_NOT_FOUND' })

    const quote = getStreakRestoreQuote(user)
    if (!quote.available) throw streakRestoreError(quote.reason, quote)

    const streakBefore = quote.currentStreak
    const streakAfter = quote.restoredStreak
    const now = new Date()

    // Actualización condicional: si otra petición (doble clic, daily) cambió el estado, no se cobra dos veces
    const updated = await User.findOneAndUpdate(
        {
            _id: user._id,
            lostStreak: user.lostStreak,
            streakLostAt: user.streakLostAt,
            dailyStreak: user.dailyStreak,
            balance: { $gte: quote.cost }
        },
        {
            $set: { dailyStreak: streakAfter, lostStreak: 0, streakLostAt: null, lastStreakRestoreAt: now },
            $max: { maxDailyStreak: streakAfter },
            $inc: { balance: -quote.cost, totalCoinsSpent: quote.cost }
        },
        { new: true }
    )

    if (!updated) {
        const fresh = await getStreakRestore(discordId)
        if (fresh && !fresh.available) throw streakRestoreError(fresh.reason, fresh)
        throw Object.assign(new Error('Tu racha cambió mientras se recuperaba, inténtalo de nuevo'), { code: 'STREAK_RESTORE_CONFLICT' })
    }

    await createTransaction({
        discordId: updated.discordId,
        type: 'STREAK_RESTORE',
        amount: -quote.cost,
        balanceBefore: updated.balance + quote.cost,
        balanceAfter: updated.balance,
        metadata: {
            lostStreak: quote.lostStreak,
            streakBefore,
            streakAfter,
            streakLostAt: quote.streakLostAt
        }
    })

    return {
        ok: true,
        lostStreak: quote.lostStreak,
        dailyStreak: updated.dailyStreak,
        maxDailyStreak: updated.maxDailyStreak,
        cost: quote.cost,
        balance: updated.balance,
        streakExpiresAt: updated.getStreakExpiresAt()?.toISOString() ?? null
    }
}

/**
 * Compra de carta gacha: descuenta saldo, suma métricas y genera transacción
 */
const PITY_THRESHOLD = 250

/**
 * Compra de carta gacha: descuenta saldo, suma métricas, evalúa pity y genera transacción
 */
const rollRandomCardPurchase = async (discordId, card, cost = 100, roll = null, isPity = false) => {
    const user = await getUser(discordId)
    if (!user) throw new Error('Usuario no encontrado')

    if (user.balance < cost) {
        const error = new Error(`No tienes suficientes monedas. Necesitas ${cost} y tienes ${user.balance}`)
        error.code = 'INSUFFICIENT_BALANCE'
        throw error
    }

    const balanceBefore = user.balance
    user.balance -= cost
    const balanceAfter = user.balance

    user.totalCoinsSpent = (user.totalCoinsSpent || 0) + cost
    user.cardsOpenedCount = (user.cardsOpenedCount || 0) + 1

    const pityCountBefore = user.pityCount || 0
    let pityCountAfter = pityCountBefore

    // Lógica del sistema de pity:
    // - Si fue por pity: incrementa el contador histórico de míticas por pity y resetea racha a 0
    // - Si fue mítica natural (type: 4): resetea racha a 0
    // - Si no es mítica: incrementa racha en +1
    if (isPity) {
        user.pityMythicsCount = (user.pityMythicsCount || 0) + 1
        user.pityCount = 0
        pityCountAfter = 0
    } else if (card.type === 4) {
        user.pityCount = 0
        pityCountAfter = 0
    } else {
        user.pityCount = (user.pityCount || 0) + 1
        pityCountAfter = user.pityCount
    }

    // Añadir carta al inventario (o incrementar contador)
    const existingCardIndex = (user.cards || []).findIndex(
        item => item.cardId && (item.cardId.toString() === card._id.toString() || item.cardId._id?.toString() === card._id.toString())
    )

    if (existingCardIndex > -1) {
        user.cards[existingCardIndex].count += 1
    } else {
        user.cards.push({ cardId: card._id, count: 1 })
    }

    await user.save()

    // Registrar transacción en el Ledger con telemetría de pity
    await createTransaction({
        discordId: user.discordId,
        type: 'CARD_BUY',
        amount: -cost,
        balanceBefore,
        balanceAfter,
        metadata: {
            cardId: card._id,
            cardType: card.type,
            cardName: card.name,
            roll,
            isPity,
            pityCountBefore,
            pityCountAfter
        }
    })

    return {
        ok: true,
        user,
        card,
        isPity,
        pity: {
            current: pityCountAfter,
            threshold: PITY_THRESHOLD,
            remaining: Math.max(0, PITY_THRESHOLD - pityCountAfter)
        }
    }
}

const RARITY_NAMES = {
    0: 'common',
    1: 'rare',
    2: 'epic',
    3: 'legendary',
    4: 'mythic'
}

const RARITY_WEIGHTS = {
    common: 1,
    rare: 3,
    epic: 10,
    legendary: 50,
    mythic: 200
}

const EXPECTED_POINTS_PER_CARD = 4.475

const calculateLuckScore = (breakdown, totalCards) => {
    const safeTotal = Math.max(0, parseInt(totalCards) || 0)
    const safeBreakdown = {
        common: Math.max(0, breakdown?.common || 0),
        rare: Math.max(0, breakdown?.rare || 0),
        epic: Math.max(0, breakdown?.epic || 0),
        legendary: Math.max(0, breakdown?.legendary || 0),
        mythic: Math.max(0, breakdown?.mythic || 0)
    }

    if (safeTotal <= 0) {
        return {
            totalCards: 0,
            luckPercentage: 100.0,
            luckDelta: '+0.0%',
            tier: 'Average',
            tierCode: 'AVERAGE',
            breakdown: safeBreakdown
        }
    }

    const actualPoints =
        safeBreakdown.common * RARITY_WEIGHTS.common +
        safeBreakdown.rare * RARITY_WEIGHTS.rare +
        safeBreakdown.epic * RARITY_WEIGHTS.epic +
        safeBreakdown.legendary * RARITY_WEIGHTS.legendary +
        safeBreakdown.mythic * RARITY_WEIGHTS.mythic

    const expectedPoints = safeTotal * EXPECTED_POINTS_PER_CARD
    const rawRatio = actualPoints / expectedPoints
    const rawPercentage = rawRatio * 100
    const rawDelta = (rawRatio - 1) * 100

    const luckPercentage = Math.round(rawPercentage * 10) / 10
    const roundedDelta = Math.round(rawDelta * 10) / 10
    const luckDelta = (roundedDelta >= 0 ? '+' : '') + roundedDelta.toFixed(1) + '%'

    let tierCode = 'AVERAGE'
    let tier = 'Average'

    if (rawDelta > 40) {
        tierCode = 'GODLY'
        tier = 'Godly Luck'
    } else if (rawDelta >= 15) {
        tierCode = 'LUCKY'
        tier = 'Lucky'
    } else if (rawDelta >= -15) {
        tierCode = 'AVERAGE'
        tier = 'Average'
    } else if (rawDelta >= -30) {
        tierCode = 'UNLUCKY'
        tier = 'Unlucky'
    } else {
        tierCode = 'CURSED'
        tier = 'Cursed'
    }

    return {
        totalCards: safeTotal,
        luckPercentage,
        luckDelta,
        tier,
        tierCode,
        breakdown: safeBreakdown
    }
}

const getCardTypeMap = async () => {
    const cards = await Card.find({}, '_id type').lean()
    const map = new Map()
    cards.forEach(c => map.set(c._id.toString(), c.type ?? 0))
    return map
}

const getUserEffectiveGachaBreakdown = async (user, cardTypeMap) => {
    const inventoryMap = new Map()
    for (const item of (user.cards || [])) {
        if (!item.cardId || !item.count || item.count <= 0) continue
        const idStr = item.cardId._id ? item.cardId._id.toString() : item.cardId.toString()
        inventoryMap.set(idStr, (inventoryMap.get(idStr) || 0) + item.count)
    }

    const [boughtOffers, soldOffers] = await Promise.all([
        MarketOffer.find({
            status: 'SOLD',
            $or: [{ buyer: user._id }, { buyerDiscordId: user.discordId }]
        }).select('cardId').lean(),
        MarketOffer.find({
            status: 'SOLD',
            $or: [{ seller: user._id }, { sellerDiscordId: user.discordId }]
        }).select('cardId').lean()
    ])

    const boughtMap = new Map()
    for (const offer of boughtOffers) {
        if (!offer.cardId) continue
        const idStr = offer.cardId.toString()
        boughtMap.set(idStr, (boughtMap.get(idStr) || 0) + 1)
    }

    const soldMap = new Map()
    for (const offer of soldOffers) {
        if (!offer.cardId) continue
        const idStr = offer.cardId.toString()
        soldMap.set(idStr, (soldMap.get(idStr) || 0) + 1)
    }

    const allCardIds = new Set([...inventoryMap.keys(), ...soldMap.keys()])
    const breakdown = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }
    let totalCards = 0

    for (const idStr of allCardIds) {
        const inv = inventoryMap.get(idStr) || 0
        const bought = boughtMap.get(idStr) || 0
        const sold = soldMap.get(idStr) || 0

        const netGacha = Math.max(0, inv - bought) + sold
        if (netGacha > 0) {
            const cardType = cardTypeMap.get(idStr) ?? 0
            const rarityKey = RARITY_NAMES[cardType] || 'common'
            breakdown[rarityKey] += netGacha
            totalCards += netGacha
        }
    }

    // Neutralizar míticas obtenidas por pity (no se computan en la suerte para mantener el RNG puro)
    const pityMythicsToDiscount = Math.min(breakdown.mythic, user.pityMythicsCount || 0)
    if (pityMythicsToDiscount > 0) {
        breakdown.mythic -= pityMythicsToDiscount
        totalCards = Math.max(0, totalCards - pityMythicsToDiscount)
    }

    return { breakdown, totalCards }
}

/**
 * Estadísticas completas del usuario
 */
const getUserStats = async (discordId) => {
    const user = await getUser(discordId)
    if (!user) throw Object.assign(new Error('Usuario no encontrado'), { code: 'USER_NOT_FOUND' })

    // Calcular ventas exitosas en el mercado
    const marketSalesCount = await MarketOffer.countDocuments({
        seller: user._id,
        $or: [
            { status: 'SOLD' },
            { active: false, buyer: { $ne: null } }
        ]
    })
    const totalCardsCount = (user.cards || []).reduce((sum, item) => sum + (item.count || 0), 0)

    // Calcular métricas de suerte neutralizadas con historial de mercado y pity
    const cardTypeMap = await getCardTypeMap()
    const { breakdown, totalCards: effectiveGachaCards } = await getUserEffectiveGachaBreakdown(user, cardTypeMap)
    const luckMetrics = calculateLuckScore(breakdown, effectiveGachaCards)
    const minPullsThreshold = 20
    const eligibleForLeaderboard = effectiveGachaCards >= minPullsThreshold

    const pullsSinceLastMythic = user.pityCount || 0
    const pityThreshold = PITY_THRESHOLD
    const pullsUntilGuaranteed = Math.max(0, pityThreshold - pullsSinceLastMythic)
    const pityMythicsCount = user.pityMythicsCount || 0

    const luck = {
        ...luckMetrics,
        breakdown: {
            ...luckMetrics.breakdown,
            pityMythics: pityMythicsCount
        },
        pityMythicsCount,
        eligibleForLeaderboard,
        ...(eligibleForLeaderboard ? {} : { cardsNeeded: minPullsThreshold - effectiveGachaCards })
    }

    const pity = {
        pullsSinceLastMythic,
        pityThreshold,
        pullsUntilGuaranteed,
        pityMythicsCount
    }

    return {
        discordId: user.discordId,
        username: user.username,
        avatarUrl: buildAvatarUrl(user.discordId, user.avatar),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        balance: user.balance,
        dailyStreak: user.getEffectiveStreak(),
        maxDailyStreak: user.maxDailyStreak || 0,
        previousMaxStreak: user.previousMaxStreak || 0,
        lastDaily: new Date(user.getLastDailyDate()).toISOString(),
        nextDailyAt: user.getNextDailyAt().toISOString(),
        streakExpiresAt: user.getStreakExpiresAt()?.toISOString() ?? null,
        totalDailiesClaimed: user.totalDailiesClaimed || 0,
        totalCoinsEarned: user.totalCoinsEarned || 0,
        totalCoinsSpent: user.totalCoinsSpent || 0,
        cardsCount: totalCardsCount,
        cardsOpenedCount: user.cardsOpenedCount || 0,
        marketSalesCount,
        pity,
        luck
    }
}

/**
 * Leaderboards
 */
const getLeaderboardStreaks = async (type = 'current', limit = 10) => {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 10))
    const isMax = type === 'max'

    const sortField = isMax ? 'maxDailyStreak' : 'dailyStreak'
    const filter = { [sortField]: { $gt: 0 } }
    // Racha actual: solo usuarios cuya racha sigue viva (último daily dentro de la ventana)
    if (!isMax) {
        filter.lastDaily = { $gte: new Date(Date.now() - STREAK_WINDOW_HOURS * 60 * 60 * 1000) }
    }
    const users = await User.find(filter)
        .sort({ [sortField]: -1, username: 1 })
        .limit(parsedLimit)
        .select('discordId username avatar dailyStreak maxDailyStreak')

    return users.map(u => ({
        discordId: u.discordId,
        username: u.username,
        avatarUrl: buildAvatarUrl(u.discordId, u.avatar),
        streak: isMax ? u.maxDailyStreak : u.dailyStreak
    }))
}

const getLeaderboardWealth = async (type = 'earned', limit = 10) => {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 10))
    const isCurrent = type === 'current'

    const sortField = isCurrent ? 'balance' : 'totalCoinsEarned'
    const users = await User.find()
        .sort({ [sortField]: -1, username: 1 })
        .limit(parsedLimit)
        .select('discordId username avatar balance totalCoinsEarned')

    return users.map(u => ({
        discordId: u.discordId,
        username: u.username,
        avatarUrl: buildAvatarUrl(u.discordId, u.avatar),
        amount: isCurrent ? u.balance : u.totalCoinsEarned
    }))
}

const getLeaderboardCards = async (limit = 10) => {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 10))

    const users = await User.aggregate([
        {
            $project: {
                discordId: 1,
                username: 1,
                avatar: 1,
                cardsCount: {
                    $reduce: {
                        input: '$cards',
                        initialValue: 0,
                        in: { $add: ['$$value', { $ifNull: ['$$this.count', 0] }] }
                    }
                }
            }
        },
        { $sort: { cardsCount: -1, username: 1 } },
        { $limit: parsedLimit },
        {
            $project: {
                _id: 0,
                discordId: 1,
                username: 1,
                avatar: 1,
                cardsCount: 1
            }
        }
    ])

    return users.map(({ avatar, ...u }) => ({ ...u, avatarUrl: buildAvatarUrl(u.discordId, avatar) }))
}

const getLeaderboardLuck = async (order = 'desc', minPulls = 20, limit = 10) => {
    const parsedLimit = Math.max(1, Math.min(100, parseInt(limit) || 10))
    const parsedMinPulls = Math.max(1, parseInt(minPulls) || 20)
    const isAsc = (order || 'desc').toString().toLowerCase() === 'asc'
    const sortOrder = isAsc ? 'asc' : 'desc'

    const [cardTypeMap, users, soldOffers] = await Promise.all([
        getCardTypeMap(),
        User.find({ 'cards.0': { $exists: true } }).select('_id discordId username avatar cards pityMythicsCount').lean(),
        MarketOffer.find({ status: 'SOLD' }).select('cardId seller buyer sellerDiscordId buyerDiscordId').lean()
    ])

    // Build buyer & seller frequency maps keyed by userId and discordId
    const userBoughtMap = new Map()
    const userSoldMap = new Map()

    const incrementUserMap = (outerMap, userKey, cardIdStr) => {
        if (!userKey || !cardIdStr) return
        if (!outerMap.has(userKey)) outerMap.set(userKey, new Map())
        const inner = outerMap.get(userKey)
        inner.set(cardIdStr, (inner.get(cardIdStr) || 0) + 1)
    }

    for (const offer of soldOffers) {
        if (!offer.cardId) continue
        const cardIdStr = offer.cardId.toString()
        if (offer.buyer) incrementUserMap(userBoughtMap, offer.buyer.toString(), cardIdStr)
        if (offer.buyerDiscordId) incrementUserMap(userBoughtMap, offer.buyerDiscordId, cardIdStr)
        if (offer.seller) incrementUserMap(userSoldMap, offer.seller.toString(), cardIdStr)
        if (offer.sellerDiscordId) incrementUserMap(userSoldMap, offer.sellerDiscordId, cardIdStr)
    }

    const candidates = []

    for (const u of users) {
        const userIdStr = u._id ? u._id.toString() : ''
        const discordId = u.discordId || ''

        // Map inventory
        const inventoryMap = new Map()
        for (const item of (u.cards || [])) {
            if (!item.cardId || !item.count || item.count <= 0) continue
            const idStr = item.cardId.toString()
            inventoryMap.set(idStr, (inventoryMap.get(idStr) || 0) + item.count)
        }

        const boughtCardCounts = userBoughtMap.get(userIdStr) || userBoughtMap.get(discordId) || new Map()
        const soldCardCounts = userSoldMap.get(userIdStr) || userSoldMap.get(discordId) || new Map()

        const allCardIds = new Set([...inventoryMap.keys(), ...soldCardCounts.keys()])
        const breakdown = { common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }
        let totalCards = 0

        for (const idStr of allCardIds) {
            const inv = inventoryMap.get(idStr) || 0
            const bought = boughtCardCounts.get(idStr) || 0
            const sold = soldCardCounts.get(idStr) || 0

            const netGacha = Math.max(0, inv - bought) + sold
            if (netGacha > 0) {
                const cardType = cardTypeMap.get(idStr) ?? 0
                const rarityKey = RARITY_NAMES[cardType] || 'common'
                breakdown[rarityKey] += netGacha
                totalCards += netGacha
            }
        }

        // Neutralizar míticas obtenidas por pity
        const pityMythicsToDiscount = Math.min(breakdown.mythic, u.pityMythicsCount || 0)
        if (pityMythicsToDiscount > 0) {
            breakdown.mythic -= pityMythicsToDiscount
            totalCards = Math.max(0, totalCards - pityMythicsToDiscount)
        }

        if (totalCards >= parsedMinPulls) {
            const luckScore = calculateLuckScore(breakdown, totalCards)
            candidates.push({
                discordId: u.discordId,
                username: u.username,
                avatarUrl: buildAvatarUrl(u.discordId, u.avatar),
                totalCards,
                luckPercentage: luckScore.luckPercentage,
                luckDelta: luckScore.luckDelta,
                tier: luckScore.tier,
                tierCode: luckScore.tierCode,
                breakdown: {
                    ...luckScore.breakdown,
                    pityMythics: u.pityMythicsCount || 0
                },
                pityMythicsCount: u.pityMythicsCount || 0
            })
        }
    }

    candidates.sort((a, b) => {
        if (isAsc) {
            return a.luckPercentage - b.luckPercentage || a.username.localeCompare(b.username)
        } else {
            return b.luckPercentage - a.luckPercentage || a.username.localeCompare(b.username)
        }
    })

    const ranked = candidates.slice(0, parsedLimit).map((item, index) => ({
        rank: index + 1,
        ...item
    }))

    return {
        order: sortOrder,
        minPulls: parsedMinPulls,
        leaderboard: ranked
    }
}

// Actualiza el perfil de Discord (username / hash de avatar). No es un cambio de saldo: sin Transaction.
// fields solo contiene las claves a modificar (ya validadas). Devuelve null si el usuario no existe.
const updateUserProfile = async (discordId, fields) => {
    const user = await User.findOneAndUpdate(
        { discordId: discordId },
        { $set: fields },
        { new: true, runValidators: true }
    ).select('discordId username avatar').lean()
    if (!user) return null
    return {
        discordId: user.discordId,
        username: user.username,
        avatar: user.avatar ?? null,
        avatarUrl: buildAvatarUrl(user.discordId, user.avatar)
    }
}

const getUserWithNumberOfCards = async (discordId) => {
    const user = await User.aggregate([
        { $match: { discordId: discordId } },
        { $unwind: '$cards' },
        { $match: { 'cards.count': { $gt: 0 } } },
        { $lookup: { from: 'cards', localField: 'cards.cardId', foreignField: '_id', as: 'cardInfo' } },
        { $unwind: '$cardInfo' },
        { $group: { _id: '$cardInfo.type', count: { $sum: '$cards.count' } } }
    ])
    return user
}

export {
    getUsers,
    getUser,
    toUserResponse,
    createUser,
    deleteUser,
    addCard,
    removeCard,
    addBalance,
    removeBalance,
    dailyBalance,
    getStreakRestore,
    restoreStreak,
    getUserCards,
    getUserWithNumberOfCards,
    addBalanceWithId,
    rollRandomCardPurchase,
    getUserStats,
    updateUserProfile,
    getLeaderboardStreaks,
    getLeaderboardWealth,
    getLeaderboardCards,
    getLeaderboardLuck,
    calculateLuckScore,
    PITY_THRESHOLD
}