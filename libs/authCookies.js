// helpers para las cookies de sesión del frontend

const ACCESS_COOKIE = 'smilbot_access'
const REFRESH_COOKIE = 'smilbot_refresh'
const STATE_COOKIE = 'smilbot_oauth_state'
const RETURN_TO_COOKIE = 'smilbot_oauth_return'
const RETURN_TO_MAX_LENGTH = 512

const baseOptions = () => ({
    httpOnly: true,
    secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAMESITE || 'lax'
})

const setSessionCookies = (res, { accessToken, refreshToken }) => {
    res.cookie(ACCESS_COOKIE, accessToken, { ...baseOptions(), path: '/' })
    // El refresh token solo viaja a /auth para reducir su exposición
    res.cookie(REFRESH_COOKIE, refreshToken, {
        ...baseOptions(),
        path: '/auth',
        maxAge: 1000 * 60 * 60 * 24 * 30
    })
}

const clearSessionCookies = (res) => {
    res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' })
    res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: '/auth' })
}

// El state viaja en una redirección top-level GET, por eso siempre 'lax'
const stateCookieOptions = () => ({ ...baseOptions(), sameSite: 'lax', path: '/auth/discord' })

// returnTo (opcional) se guarda junto al state con la misma vida útil
const setStateCookie = (res, state, returnTo = null) => {
    res.cookie(STATE_COOKIE, state, { ...stateCookieOptions(), maxAge: 1000 * 60 * 10 })
    if (returnTo) {
        res.cookie(RETURN_TO_COOKIE, returnTo, { ...stateCookieOptions(), maxAge: 1000 * 60 * 10 })
    } else {
        res.clearCookie(RETURN_TO_COOKIE, stateCookieOptions())
    }
}

const clearStateCookie = (res) => {
    res.clearCookie(STATE_COOKIE, stateCookieOptions())
    res.clearCookie(RETURN_TO_COOKIE, stateCookieOptions())
}

// Solo rutas relativas del propio frontend: "/x...", nunca "//host", "/\host", esquemas ni caracteres de control.
// Devuelve la ruta normalizada (pathname + search + hash) o null si no es segura.
const sanitizeReturnTo = (value) => {
    if (typeof value !== 'string') return null
    if (value.length === 0 || value.length > RETURN_TO_MAX_LENGTH) return null
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
    if (value.includes('\\') ||/[\u0000-\u001f\u007f]/.test(value)) return null
    try {
        const base = 'http://returnto.invalid'
        const url = new URL(value, base)
        if (url.origin !== base) return null
        const normalized = `${url.pathname}${url.search}${url.hash}`
        // La normalización de "/..//x" produce "//x": volver a comprobar tras normalizar
        if (normalized.startsWith('//') || normalized.length > RETURN_TO_MAX_LENGTH) return null
        return normalized
    } catch {
        return null
    }
}

const getFrontendOrigin = () => {
    try {
        return process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : null
    } catch {
        return null
    }
}

// Protección CSRF para peticiones autenticadas por cookie que cambian estado
const isTrustedOrigin = (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true
    const origin = req.headers.origin
    const frontendOrigin = getFrontendOrigin()
    return Boolean(origin && frontendOrigin && origin === frontendOrigin)
}

export {
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    STATE_COOKIE,
    RETURN_TO_COOKIE,
    setSessionCookies,
    clearSessionCookies,
    setStateCookie,
    clearStateCookie,
    sanitizeReturnTo,
    getFrontendOrigin,
    isTrustedOrigin
}
