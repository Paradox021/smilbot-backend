// controller for guild (Discord server) settings

import * as guildService from '../services/guildService.js'

const getSettings = async (req, res) => {
    try {
        const settings = await guildService.getSettings(req.params.guildId)
        res.status(200).json(settings)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const updateSettings = async (req, res) => {
    try {
        const settings = await guildService.updateSettings(req.params.guildId, req.body)
        res.status(200).json(settings)
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message })
    }
}

export { getSettings, updateSettings }
