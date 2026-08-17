# TrueNeverStory — Informe de auditoría de seguridad

**Fecha:** 2026-07-04  
**Versión:** 0.14.0  
**Alcance:** Revisión completa de seguridad del código base  

---

## Resumen ejecutivo

TNS tiene una **base de seguridad sólida** para su modelo de amenazas (motor de juego de rol IA local/un jugador). Autenticación, protección contra inyección SQL, defensa contra inyección de prompts y saneamiento de entradas están bien implementados. Los principales riesgos están en casos límite: política CSP, traversal de rutas de archivos estáticos, validación de autenticación WebSocket y patrones de contaminación de prototipo con `Object.assign`. La mayoría de problemas son de severidad media para despliegue local pero serían alta prioridad para instancias públicas.

**Calificación general: MODERADA** — adecuada para uso local, necesita endurecimiento para despliegue público.

---

## 1. Autenticación y gestión de sesiones

### Fortalezas

| Control | Ubicación | Estado |
|---------|-----------|--------|
| Hashing PBKDF2 | `src/middleware/auth.ts:16-18` | 100k iteraciones, SHA-512, clave 64 bytes |
| Tokens de sesión | `src/middleware/auth.ts:79-81` | `randomBytes(32)` — entropía 256 bits |
| Seguridad de cookies | `src/middleware/auth.ts:230` | HttpOnly, SameSite=Lax |
| Rate limiting de login | `src/middleware/auth.ts:56-77` | 5 intentos/min, bloqueo 5 min |
| Auto-hash al cambiar contraseña | `src/routes/settings.ts:190-196` | Hash PBKDF2 generado en PUT |

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **MEDIA** | Almacenamiento de sesiones en memoria | `auth.ts:13` | Sesiones se pierden al reiniciar. Aceptable para uso local individual. |
| **MEDIA** | Fallback de contraseña en texto plano | `auth.ts:40-41` | Comparación en texto plano cuando falta `AUTH_PASSWORD_HASH`. |
| **BAJA** | `x-forwarded-for` falsificable | `auth.ts:193` | IP para rate-limiting desde header falsificable. |

---

## 2. Inyección SQL

### Fortalezas

**Todas las consultas SQLite usan placeholders parametrizados (`?`).** Sin interpolación de cadenas en SQL.

### Problemas

Ninguno encontrado. La inyección SQL está bien manejada.

---

## 3. Cross-Site Scripting (XSS)

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **ALTA** | CSP permite `unsafe-inline` | `security-headers.ts:27-28` | Permite ejecución JavaScript inline. XSS bypassa CSP completamente. |
| **MEDIA** | CSP permite `unsafe-inline` para estilos | `security-headers.ts:28` | Inyección CSS posible. |
| **BAJA** | Mensaje de error login no saneado | `auth.ts:112` | Interpolación sin escape. |

---

## 4. Traversal de rutas

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **MEDIA** | Archivos estáticos sin validación de ruta | `src/app.ts:52` | Sin verificación de que la ruta resuelta permanezca en PUBLIC_DIR. |
| **MEDIA** | Acceso a archivos del mundo sin validación | `src/routes/worlds.ts:146,257` | `name` desde URL, `../` posible. |
| **BAJA** | Snapshot usa session_id de usuario | `src/routes/launch.ts:118` | Puede leer `.json` arbitrarios. |
| **BAJA** | Acceso a archivos de capítulos | `src/routes/worlds.ts:253-264` | filename desde URL, sin saneamiento. |

---

## 5. Inyección de comandos

### Fortalezas

| Control | Ubicación | Estado |
|---------|-----------|--------|
| Whitelist de backends | `src/routes/models.ts:58` | `name` validado contra `["ollama", "llamacpp"]` |
| Evaluador de expresiones seguro | `src/services/probability-expression.ts` | Parser recursivo en lugar de `eval()` |

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **BAJA** | `execSync` para scripts de instalación | `src/routes/models.ts:71` | Construido desde whitelist, no directamente explotable. |
| **BAJA** | `spawn` para llama-server | `src/routes/settings.ts:132` | Args desde config, no entrada de usuario. |

---

## 6. Contaminación de prototipo

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **BAJA** | `Object.assign` con datos influenciados | Varios archivos | Contaminación posible si `__proto__` presente. |

---

## 7. Seguridad WebSocket

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **MEDIA** | WS auth solo verifica presencia de cookie | `src/index.ts:151-153` | Token expirado/inválido permite upgrade WS. |
| **BAJA** | Sin saneamiento de mensajes WS | `src/index.ts:229` | Contenido WS va directo a `engine.processInput()` sin `sanitizeInput()`. |

---

## 8. Validación de entradas

### Fortalezas

| Control | Ubicación | Estado |
|---------|-----------|--------|
| Validación Zod | `src/routes/chat.ts:35,61` | En endpoints de chat |
| Saneamiento de inyección de prompts | `src/utils/sanitize.ts` | 15+ patrones regex, máx 8000 car. |

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **BAJA** | Validación faltante en la mayoría de rutas | `src/routes/*.ts` | La mayoría de endpoints sin esquema Zod. |

---

## 9. Manejo de errores

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **BAJA** | Mensajes de error revelan detalles | `src/routes/chat.ts:103`, `src/routes/worlds.ts:83,97,110,136` | `err.message` en respuesta JSON. |

---

## 10. Seguridad de dependencias y configuración

### Fortalezas

- `.env` en gitignore
- Archivos de config en gitignore
- Datos del mundo en gitignore

---

## 11. Configuración CORS

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **MEDIA** | CORS hardcodeado en localhost | `src/app.ts:38` | Sin CORS configurable. |

---

## 12. Cabeceras de seguridad

Todas presentes y correctas. Ver versión inglesa para detalle completo.

Cabeceras faltantes (recomendadas):
- `Strict-Transport-Security` (HSTS)
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## 13. Defensa contra inyección de prompts

### Fortalezas

| Control | Ubicación | Estado |
|---------|-----------|--------|
| Saneamiento por patrones | `src/utils/sanitize.ts:6-34` | 15+ patrones regex |
| Wrapping de contenido | `src/utils/sanitize.ts:81-83` | Marcadores `<user_message>` |
| Longitud máx | `src/utils/sanitize.ts:36` | 8000 caracteres |
| Aplicado en rutas REST | `src/routes/chat.ts:66,129,165` | Todos los endpoints chat |

### Problemas

| Severidad | Problema | Ubicación | Descripción |
|-----------|----------|-----------|-------------|
| **MEDIA** | Mensajes WebSocket no saneados | `src/index.ts:229` | Sin `sanitizeInput()`. |

---

## Recomendaciones (orden de prioridad)

1. **Corregir CSP** — Reemplazar `unsafe-inline` por CSP nonce/hash.
2. **Validar mensajes WebSocket** — Aplicar `sanitizeInput()`.
3. **Validar tokens WS** — Verificar validez contra almacén de sesiones.
4. **Añadir verificaciones de traversal** — Para archivos estáticos y rutas de mundos.
5. **Añadir `Strict-Transport-Security`** con HTTPS.
6. **Eliminar rutas hardcodeadas** en `settings.ts:101`.
7. **Añadir validación** a rutas sin Zod.
8. **Considerar sesiones persistente** — SQLite sobreviviría reinicios.

---

## Archivos revisados

Ver versión inglesa para la lista completa de 21 archivos examinados.
