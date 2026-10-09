// helpers para las cookies de sesión del frontend

const ACCESS_COOKIE = 'smilbot_access'
const REFRESH_COOKIE = 'smilbot_refresh'
const STATE_COOKIE = 'smilbot_oauth_state'

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
const setStateCookie = (res, state) => {
    res.cookie(STATE_COOKIE, state, {
        ...baseOptions(),
        sameSite: 'lax',
        path: '/auth/discord',
        maxAge: 1000 * 60 * 10
    })
}

const clearStateCookie = (res) => {
    res.clearCookie(STATE_COOKIE, { ...baseOptions(), sameSite: 'lax', path: '/auth/discord' })
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
    setSessionCookies,
    clearSessionCookies,
    setStateCookie,
    clearStateCookie,
    getFrontendOrigin,
    isTrustedOrigin
}
