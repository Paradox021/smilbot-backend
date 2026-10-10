// model for our discord user (not the bot)


import { Schema, model } from 'mongoose'

const userCardSchema = new Schema(
    {
        _id: false,
        cardId: { type: Schema.ObjectId, ref: 'Card', required: true },
        count: { type: Number, default: 1, min: 0 }
    }
)

const userSchema = new Schema(
    {
        _id: {type:Schema.ObjectId, auto:true},
        discordId: {type:String, required:true, trim:true, unique:true},
        username: {type:String, required:true, trim:true},
        // Hash del avatar de Discord (null = avatar por defecto). La URL se construye con libs/discordAvatar.js
        avatar: {type:String, default:null, trim:true},
        balance: {type:Number, default:0},
        cards: [userCardSchema],
        lastDaily: {type:Date, default: () => new Date(Date.now() - 1000 * 60 * 60 * 24)},
        lastTimeCommand: {type:Date, default: () => new Date(Date.now() - 1000 * 60 * 60 * 24)},

        // --- CAMPOS DE TELEMETRÍA Y RACHAS ---
        dailyStreak: {type:Number, default:0},
        maxDailyStreak: {type:Number, default:0},
        previousMaxStreak: {type:Number, default:0},
        totalDailiesClaimed: {type:Number, default:0},
        totalCoinsEarned: {type:Number, default:0},
        totalCoinsSpent: {type:Number, default:0},
        cardsOpenedCount: {type:Number, default:0},

        // --- CAMPOS DE PITY SYSTEM ---
        pityCount: {type:Number, default:0, min:0},
        pityMythicsCount: {type:Number, default:0, min:0},

        // --- CAMPOS DE AUTENTICACIÓN ---
        // Se incrementa para revocar todos los refresh tokens del usuario
        tokenVersion: {type:Number, default:0, select:false}
    },
    {
        timestamps:true,
        versionKey:false
    }
)


userSchema.methods.getLastDailyDate = function getLastDailyDate(){
    return this.lastDaily || this.lastTimeCommand || new Date(Date.now() - 1000 * 60 * 60 * 24)
}

userSchema.methods.canUseCommand = function canUseCommand(){
    const now = Date.now()
    const lastDate = new Date(this.getLastDailyDate()).getTime()
    const diff = now - lastDate
    const hours = diff / 1000 / 60 / 60
    return hours >= 23
}

// Devuelve las horas y minutos para poder usar el comando de nuevo
userSchema.methods.getTimeToUseCommand = function getTimeToUseCommand(){
    const now = Date.now()
    const lastDate = new Date(this.getLastDailyDate()).getTime()
    const diff = now - lastDate
    const timeToUseCommand = 1000 * 60 * 60 * 23 - diff
    const diffHours = Math.max(0, Math.floor(timeToUseCommand / 1000 / 60 / 60))
    const diffMinutes = Math.max(0, Math.floor((timeToUseCommand / 1000 / 60) - diffHours * 60))
    return { diffHours, diffMinutes }
}

// Devuelve la diferencia en horas desde el último daily
userSchema.methods.getDiffHoursSinceLastDaily = function getDiffHoursSinceLastDaily(){
    const now = Date.now()
    const lastDate = new Date(this.getLastDailyDate()).getTime()
    return (now - lastDate) / (1000 * 60 * 60)
}

userSchema.methods.updateLastTimeCommand = function updateLastTimeCommand(){
    const now = new Date()
    this.lastDaily = now
    this.lastTimeCommand = now
}

const User = model('User', userSchema)

export { User }