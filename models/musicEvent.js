import { Schema, model } from 'mongoose'

export const MUSIC_EVENT_TYPES = [
    'TRACK_ADDED',   // alguien añade una canción a la cola (o empieza a sonar directamente)
    'TRACK_STARTED', // la canción empieza a sonar (se repite en cada vuelta del bucle)
    'TRACK_ENDED'    // la canción deja de sonar (ver endReason)
]

export const MUSIC_END_REASONS = ['FINISHED', 'SKIPPED', 'PREVIOUS', 'STOPPED']

const trackSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        author: { type: String, default: '', trim: true },
        url: { type: String, default: '', trim: true },
        durationMs: { type: Number, default: 0 },
        source: { type: String, default: '', trim: true }
    },
    { _id: false }
)

// Registro inmutable de la actividad de música, para estadísticas futuras
// (quién pone más canciones, canciones más escuchadas, tiempo de escucha...).
const musicEventSchema = new Schema(
    {
        type: { type: String, required: true, enum: MUSIC_EVENT_TYPES },
        guildId: { type: String, required: true, trim: true },
        voiceChannelId: { type: String, default: null },
        // Quién pidió la canción (null si se desconoce)
        discordId: { type: String, default: null, trim: true },
        username: { type: String, default: null, trim: true },
        track: { type: trackSchema, required: true },
        // Solo TRACK_ENDED
        endReason: { type: String, enum: [...MUSIC_END_REASONS, null], default: null },
        playedMs: { type: Number, default: null },
        // Momento real del evento en el bot (los eventos se envían por lotes)
        occurredAt: { type: Date, required: true }
    },
    {
        timestamps: true,
        versionKey: false
    }
)

musicEventSchema.index({ guildId: 1, occurredAt: -1 })
musicEventSchema.index({ discordId: 1, occurredAt: -1 })
musicEventSchema.index({ type: 1, occurredAt: -1 })

const MusicEvent = model('MusicEvent', musicEventSchema)

export { MusicEvent }
