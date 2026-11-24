// controller for music activity events

import * as musicEventService from '../services/musicEventService.js'

const recordEvents = async (req, res) => {
    try {
        const result = await musicEventService.recordEvents(req.body?.events)
        res.status(201).json(result)
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message })
    }
}

export { recordEvents }
