// Local filesystem image provider
// Stores images in storage/images/ and serves them via express.static

import ImageProvider from './ImageProvider.js'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const __dirname = path.resolve()

/**
 * Builds a unique, URL-safe filename for a stored image so that two uploads
 * with the same original name never overwrite each other.
 * Format: <timestamp>-<random hex>-<sanitized original name>
 * Images stored before this change keep their original filename (and URL).
 */
export const uniqueImageFilename = (originalname = 'image') => {
    const safeName = path.basename(originalname).replace(/[^A-Za-z0-9._-]/g, '_') || 'image'
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`
}

class LocalProvider extends ImageProvider {
    constructor() {
        super()
        this.storagePath = path.join(__dirname, 'storage', 'images')
        this.host = process.env.IMAGE_HOST || `http://localhost:${process.env.PORT || 3000}`
    }

    async upload(file) {
        // When using diskStorage, multer already saved the file to disk under a unique
        // name (see libs/storage.js), available in file.filename.
        // When using memoryStorage (e.g., during migration), we write it manually.
        let publicId = file.filename
        if (file.buffer) {
            publicId = uniqueImageFilename(file.originalname)
            await fs.writeFile(path.join(this.storagePath, publicId), file.buffer)
        }

        return {
            url: `${this.host}/public/${publicId}`,
            publicId
        }
    }

    async delete(publicId) {
        if (!publicId) return

        const filePath = path.join(this.storagePath, path.basename(publicId))
        try {
            await fs.unlink(filePath)
        } catch (error) {
            // File might not exist, that's ok
            if (error.code !== 'ENOENT') throw error
        }
    }

    getUrl(publicId) {
        return `${this.host}/public/${publicId}`
    }
}

export default LocalProvider
