# Reglas de Documentación

La documentación técnica del ecosistema Smilbot **no vive en este repo**: está en la Bóveda de Obsidian [Paradox021/smilbot-vault](https://github.com/Paradox021/smilbot-vault) (servidor MCP `obsidian_vault`, o la ruta local donde esté clonada). Es la única fuente de verdad compartida entre el Backend API, el Bot de Discord y el Frontend. **No crees una carpeta `docs/` en este repo.**

## Qué nota actualizar según el cambio

| Tipo de cambio | Nota de la bóveda |
| :--- | :--- |
| Endpoint nuevo o modificado (ruta, params, body, respuesta, errores) | `Backend API/Endpoints *.md` |
| Autenticación o permisos de una ruta | `Backend API/Autenticacion.md` (matriz de permisos) |
| Esquema de Mongoose o lógica de negocio (rachas, gacha, pity, suerte, mercado, ledger) | `Modelos y Contratos/*.md` |
| Imágenes, scripts o mantenimiento | `Backend API/Hosting de Imagenes.md`, `Backend API/Scripts y Mantenimiento.md` |
| Fallo detectado que no se arregla ahora / fallo arreglado | `Backend API/Problemas Conocidos.md` (añadir / quitar) |
| Nota nueva | Enlazarla en el `README.md` de la bóveda |

## Reglas
1. Ninguna tarea está terminada sin actualizar la bóveda (ver `AGENTS.md`, "Definition of Done").
2. Cada endpoint documentado debe describir método y ruta exactos, query params, body, códigos de estado, respuesta JSON de ejemplo y errores.
3. Documenta lo que **hace el código**, no lo que debería hacer. Si no coinciden, arregla el código o anótalo en `Problemas Conocidos`.
4. Toda variable de entorno nueva va también en `.env.example`.
5. Las propuestas y `tasks.md` de OpenSpec deben incluir una tarea explícita para actualizar la bóveda.
