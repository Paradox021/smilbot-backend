import { Schema, model } from 'mongoose'

// Ajustes por servidor de Discord. Si un servidor no tiene documento se usan los valores por defecto.
const guildSettingsSchema = new Schema(
    {
        guildId: { type: String, required: true, trim: true, unique: true },
        // Muestra la canción actual como estado del canal de voz en el que suena el bot
        voiceStatusEnabled: { type: Boolean, default: true }
    },
    {
        timestamps: true,
        versionKey: false
    }
)

const GuildSettings = model('GuildSettings', guildSettingsSchema)

export { GuildSettings }
