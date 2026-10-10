// controller for auth (login con Discord para el frontend)

import * as authService from '../services/authService.js'
import * as userService from '../services/userService.js'
import {
    REFRESH_COOKIE,
    STATE_COOKIE,
    RETURN_TO_COOKIE,
    setSessionCookies,
    clearSessionCookies,
    setStateCookie,
    clearStateCookie,
    sanitizeReturnTo,
    isTrustedOrigin
} from '../libs/authCookies.js'

// returnTo (ruta relativa ya saneada) solo se usa en el login correcto
const redirectToFrontend = (res, status, returnTo = null) => {
    const frontend = new URL(process.env.FRONTEND_URL || 'http://localhost:5173')
    let url = frontend
    const safePath = sanitizeReturnTo(returnTo)
    if (safePath) {
        const candidate = new URL(safePath, frontend.origin)
        if (candidate.origin === frontend.origin) url = candidate
    }
    url.searchParams.set('login', status)
    res.redirect(url.toString())
}

// GET /auth/discord?returnTo=/ruta : returnTo opcional; si no es una ruta relativa segura se ignora
const discordLogin = (req, res) => {
    const state = authService.generateOAuthState()
    setStateCookie(res, state, sanitizeReturnTo(req.query.returnTo))
    res.redirect(authService.getDiscordAuthorizeUrl(state))
}

const discordCallback = async (req, res) => {
    const { code, state } = req.query
    const expectedState = req.cookies?.[STATE_COOKIE]
    const returnTo = req.cookies?.[RETURN_TO_COOKIE]
    clearStateCookie(res)

    if (!code || !state || !expectedState || state !== expectedState) {
        return redirectToFrontend(res, 'error')
    }

    try {
        const discordUser = await authService.getDiscordUserFromCode(code)
        const user = await authService.findOrCreateDiscordUser(discordUser)
        setSessionCookies(res, authService.generateTokens(user))
        redirectToFrontend(res, 'success', returnTo)
    } catch (error) {
        console.error('Error en el callback de Discord:', error.message)
        redirectToFrontend(res, 'error')
    }
}

// Rota el par de tokens. Acepta la cookie (frontend) o { refreshToken } en el body (otros clientes)
const refresh = async (req, res) => {
    const fromCookie = !req.body?.refreshToken
    const refreshToken = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE]
    if (!refreshToken) {
        return res.status(401).json({ error: 'No hay refresh token' })
    }
    if (fromCookie && !isTrustedOrigin(req)) {
        return res.status(403).json({ error: 'Origen no permitido' })
    }

    try {
        const { tokens } = await authService.refreshTokens(refreshToken)
        if (fromCookie) {
            setSessionCookies(res, tokens)
            return res.status(200).json({ message: 'Sesión renovada' })
        }
        res.status(200).json(tokens)
    } catch (error) {
        if (fromCookie) clearSessionCookies(res)
        res.status(401).json({ error: error.message, code: error.code })
    }
}

// Cierra todas las sesiones del usuario (invalida sus refresh tokens)
const logout = async (req, res) => {
    try {
        await authService.revokeSessions(req.auth.discordId)
        clearSessionCookies(res)
        res.status(204).end()
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const me = async (req, res) => {
    try {
        const user = await userService.getUser(req.auth.discordId)
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' })
        }
        res.status(200).json({
            ...userService.toUserResponse(user),
            isAdmin: req.auth.isAdmin
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

export { discordLogin, discordCallback, refresh, logout, me }
