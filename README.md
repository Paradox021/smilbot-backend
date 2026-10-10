# Smilbot Backend 🔌

![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4-lightgrey?style=flat-square&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-forestgreen?style=flat-square&logo=mongodb)

Backend API REST modular para el ecosistema **Smilbot**, encargado de la persistencia de datos, gestión de inventarios, auditoría contable (Ledger inmutable), catálogo de cartas gacha, mercado P2P y analíticas de usuarios.

---

## 🚀 Requisitos e Instalación

1. **Requisitos previos:**
   - Node.js 18 o superior
   - Instancia de MongoDB (local o MongoDB Atlas)
2. **Instalación:**
   ```bash
   git clone https://github.com/Paradox021/smilbot-backend.git
   cd smilbot-backend
   npm install
   ```
3. **Variables de entorno (`.env`):**
   Copia el archivo de ejemplo y configura tu conexión a la base de datos y proveedor de imágenes:
   ```bash
   cp .env.example .env
   ```
4. **Ejecución:**
   ```bash
   # Entorno de desarrollo con recarga automática
   npm run dev

   # Entorno de producción
   npm run start
   ```

---

## 🛠️ Scripts de Mantenimiento y Migración

```bash
# Simular migración de estadísticas históricas (Dry Run)
npm run backfill:dry

# Aplicar migración de estadísticas en MongoDB
npm run backfill

# Simular cálculo histórico de racha de pity (Dry Run)
npm run backfill:pity:dry

# Aplicar sincronización de contadores de pity en MongoDB
npm run backfill:pity

# Migrar imágenes entre proveedores (ej: local a Supabase)
node scripts/migrateImages.js --from=local --to=supabase
```

---

## 📚 Documentación Técnica Centralizada

Toda la documentación técnica, especificaciones de endpoints, arquitectura del libro mayor (Ledger), esquemas de Mongoose y tablas de probabilidades están centralizados en la **Bóveda de Obsidian compartida**:

👉 **[Repositorio de Documentación (smilbot-vault)](https://github.com/Paradox021/smilbot-vault)**

- 📐 **[Modelos y Contratos](https://github.com/Paradox021/smilbot-vault/tree/main/Modelos%20y%20Contratos):** Esquema de cartas, probabilidades exactas (Mythic 0.5% a Common 57.5%), economía y libro mayor.
- 🔌 **[Backend API](https://github.com/Paradox021/smilbot-vault/tree/main/Backend%20API):** Directorio de los 15 endpoints de `/user`, `/card`, `/market`, `/leaderboard` y hosting de imágenes.
- 🤖 **[Bot Discord](https://github.com/Paradox021/smilbot-vault/tree/main/Bot%20Discord):** Arquitectura y comandos del cliente de Discord.
