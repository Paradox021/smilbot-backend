// service for auth (JWT de usuarios, API key del bot y OAuth2 de Discord)

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { User } from '../models/user.js'

const DISCORD_API = 'https://discord.com/api/v10'
const OAUTH_SCOPE = 'identify'
const JWT_ALGORITHM = 'HS256'
const JWT_ISSUER = 'smilbot-backend'

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET no está configurado')
    return secret
}

// ---- Tokens de usuario ----

const signToken = (discordId, type, tokenVersion = 0) => {
    const expiresIn = type === 'refresh'
        ? (process.env.JWT_REFRESH_EXPIRES_IN || '30d')
        : (process.env.JWT_ACCESS_EXPIRES_IN || '15m')
    const payload = type === 'refresh' ? { type, ver: tokenVersion } : { type }
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        subject: discordId,
        expiresIn
    })
}

const generateTokens = (user) => ({
    accessToken: signToken(user.discordId, 'access'),
    refreshToken: signToken(user.discordId, 'refresh', user.tokenVersion || 0)
})

// Verifica firma, expiración y tipo. Lanza un error con code 'TOKEN_EXPIRED' o 'TOKEN_INVALID'
const verifyToken = (token, expectedType) => {
    let payload
    try {
        payload = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER })
    } catch (err) {
        const error = new Error(err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido')
        error.code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
        throw error
    }
    if (payload.type !== expectedType || !payload.sub) {
        const error = new Error('Token inválido')
        error.code = 'TOKEN_INVALID'
        throw error
    }
    return payload
}

// Valida el refresh token contra la versión guardada (permite revocar sesiones) y emite un par nuevo
const refreshTokens = async (refreshToken) => {
    const payload = verifyToken(refreshToken, 'refresh')
    const user = await User.findOne({ discordId: payload.sub }).select('+tokenVersion')
    if (!user || (user.tokenVersion || 0) !== payload.ver) {
        const error = new Error('Sesión revocada')
        error.code = 'TOKEN_INVALID'
        throw error
    }
    return { user, tokens: generateTokens(user) }
}

// Invalida todos los refresh tokens emitidos para el usuario
const revokeSessions = async (discordId) =>
    await User.updateOne({ discordId }, { $inc: { tokenVersion: 1 } })

// ---- API key del bot ----

// Comparación en tiempo constante (se hashea para igualar longitudes)
const isBotApiKey = (key) => {
    const expected = process.env.BOT_API_KEY
    if (!expected || !key) return false
    const a = crypto.createHash('sha256').update(key).digest()
    const b = crypto.createHash('sha256').update(expected).digest()
    return crypto.timingSafeEqual(a, b)
}

const isAdminDiscordId = (discordId) =>
    (process.env.ADMIN_DISCORD_IDS || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
        .includes(discordId)

// ---- OAuth2 Discord ----

const generateOAuthState = () => crypto.randomBytes(24).toString('hex')

const getDiscordAuthorizeUrl = (state) => {
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: OAUTH_SCOPE,
        state,
        prompt: 'none'
    })
    return `https://discord.com/oauth2/authorize?${params}`
}

// Intercambia el code por un access token de Discord y devuelve el perfil del usuario.
// El token de Discord no se guarda ni se reenvía: solo se usa para identificar al usuario.
const getDiscordUserFromCode = async (code) => {
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI
        })
    })
    if (!tokenResponse.ok) {
        throw new Error(`Discord rechazó el intercambio del code (${tokenResponse.status})`)
    }
    const { access_token: accessToken } = await tokenResponse.json()

    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!userResponse.ok) {
        throw new Error(`No se pudo obtener el usuario de Discord (${userResponse.status})`)
    }
    return await userResponse.json()
}

// Crea el usuario si es la primera vez que entra (mismo comportamiento que checkUser en el bot)
const findOrCreateDiscordUser = async (discordUser) => {
    const existing = await User.findOne({ discordId: discordUser.id }).select('+tokenVersion')
    if (existing) return existing
    const user = new User({ discordId: discordUser.id, username: discordUser.username })
    return await user.save()
}

export {
    generateTokens,
    verifyToken,
    refreshTokens,
    revokeSessions,
    isBotApiKey,
    isAdminDiscordId,
    generateOAuthState,
    getDiscordAuthorizeUrl,
    getDiscordUserFromCode,
    findOrCreateDiscordUser
}
