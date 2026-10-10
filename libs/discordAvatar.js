// helper único para construir la URL del avatar de Discord de un usuario

const DISCORD_CDN = 'https://cdn.discordapp.com'
const AVATAR_SIZE = 128

// Avatar por defecto de Discord (sistema de usernames nuevo): (id >> 22) % 6
const getDefaultAvatarUrl = (discordId) => {
    let index = 0
    try {
        index = Number((BigInt(discordId) >> 22n) % 6n)
    } catch {
        index = 0
    }
    return `${DISCORD_CDN}/embed/avatars/${index}.png`
}

// avatar = hash de Discord (string) o null. Los hashes animados empiezan por "a_"
const buildAvatarUrl = (discordId, avatar) => {
    if (!avatar) return getDefaultAvatarUrl(discordId)
    const ext = avatar.startsWith('a_') ? 'gif' : 'png'
    return `${DISCORD_CDN}/avatars/${discordId}/${avatar}.${ext}?size=${AVATAR_SIZE}`
}

export { buildAvatarUrl }
