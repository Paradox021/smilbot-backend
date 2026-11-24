import { MusicEvent, MUSIC_EVENT_TYPES, MUSIC_END_REASONS } from '../models/musicEvent.js'

// Con ~400 bytes por evento, 200 eventos caben de sobra en el límite de 100 KB de express.json()
export const MAX_EVENTS_PER_BATCH = 200

const str = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)
const num = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null)

// Valida y normaliza un evento recibido del bot. Devuelve null si no es válido.
const normalizeEvent = (raw) => {
    if (!raw || typeof raw !== 'object') return null
    if (!MUSIC_EVENT_TYPES.includes(raw.type)) return null

    const guildId = str(raw.guildId)
    const title = str(raw.track?.title)
    const occurredAt = new Date(raw.occurredAt)
    if (!guildId || !title || Number.isNaN(occurredAt.getTime())) return null

    const isEnd = raw.type === 'TRACK_ENDED'
    const endReason = isEnd && MUSIC_END_REASONS.includes(raw.endReason) ? raw.endReason : null

    return {
        type: raw.type,
        guildId,
        voiceChannelId: str(raw.voiceChannelId),
        discordId: str(raw.discordId),
        username: str(raw.username),
        track: {
            title,
            author: str(raw.track.author) ?? '',
            url: str(raw.track.url) ?? '',
            durationMs: num(raw.track.durationMs) ?? 0,
            source: str(raw.track.source) ?? ''
        },
        endReason: isEnd ? endReason : null,
        playedMs: isEnd ? num(raw.playedMs) : null,
        occurredAt
    }
}

// Guarda un lote de eventos. Los inválidos se descartan y se cuentan en `rejected`.
const recordEvents = async (events) => {
    if (!Array.isArray(events) || events.length === 0) {
        const error = new Error('Se esperaba "events" como array no vacío')
        error.status = 400
        throw error
    }
    if (events.length > MAX_EVENTS_PER_BATCH) {
        const error = new Error(`Máximo ${MAX_EVENTS_PER_BATCH} eventos por petición`)
        error.status = 400
        throw error
    }

    const valid = events.map(normalizeEvent).filter(Boolean)
    if (valid.length > 0) await MusicEvent.insertMany(valid, { ordered: false })
    return { saved: valid.length, rejected: events.length - valid.length }
}

export { recordEvents }
