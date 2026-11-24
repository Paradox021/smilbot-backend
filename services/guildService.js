import { GuildSettings } from '../models/guildSettings.js'

const DEFAULT_SETTINGS = { voiceStatusEnabled: true }
const EDITABLE_FIELDS = ['voiceStatusEnabled']

const toResponse = (guildId, doc) => ({
    guildId,
    ...DEFAULT_SETTINGS,
    ...(doc ? Object.fromEntries(EDITABLE_FIELDS.map(field => [field, doc[field]])) : {})
})

// Devuelve los ajustes del servidor, o los valores por defecto si no tiene documento
const getSettings = async (guildId) => {
    const doc = await GuildSettings.findOne({ guildId }).lean()
    return toResponse(guildId, doc)
}

// Actualiza solo los campos editables con el tipo correcto. Lanza error 400 si no hay ninguno válido.
const updateSettings = async (guildId, changes = {}) => {
    const update = {}
    if (typeof changes.voiceStatusEnabled === 'boolean') update.voiceStatusEnabled = changes.voiceStatusEnabled

    if (Object.keys(update).length === 0) {
        const error = new Error(`Ningún ajuste válido. Campos editables: ${EDITABLE_FIELDS.join(', ')}`)
        error.status = 400
        throw error
    }

    const doc = await GuildSettings.findOneAndUpdate(
        { guildId },
        { $set: update },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean()
    return toResponse(guildId, doc)
}

export { getSettings, updateSettings, DEFAULT_SETTINGS }
