import express from 'express'
import mongoose from 'mongoose'
import * as dotenv from 'dotenv'
import morgan from 'morgan'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import cardRouter from './routers/cardRouter.js'
import userRouter from './routers/userRouter.js'
import marketRouter from './routers/marketRouter.js'
import leaderboardRouter from './routers/leaderboardRouter.js'
import authRouter from './routers/authRouter.js'
import { authenticate } from './middleware/auth.js'
import { getFrontendOrigin } from './libs/authCookies.js'
import path from 'path'

const __dirname = path.resolve()

dotenv.config()
const app = express()
app.use(express.urlencoded({extended: false}))
app.use(express.json())
app.use(cookieParser())
// Con FRONTEND_URL se restringe CORS a ese origen y se permiten cookies de sesión
const frontendOrigin = getFrontendOrigin()
app.use(frontendOrigin ? cors({ origin: frontendOrigin, credentials: true }) : cors())
app.use(morgan('tiny'))

app.get('/', (req, res) => {
    res.status(200).send('Bienvenido al API de Smilbot')
})

// Serve local images only when using the local provider
const provider = (process.env.IMAGE_PROVIDER || 'local').toLowerCase()
if (provider === 'local') {
    app.use('/public', express.static(`${__dirname}/storage/images`))
}

app.use('/auth', authRouter)

// A partir de aquí todas las rutas requieren el token del bot o el de un usuario
app.use(authenticate)

app.use('/card', cardRouter)
app.use('/user', userRouter)
app.use('/market', marketRouter)
app.use('/leaderboard', leaderboardRouter)


async function main(){
    if (!process.env.JWT_SECRET || !process.env.BOT_API_KEY) {
        throw new Error('JWT_SECRET y BOT_API_KEY son obligatorios')
    }
    mongoose.set('strictQuery', true)
    await mongoose.connect(process.env.URL_DB);
    await app.listen(process.env.PORT)
    console.log('Servidor y base de datos encencidos')
}
main().catch(error => 
    console.error('Fallo al arrancar el servidor'+error)
)