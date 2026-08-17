# TrueNeverStory — Rapport d'audit de sécurité

**Date :** 2026-07-04  
**Version :** 0.14.0  
**Périmètre :** Revue complète de la sécurité de la base de code  

---

## Résumé exécutif

TNS dispose d'une **base de sécurité solide** pour son modèle de menaces (moteur de jeu de rôle IA local/monojoueur). L'authentification, la protection contre l'injection SQL, la défense contre l'injection de prompts et l'assainissement des entrées sont bien implémentés. Les principaux risques se situent dans les cas limites : politique CSP, traversée de chemins de fichiers statiques, validation d'authentification WebSocket et schémas de pollution de prototype via `Object.assign`. La plupart des problèmes sont de sévérité moyenne pour un déploiement local mais seraient haute priorité pour une instance publique.

**Note globale : MOYENNE** — adéquat pour usage local, renforcement nécessaire pour déploiement public.

---

## 1. Authentification et gestion des sessions

### Points forts

| Contrôle | Emplacement | Statut |
|----------|-------------|--------|
| Hachage PBKDF2 | `src/middleware/auth.ts:16-18` | 100k itérations, SHA-512, clé 64 octets |
| Jetons de session | `src/middleware/auth.ts:79-81` | `randomBytes(32)` — entropie 256 bits |
| Sécurité des cookies | `src/middleware/auth.ts:230` | HttpOnly, SameSite=Lax |
| Limitation de déconnexion | `src/middleware/auth.ts:56-77` | 5 tentatives/min, verrouillage 5 min |
| Auto-hash au changement | `src/routes/settings.ts:190-196` | Hash PBKDF2 généré au PUT |

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **MOYEN** | Stockage sessions en mémoire | `auth.ts:13` | Sessions perdues au redémarrage. Acceptable pour usage local mono. |
| **MOYEN** | Fallback mot de passe en clair | `auth.ts:40-41` | Comparaison en clair quand `AUTH_PASSWORD_HASH` absent. |
| **BAS** | `x-forwarded-for` falsifiable | `auth.ts:193` | IP pour rate-limiting depuis header falsifiable. |

---

## 2. Injection SQL

### Points forts

**Toutes les requêtes SQLite utilisent des placeholders paramétrés (`?`).** Pas d'interpolation de chaînes en SQL.

### Problèmes

Aucun trouvé. L'injection SQL est bien gérée.

---

## 3. Cross-Site Scripting (XSS)

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **HAUT** | CSP autorise `unsafe-inline` | `security-headers.ts:27-28` | Permet l'exécution JavaScript inline. Une injection XSS contourne entièrement le CSP. |
| **MOYEN** | CSP autorise `unsafe-inline` pour styles | `security-headers.ts:28` | Injection CSS possible. |
| **BAS** | Message d'erreur login non assaini | `auth.ts:112` | Interpolation sans échappement. |

---

## 4. Traversée de chemins

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **MOYEN** | Fichiers statiques sans validation de chemin | `src/app.ts:52` | Pas de vérification que le chemin résolu reste dans PUBLIC_DIR. |
| **MOYEN** | Accès fichiers monde sans validation | `src/routes/worlds.ts:146,257` | `name` depuis URL, `../` possible. |
| **BAS** | Snapshot utilise session_id utilisateur | `src/routes/launch.ts:118` | Peut lire des `.json` arbitraires. |
| **BAS** | Accès fichiers chapitres | `src/routes/worlds.ts:253-264` | filename depuis URL, sans assainissement. |

---

## 5. Injection de commandes

### Points forts

| Contrôle | Emplacement | Statut |
|----------|-------------|--------|
| Whitelist backend | `src/routes/models.ts:58` | `name` validé contre `["ollama", "llamacpp"]` |
| Évaluateur d'expressions sûr | `src/services/probability-expression.ts` | Parseur récursif au lieu de `eval()` |

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **BAS** | `execSync` pour scripts d'installation | `src/routes/models.ts:71` | Construit depuis whitelist, pas directement exploitable. |
| **BAS** | `spawn` pour llama-server | `src/routes/settings.ts:132` | Args depuis config, pas entrée utilisateur. |

---

## 6. Pollution de prototype

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **BAS** | `Object.assign` avec données influencées | Plusieurs fichiers | Pollution possible si `__proto__` présent. |

---

## 7. Sécurité WebSocket

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **MOYEN** | WS auth vérifie seulement présence cookie | `src/index.ts:151-153` | Token expiré/invalide permet toujours l'upgrade WS. |
| **BAS** | Pas d'assainissement messages WS | `src/index.ts:229` | Contenu WS va directement à `engine.processInput()` sans `sanitizeInput()`. |

---

## 8. Validation des entrées

### Points forts

| Contrôle | Emplacement | Statut |
|----------|-------------|--------|
| Validation Zod | `src/routes/chat.ts:35,61` | Sur endpoints chat |
| Assainissement injection prompt | `src/utils/sanitize.ts` | 15+ motifs regex, 8000 car. max |

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **BAS** | Validation manquante sur la plupart des routes | `src/routes/*.ts` | La plupart des endpoints sans schéma Zod. |

---

## 9. Gestion des erreurs

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **BAS** | Messages d'erreur révèlent des détails | `src/routes/chat.ts:103`, `src/routes/worlds.ts:83,97,110,136` | `err.message` dans réponse JSON. |

---

## 10. Sécurité des dépendances et configuration

### Points forts

- `.env` dans gitignore
- Fichiers de config dans gitignore
- Données des mondes dans gitignore

---

## 11. Configuration CORS

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **MOYEN** | CORS hardcodé sur localhost | `src/app.ts:38` | Pas de CORS configurable. |

---

## 12. En-têtes de sécurité

Tous présents et corrects. Voir la version anglaise pour le détail complet.

En-têtes manquants (recommandés) :
- `Strict-Transport-Security` (HSTS)
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## 13. Défense contre l'injection de prompts

### Points forts

| Contrôle | Emplacement | Statut |
|----------|-------------|--------|
| Assainissement par motifs | `src/utils/sanitize.ts:6-34` | 15+ motifs regex |
| Wrapping du contenu | `src/utils/sanitize.ts:81-83` | Marqueurs `<user_message>` |
| Longueur max | `src/utils/sanitize.ts:36` | 8000 caractères |
| Appliqué sur routes REST | `src/routes/chat.ts:66,129,165` | Tous les endpoints chat |

### Problèmes

| Sévérité | Problème | Emplacement | Description |
|----------|----------|-------------|-------------|
| **MOYEN** | Messages WebSocket non assainis | `src/index.ts:229` | Sans `sanitizeInput()`. |

---

## Recommandations (ordre de priorité)

1. **Corriger CSP** — Remplacer `unsafe-inline` par CSP nonce/hash.
2. **Valider messages WebSocket** — Appliquer `sanitizeInput()`.
3. **Valider tokens WS** — Vérifier validité contre stockage sessions.
4. **Ajouter vérifications traversée** — Pour fichiers statiques et routes monde.
5. **Ajouter `Strict-Transport-Security`** avec HTTPS.
6. **Supprimer chemins hardcodés** dans `settings.ts:101`.
7. **Ajouter validation** aux routes sans Zod.
8. **Envisager sessions persistantes** — SQLite survivrait aux redémarrages.

---

## Fichiers revus

Voir la version anglaise pour la liste complète des 21 fichiers examinés.
