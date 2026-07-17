# Acerca de TrueNeverStory — Justificación del diseño

## Estrategia lingüística: English inside, translate at boundary

### Por qué inglés para el procesamiento de agentes

TrueNeverStory utiliza una arquitectura de **«English inside, translate at boundary»** por varias razones críticas:

1. **Calidad LLM** — Los grandes modelos de lenguaje funcionan mejor en inglés, su idioma principal de entrenamiento. Usar inglés para el procesamiento interno garantiza:
   - Mayor calidad narrativa consistente
   - Mejor comprensión de prompts complejos
   - Menos alucinaciones e inconsistencias de estilo
   - Acceso a toda la amplitud de referencias literarias

2. **Economía de tokens** — El inglés es típicamente 20-40% más eficiente en tokens que otros idiomas para el mismo contenido semántico. Esto significa:
   - Más contexto cabe en la ventana del prompt
   - Menores costos de API por solicitud
   - Tiempos de procesamiento más rápidos

3. **Riqueza literaria** — Los materiales fuente (Biblia, clásicos de Gutenberg) son principalmente en inglés o tienen traducciones canónicas al inglés. El procesamiento en inglés preserva:
   - Acceso directo a patrones arquetípicos
   - Autenticidad estilística de los textos fuente
   - Contenido emocional y temático matizado

### Pipeline de traducción

```
Entrada del usuario (cualquier idioma)
    ↓
TranslationService.translateToEnglish()
    ↓
Análisis de intención (inglés)
    ↓
Procesamiento por agentes (inglés)
    ↓
Generación de respuesta (inglés)
    ↓
TranslationService.translate()
    ↓
Salida al usuario (idioma original)
```

**Decisiones clave:**
- La traducción ocurre **una vez en la entrada** y **una vez en la salida**
- Todo el estado interno, memoria y procesamiento permanecen en inglés
- Los agentes nunca ven ni producen texto no inglés directamente
- Las traducciones de UI están separadas de las traducciones de contenido (i18n vs TranslationService)

---

## Arquitectura de base de datos literaria: economía de tokens mediante preprocesamiento

### El problema

Generar narrativas ricas y literarias desde cero requiere:
- Prompts grandes con ejemplos de estilo
- Múltiples llamadas LLM para diferentes aspectos (trama, estilo, emoción)
- Alto consumo de tokens para resultados de calidad

### La solución: compilación literaria offline

TrueNeverStory preprocesa las fuentes literarias en bases de datos SQLite estructuradas **antes del despliegue**:

```
Textos fuente → LiteraryCompiler → Bases SQLite → Consultas en runtime
     ↓              ↓                    ↓              ↓
  Bible.db    Parser 4 pasos       Indexadas FTS5   Consultas en
  Gutenberg   (dramatúrgico,       plantillas de    milisegundos
  Clásicos    estilístico,         misiones
              emocional,           patrones de
              metadatos)           estilo
```

### Tipos de bases de datos

| Base de datos | Fuente | Contenido | Propósito |
|---------------|--------|-----------|-----------|
| `bible.db` | Textos bíblicos | Plantillas de misiones, arquetipos, dilemas morales | Estructura narrativa |
| `gutenberg.db` | Project Gutenberg | Patrones de estilo, descripciones sensoriales, ritmo | Calidad literaria |
| `literary.db` | Salida compilada | Plantillas unificadas con búsqueda FTS5 | Acceso en runtime |

### Ahorro de tokens

**Sin preprocesamiento:**
```
Prompt: "Genera una misión sobre traición al estilo de la literatura épica antigua..."
Tokens: ~500-800 para prompt + ~300-500 para respuesta = ~800-1300 tokens
```

**Con preprocesamiento:**
```
Consulta: db.queryTemplates({ archetype: 'betrayal', mood: 'epic' })
Tokens: ~50 para consulta + ~200-300 para respuesta = ~250-350 tokens
```

**Ahorros: reducción del 60-75% en el uso de tokens por elemento narrativo.**

---

## Fuentes literarias ricas

### Arquetipos bíblicos

La Biblia proporciona **estructuras narrativas probadas por el tiempo** que resuenan entre culturas:

| Arquetipo | Fuente | Patrón | Aplicación moderna |
|-----------|--------|--------|-------------------|
| **Escape** | Éxodo 14 | Líder → Tirano → Obstáculo → Intervención → Libertad | Misiones de rebelión, escenarios de escape |
| **Juicio** | 1 Reyes 3 | Disputa → Gobernante sabio → Verdad oculta → Justicia | Intrigas palaciegas, dilemas morales |
| **Herencia** | Lucas 15 | Pródigo → Desperdicia → Regreso → Aceptación | Arcos de redención, drama familiar |
| **Ascenso-Caída-Ascenso** | Génesis 37-50 | Favorecido → Traicionado → Sufrimiento → Ascenso → Reconciliación | Arcos de desarrollo de personaje |
| **Resistencia** | Job | Sufrimiento → Duda → Persistencia → Restauración | Probar la resolución del jugador |
| **Liberación** | Jueces | Opresión → Llamado → Reunión → Victoria | Campañas bélicas, historias de revolución |

**Por qué funcionan los patrones bíblicos:**
- **Reconocimiento universal** — Los jugadores entienden intuitivamente estas estructuras
- **Complejidad moral** — Las narrativas bíblicas raramente tienen simples divisiones bien/mal
- **Profundidad emocional** — Temas de pérdida, esperanza, traición, redención
- **Drama escalable** — Funciona para historias íntimas y campañas épicas

### Patrones de estilo Gutenberg

Project Gutenberg ofrece **siglos de artesanía literaria**:

| Era | Autores | Elementos de estilo | Caso de uso |
|-----|---------|-------------------|-------------|
| **Gótico** | Poe, Shelley, Stoker | Atmósfera oscura, terror sensorial, tensión psicológica | Horror, misterio |
| **Victoriano** | Dickens, Brontës | Comentario social, descripciones detalladas, complejidad moral | Intrigas sociales |
| **Épico** | Homero, Milton | Gran escala, lenguaje heroico, resonancia mítica | Guerras, misiones |
| **Romántico** | Byron, Keats | Intensidad emocional, imágenes de naturaleza, pasión | Historias de amor, drama personal |

**Proceso de deslexicalización:**
1. Extraer patrones estructurales (longitud de oración, ritmo, vocabulario)
2. Eliminar nombres de personajes y referencias específicas
3. Preservar marcadores sensoriales y tono emocional
4. Crear plantillas reutilizables con variables

---

## Individualidad y carácter de los PNJ

### Sistema de personaje multicapa

Cada PNJ tiene **cuatro niveles de profundidad**:

```
L1: Información básica (nombre, rol, ubicación)
    ↓
L2: Personalidad (rasgos, peculiaridades, patrones de habla)
    ↓
L3: Motivaciones ocultas (objetivos secretos, miedos, deseos)
    ↓
L4: Estado dinámico (relaciones, recuerdos, estado emocional)
```

### Fuentes de personajes

| Fuente | Contribución | Ejemplo |
|--------|--------------|---------|
| **Arquetipos bíblicos** | Marcos morales, patrones de lealtad | Lealtad de Rut, ambición de David |
| **Personajes Gutenberg** | Patrones de habla, comportamientos sociales | Los trepadores sociales de Dickens, las almas apasionadas de las Brontë |
| **Patrones históricos** | Comportamientos políticos, dinámica de facciones | Intrigas palaciegas, política de gremios |
| **Modelos psicológicos** | Consistencia de personalidad, respuestas emocionales | Rasgos Big Five, estilos de apego |

### Sistema de memoria de PNJ

```
Corto plazo: Últimas 3 interacciones (contexto inmediato)
    ↓
Medio plazo: Eventos significativos (cambios en relaciones)
    ↓
Largo plazo: Recuerdos fundamentales (experiencias formativas)
    ↓
Semántico: Recuperación basada en embeddings (memoria contextual)
```

**Influencias de la memoria:**
- Tono y vocabulario del diálogo
- Nivel de confianza y disposición a ayudar
- Estilo de saludo (cálido, frío, asustado)
- Disponibilidad de temas (personal, facción, misión)

### Comportamientos económicos y sociales

Los PNJ tienen **comportamientos económicos realistas** basados en patrones históricos:

| Comportamiento | Fuente | Implementación |
|----------------|--------|----------------|
| **Comercio** | Gremios de mercaderes medievales | Oferta/demanda, precios basados en reputación |
| **Artesanía** | Talleres de artesanos históricos | Niveles de habilidad, calidad de materiales, inversión de tiempo |
| **Dinámica social** | Jerarquía feudal | Relaciones señor/vasallo, lealtad de facción |
| **Intrigas políticas** | Política palaciega | Alianzas secretas, comercio de información |

---

## Mecánica de giros argumentales

### Selección de patrón narrativo

Cuando el jugador realiza una acción, el sistema:

1. **Analiza la intención** — ¿Qué intenta hacer el jugador?
2. **Simula el resultado** — ¿Qué ocurriría realistamente?
3. **Selecciona el arquetipo** — ¿Qué patrón bíblico/literario encaja?
4. **Aplica el estilo** — ¿Qué época/estado de ánimo literario corresponde?
5. **Genera prosa** — Combina patrón + estilo + contexto

### Ejemplo: El jugador traiciona a un aliado

```
Intención: traición
Simulación: Relación destruida, tensión de facción aumenta
Arquetipo: Génesis 37 (José vendido por sus hermanos)
Estilo: Drama social victoriano
Resultado: Narrativa explorando las consecuencias de la traición con detalle social dickensiano
```

### Dificultad dinámica

Las plantillas de misiones incluyen **puntuaciones de ambigüedad moral** (0-1):
- 0.0 — Bien/mal claro (historias infantiles)
- 0.5 — Elecciones complejas (RPG estándar)
- 1.0 — No hay respuesta correcta (narrativas maduras)

---

## Arquitectura de rendimiento

### Por qué el preprocesamiento gana

| Enfoque | Latencia | Costo en tokens | Calidad |
|---------|----------|-----------------|---------|
| **LLM en tiempo real** | 2-5 segundos | Alto | Variable |
| **DB preprocesada** | <100ms | Mínimo | Consistente |
| **Híbrido (TNS)** | <100ms + pulido | Bajo | Alto |

### El enfoque híbrido

1. **Consulta DB** — Obtener plantilla estructurada (milisegundo)
2. **Sustitución de variables** — Rellenar contexto (microsegundo)
3. **Aplicación de estilo** — Aplicar patrones literarios (milisegundo)
4. **Pulido LLM** — Generación de prosa final (opcional, para momentos críticos)

Esto nos da **velocidad de base de datos** con **calidad LLM** donde importa.

---

## Expansiones futuras

### Fuentes literarias adicionales

| Fuente | Potencial | Estado |
|--------|-----------|--------|
| **Shakespeare** | Patrones dramáticos, estilos de monólogo | Planificado |
| **Mitología** (griega, nórdica, celta) | Viaje del héroe, intervención divina | Planificado |
| **Crónicas históricas** | Intrigas políticas, narrativas bélicas | Planificado |
| **Cuentos populares** | Lecciones morales, patrones culturales | Planificado |

### Sistemas PNJ mejorados

| Característica | Descripción | Estado |
|----------------|-------------|--------|
| **Trasfondos culturales** | Comportamientos y habla específicos de región | En progreso |
| **Memoria generacional** | Historias familiares, agravios heredados | Planificado |
| **Especialización económica** | Comercio y artesanía específicos de gremios | En progreso |
| **Facciones políticas** | Sistemas dinámicos de alianza y rivalidad | Activo |

---

## Reglas del mundo y economía

### Jerarquía feudal

TrueNeverStory implementa un **sistema de rango feudal de 10 niveles** que gobierna la riqueza, impuestos, privilegios e interacciones sociales:

| Rango | Riqueza mín. | Guardias | Impuesto base | Salario | Puede dar sobornos | Puede recibir sobornos |
|-------|--------------|----------|---------------|---------|-------------------|----------------------|
| **Esclavo** | 0 | 0 | 100% | 0 | No | No |
| **Campesino** | 0 | 0 | 90% | 0 | Sí | No |
| **Baronet** | 100,000 | 50 | 30% | 0 | Sí | Sí |
| **Barón** | 500,000 | 200 | 28% | 0 | Sí | Sí |
| **Vizconde** | 2,000,000 | 1,000 | 25% | 0 | Sí | Sí |
| **Conde** | 10,000,000 | 5,000 | 22% | 0 | Sí | Sí |
| **Marqués** | 50,000,000 | 20,000 | 20% | 0 | Sí | Sí |
| **Duque** | 200,000,000 | 100,000 | 18% | 0 | Sí | Sí |
| **Rey** | 1,000,000,000 | 500,000 | 15% | 0 | Sí | Sí |
| **Emperador** | 10,000,000,000 | 2,000,000 | 10% | 0 | Sí | Sí |

**Reglas clave:**
- **Los esclavos** no pueden participar en la economía de sobornos (sin libre albedrío)
- **Los campesinos** pueden dar sobornos pero no recibirlos (sin poder)
- **Rangos superiores** pagan impuestos más bajos (descuento por poder) pero tienen costos de mantenimiento más altos
- **Umbrales de riqueza** deben alcanzarse para la promoción de rango

### Sistema fiscal

El sistema fiscal es **dinámico** e influenciado por múltiples factores:

```
Impuesto efectivo = Impuesto base × (1 - Descuento por poder - Descuento por popularidad)
```

**Componentes:**
- **Impuesto base** — Definido por rango (90% para campesinos, 10% para emperadores)
- **Descuento por poder** — Hasta 90% de reducción basada en poder político (poder / 10,000)
- **Descuento por popularidad** — Hasta 30% de reducción basada en aprobación pública (popularidad / 3,000)

**Flujo fiscal:**
```
Ingreso NPC → Cálculo fiscal → Recolección de tesoro → Tesoro del señor
     ↓              ↓              ↓                  ↓
  Basado en     Tasas          Procesamiento      Acumulación
  rango         dinámicas      por turno con      a lo largo
  salario                      verificaciones     de la cadena
                               de lealtad         feudal
```

**Consecuencias de altos impuestos:**
- **Riesgo de traición** = (Carga fiscal + Sobornos) / Ingreso × (1 - Lealtad / 1000)
- Alta carga fiscal aumenta la probabilidad de rebelión
- La lealtad actúa como amortiguador contra la traición

### Economía de sobornos

Los sobornos son una **mecánica económica de primera clase** que influye en la política, lealtad y dinámicas de poder:

**Tipos de sobornos:**
| Tipo | Propósito | Nivel de riesgo |
|------|-----------|-----------------|
| **Protección** | Evitar castigo o persecución | Medio |
| **Favor** | Obtener trato preferencial | Bajo |
| **Silencio** | Mantener secretos ocultos | Alto |
| **Acceso** | Acceder a áreas o personas restringidas | Medio |
| **Promoción** | Avanzar en rango o posición | Alto |
| **Exención** | Evitar impuestos u obligaciones | Muy alto |

**Fórmula de riesgo de soborno:**
```
Riesgo = Riesgo base (10%) + Riesgo de cantidad (cantidad / 10,000) + Riesgo de testigos (testigos × 15%) - Habilidad del receptor (intrigas × 0.1%)
```

**Factores de riesgo:**
- **Cantidad** — Sobornos más grandes son más riesgosos
- **Testigos** — Más observadores aumentan la chance de detección
- **Intrigas del receptor** — Oficiales hábiles pueden ocultar corrupción
- **Tipo de soborno** — Algunos tipos son inherentemente más riesgosos

**Impacto económico:**
- Los sobornos **reducen la lealtad** (la corrupción erosiona la confianza)
- Los sobornos **aumentan la riqueza** de los receptores
- Los sobornos **aumentan el poder** (1% de la cantidad se convierte en poder)
- Los sobornos **reducen la popularidad** (el público desaprueba la corrupción)

### Ciclos económicos (Modelo de José)

Basado en el **modelo bíblico de José** (Génesis 41), la economía atraviesa tres fases:

**Ciclo de fases:**
```
Abundancia (30 días) → Transición (10 días) → Hambruna (20 días) → Abundancia...
```

**Efectos de fase:**
| Fase | Modificador de precio | Cambio de reserva | Eventos narrativos |
|------|----------------------|-------------------|-------------------|
| **Abundancia** | 0.8× (barato) | +20% por turno | Cosecha, booms comerciales |
| **Transición** | 1.0× (normal) | Estable | Incertidumbre del mercado |
| **Hambruna** | 2.0× (caro) | -30% por turno | Sequía, peste, guerra |

**Implicaciones estratégicas:**
- **Almacene reservas** durante la abundancia para sobrevivir a la hambruna
- **Planificación de precios** requiere anticipar transiciones de fase
- **Decisiones del jugador** pueden influir en la duración y severidad de las fases

### Sistema de jubileo

Cada **50 años**, un **evento de jubileo** desencadena un reinicio económico masivo:

**Efectos del jubileo:**
1. **Cancelación de deudas** — Todas las deudas pendientes se perdonan
2. **Retorno de tierras** — Todas las tierras hipotecadas regresan a los propietarios
3. **Bonus de lealtad** — +30% de bonus de lealtad para todos los PNJ (dura 10 días)

**Base histórica:**
Basado en el **jubileo bíblico** (Levítico 25), que prevenía la pobreza permanente y mantenía la movilidad social.

**Implicaciones estratégicas:**
- **Temporización de deudas** — Evite prestar cerca de años de jubileo
- **Adquisición de tierras** — La posesión temporal crea dinámicas interesantes
- **Estabilidad social** — El jubileo previene la concentración extrema de riqueza

### Dilemas fiscales de facción

Cuando dos facciones tienen reclamos fiscales conflictivos, el sistema genera **dilemas morales** para el jugador:

**Generación de dilemas:**
- 30% de probabilidad por turno económico
- Mínimo 30 días de enfriamiento entre dilemas
- Los montos fiscales van de 100 a 1,000 monedas de oro

**Elecciones del jugador:**
| Elección | Lealtad Facción A | Lealtad Facción B | Reputación |
|----------|-------------------|-------------------|------------|
| **Pagar Facción A** | +50 | -30 | Neutral |
| **Pagar Facción B** | -30 | +50 | Neutral |
| **Rechazar ambos** | -20 | -20 | -10 (poco confiable) |

**Integración narrativa:**
Cada dilema genera una historia contextual que explica el conflicto, forzando al jugador a tomar decisiones políticas significativas.

### Reglas laborales de facción

Cada facción puede establecer **políticas laborales individuales** que afectan salarios y lealtad:

**Parámetros de reglas laborales:**
- **Salarios fijos** — Sí/No (predecible vs. basado en rendimiento)
- **Monto del salario** — Pago base por período de trabajo
- **Modificador de lealtad** — Bonus/penalización a la lealtad del trabajador

**Cálculo del salario:**
```
Salario final = Salario base × Horas trabajadas × Productividad × Modificador de facción
```

**Conflictos de lealtad:**
Cuando los PNJ trabajan para múltiples facciones, pueden surgir conflictos de lealtad:
- **Doble lealtad** reduce la efectividad
- **Cambio de facción** tiene costos de reputación
- **Paros laborales** ocurren durante conflictos

### Economía de esclavos

Un sistema **moralmente complejo** que refleja dinámicas de poder históricas:

**Propiedades de esclavos:**
- **Salud** — Condición física (afecta el valor)
- **Experiencia** — Habilidades y conocimientos (aumenta el valor)
- **Vicios** — Avaricia, ira, pereza (reduce el valor)
- **Familia** — Los esclavos pueden tener familias (crea obligaciones)

**Fórmula de valor de esclavo:**
```
Valor = 100 + (Experiencia × 0.1) + (Salud × 0.05) - Penalizaciones por vicios
```

**Ciclo de vida del esclavo:**
1. **Esclavización** — Por deuda, captura o nacimiento
2. **Trabajo** — Produce bienes (300-1000 unidades por turno)
3. **Rebelión** — Posible si los guardias son débiles (ratio de fuerza determina el éxito)
4. **Liberación** — Cuesta 200 monedas de oro, otorga estatus de campesino

**Consideraciones éticas:**
- El sistema está diseñado para ser **moralmente incómodo**
- Las elecciones del jugador tienen **consecuencias reales** para los PNJ esclavos
- **Mecánica de rebelión** garantiza que la esclavitud nunca sea "segura"
- **Caminos de liberación** proporcionan oportunidades de redención moral

### Integración con el grafo social

La economía se integra con el **grafo social** para dinámicas de poder realistas:

**Relaciones feudales:**
```
Vasallo → Señor (impuesto + obligación militar)
  ↓
Cadena de mando (múltiples niveles)
  ↓
Acumulación de flujo fiscal (impuestos recolectados)
```

**Economía de facción:**
- **Facciones económicas** controlan comercio y recursos
- **Facciones militares** proporcionan seguridad (a cambio de pago)
- **Facciones religiosas** influyen en elecciones morales
- **Facciones criminales** operan fuera de la economía legal

**Sistema de reputación:**
- **Aprobación pública** afecta tasas fiscales
- **Posición de facción** determina acceso a recursos
- **Reputación personal** influye en tasas de éxito de sobornos

### Base de datos económica

Todos los datos económicos se almacenan en una **base de datos SQLite** dedicada (`economic.db`):

**Tablas:**
- `economic_cycles` — Seguimiento de fase con modificadores de precio
- `jubilee_events` — Registros históricos de jubileos
- `faction_labor_rules` — Política salarial por facción
- `faction_dilemmas` — Historial de disputas fiscales

**Rendimiento:**
- **Consultas indexadas** para cálculos económicos rápidos
- **Procesamiento por lotes** para operaciones PNJ (decaimiento de edad, decaimiento de vicios, impuestos, lealtad)
- **Núcleos Mojo** para operaciones intensivas en cálculo (5× aceleración)

---

## Resumen

La arquitectura de TrueNeverStory combina:

1. **Procesamiento en inglés** para calidad LLM y eficiencia de tokens
2. **Bases de datos literarias preprocesadas** para acceso instantáneo a patrones narrativos ricos
3. **Sistemas PNJ multicapa** para personajes creíbles y memorables
4. **Generación híbrida** que equilibra velocidad y calidad

El resultado es un sistema capaz de generar **narrativas de calidad literaria** a **velocidades de base de datos** mientras mantiene **consistencia profunda de personajes** y **elecciones significativas para el jugador**.
