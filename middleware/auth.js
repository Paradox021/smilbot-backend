// middleware de autenticación y autorización
//
// Credenciales aceptadas:
//   - Bot de Discord:  Authorization: Bot <BOT_API_KEY>
//   - Usuario (JWT):   Authorization: Bearer <accessToken>  o cookie smilbot_access (frontend)
//
// req.auth queda como { type: 'bot', isAdmin: true } o { type: 'user', discordId, isAdmin }

import * as authService from '../services/authService.js'
import { ACCESS_COOKIE, isTrustedOrigin } from '../libs/authCookies.js'

const authenticate = (req, res, next) => {
    const [scheme, credential] = (req.headers.authorization || '').split(' ')

    if (scheme === 'Bot') {
        if (!authService.isBotApiKey(credential)) {
            return res.status(401).json({ error: 'API key del bot inválida' })
        }
        req.auth = { type: 'bot', isAdmin: true }
        return next()
    }

    const fromCookie = scheme !== 'Bearer'
    const token = fromCookie ? req.cookies?.[ACCESS_COOKIE] : credential
    if (!token) {
        return res.status(401).json({ error: 'No autenticado' })
    }
    if (fromCookie && !isTrustedOrigin(req)) {
        return res.status(403).json({ error: 'Origen no permitido' })
    }

    try {
        const payload = authService.verifyToken(token, 'access')
        req.auth = {
            type: 'user',
            discordId: payload.sub,
            isAdmin: authService.isAdminDiscordId(payload.sub)
        }
        next()
    } catch (error) {
        res.status(401).json({ error: error.message, code: error.code })
    }
}

// Solo tokens de usuario (no la API key del bot)
const requireUser = (req, res, next) => {
    if (req.auth?.type === 'user') return next()
    res.status(403).json({ error: 'Requiere una sesión de usuario' })
}

// Solo el bot (API key). Un JWT de usuario se rechaza aunque sea admin o actúe sobre sí mismo
const requireBot = (req, res, next) => {
    if (req.auth?.type === 'bot') return next()
    res.status(403).json({ error: 'Requiere la API key del bot' })
}

// Solo el bot o usuarios listados en ADMIN_DISCORD_IDS
const requireAdmin = (req, res, next) => {
    if (req.auth?.isAdmin) return next()
    res.status(403).json({ error: 'Requiere permisos de administrador' })
}

// El usuario solo puede actuar sobre sí mismo; el bot y los admins sobre cualquiera.
// getDiscordId extrae de la petición el discordId sobre el que se actúa.
const requireSelf = (getDiscordId) => (req, res, next) => {
    if (req.auth?.isAdmin) return next()
    if (req.auth?.type === 'user' && getDiscordId(req) === req.auth.discordId) return next()
    res.status(403).json({ error: 'No puedes actuar en nombre de otro usuario' })
}

const selfFromParams = requireSelf(req => req.params.id)
const selfFromBody = requireSelf(req => req.body?.discordId)

export { authenticate, requireUser, requireBot, requireAdmin, requireSelf, selfFromParams, selfFromBody }
