# About TrueNeverStory — Design Rationale

## Language Strategy: English Inside, Translate at Boundary

### Why English for Agent Processing

TrueNeverStory uses a **"English inside, translate at boundary"** architecture for several critical reasons:

1. **LLM Quality** — Large Language Models perform best in English, their primary training language. Using English for internal processing ensures:
   - More consistent narrative quality
   - Better understanding of complex prompts
   - Fewer hallucinations and style inconsistencies
   - Access to the full breadth of literary references

2. **Token Economy** — English is typically 20-40% more token-efficient than other languages for the same semantic content. This means:
   - More context fits in the prompt window
   - Lower API costs per request
   - Faster processing times

3. **Literary Richness** — The source materials (Bible, Gutenberg classics) are primarily in English or have canonical English translations. Processing in English preserves:
   - Direct access to archetypal patterns
   - Stylistic authenticity from source texts
   - Nuanced emotional and thematic content

### Translation Pipeline

```
User Input (any language)
    ↓
TranslationService.translateToEnglish()
    ↓
Intent Parsing (English)
    ↓
Agent Processing (English)
    ↓
Response Generation (English)
    ↓
TranslationService.translate()
    ↓
User Output (original language)
```

**Key Design Decisions:**
- Translation happens **once at input** and **once at output**
- All internal state, memory, and processing remain in English
- Agents never see or produce non-English text directly
- UI translations are separate from content translations (i18n vs TranslationService)

---

## Literary Database Architecture: Token Economy Through Pre-Processing

### The Problem

Generating rich, literary narratives from scratch requires:
- Large prompts with style examples
- Multiple LLM calls for different aspects (plot, style, emotion)
- High token consumption for quality output

### The Solution: Offline Literary Compilation

TrueNeverStory pre-processes literary sources into structured SQLite databases **before deployment**:

```
Source Texts → LiteraryCompiler → SQLite Databases → Runtime Queries
     ↓              ↓                    ↓                ↓
  Bible.db    4-pass parser      FTS5 indexed      Millisecond
  Gutenberg   (dramaturgic,      quest templates    lookups
  Classics    stylistic,         style patterns
              emotional,         emotional arcs
              metadata)
```

### Database Types

| Database | Source | Content | Purpose |
|----------|--------|---------|---------|
| `bible.db` | Biblical texts | Quest templates, archetypes, moral dilemmas | Narrative structure |
| `gutenberg.db` | Project Gutenberg | Style patterns, sensory descriptions, pacing | Literary quality |
| `literary.db` | Compiled output | Unified templates with FTS5 search | Runtime access |

### Token Savings

**Without pre-processing:**
```
Prompt: "Generate a quest about betrayal in the style of ancient epic literature..."
Tokens: ~500-800 for prompt + ~300-500 for response = ~800-1300 tokens
```

**With pre-processing:**
```
Query: db.queryTemplates({ archetype: 'betrayal', mood: 'epic' })
Tokens: ~50 for query + ~200-300 for response = ~250-350 tokens
```

**Savings: 60-75% reduction in token usage per narrative element.**

---

## Rich Literary Sources

### Biblical Archetypes

The Bible provides **time-tested narrative structures** that resonate across cultures:

| Archetype | Source | Pattern | Modern Application |
|-----------|--------|---------|-------------------|
| **Escape** | Exodus 14 | Leader → Tyrant → Obstacle → Intervention → Freedom | Rebellion quests, jailbreak scenarios |
| **Judgment** | 1 Kings 3 | Dispute → Wise Ruler → Hidden Truth → Justice | Court intrigue, moral dilemmas |
| **Inheritance** | Luke 15 | Prodigal → Wastes → Returns → Acceptance | Redemption arcs, family drama |
| **Rise-Fall-Rise** | Genesis 37-50 | Favored → Betrayed → Suffering → Rise → Reconciliation | Character development arcs |
| **Endurance** | Job | Suffering → Doubt → Persistence → Restoration | Testing player resolve |
| **Liberation** | Judges | Oppression → Call → Gathering → Victory | War campaigns, revolution stories |

**Why Biblical patterns work:**
- **Universal recognition** — Players instinctively understand these structures
- **Moral complexity** — Biblical narratives rarely have simple good/evil divisions
- **Emotional depth** — Themes of loss, hope, betrayal, redemption
- **Scalable drama** — Works for intimate stories and epic campaigns

### Gutenberg Style Patterns

Project Gutenberg provides **centuries of literary craftsmanship**:

| Era | Authors | Style Elements | Use Case |
|-----|---------|----------------|----------|
| **Gothic** | Poe, Shelley, Stoker | Dark atmosphere, sensory dread, psychological tension | Horror, mystery |
| **Victorian** | Dickens, Brontës | Social commentary, detailed descriptions, moral complexity | Social intrigue |
| **Epic** | Homer, Milton | Grand scale, heroic language, mythic resonance | Wars, quests |
| **Romantic** | Byron, Keats | Emotional intensity, nature imagery, passion | Love stories, personal drama |

**Delexification Process:**
1. Extract structural patterns (sentence length, rhythm, vocabulary)
2. Remove character names and specific references
3. Preserve sensory markers and emotional tone
4. Create reusable templates with variables

---

## NPC Individuality and Character

### Multi-Layer Character System

Each NPC has **four layers of depth**:

```
L1: Basic Info (name, role, location)
    ↓
L2: Personality (traits, quirks, speech patterns)
    ↓
L3: Hidden Motivations (secret goals, fears, desires)
    ↓
L4: Dynamic State (relationships, memories, emotional state)
```

### Character Sources

| Source | Contribution | Example |
|--------|--------------|---------|
| **Biblical archetypes** | Moral frameworks, loyalty patterns | Ruth's loyalty, David's ambition |
| **Gutenberg characters** | Speech patterns, social behaviors | Dickens' social climbers, Brontës' passionate souls |
| **Historical patterns** | Political behaviors, faction dynamics | Court intrigue, guild politics |
| **Psychological models** | Personality consistency, emotional responses | Big Five traits, attachment styles |

### NPC Memory System

```
Short-term: Last 3 interactions (immediate context)
    ↓
Medium-term: Significant events (relationship changes)
    ↓
Long-term: Core memories (formative experiences)
    ↓
Semantic: Embedding-based recall (contextual memory)
```

**Memory influences:**
- Dialogue tone and vocabulary
- Trust level and willingness to help
- Greeting style (warm, cold, fearful)
- Topic availability (personal, faction, quest)

### Economic and Social Behaviors

NPCs have **realistic economic behaviors** based on historical patterns:

| Behavior | Source | Implementation |
|----------|--------|----------------|
| **Trading** | Medieval merchant guilds | Supply/demand, reputation-based pricing |
| **Crafting** | Historical artisan workshops | Skill levels, material quality, time investment |
| **Social dynamics** | Feudal hierarchy | Lord/vassal relationships, faction loyalty |
| **Political intrigue** | Court politics | Secret alliances, information trading |

---

## Story Turn Mechanics

### Narrative Pattern Selection

When the player takes an action, the system:

1. **Analyzes intent** — What is the player trying to do?
2. **Simulates outcome** — What would realistically happen?
3. **Selects archetype** — Which biblical/literary pattern fits?
4. **Applies style** — Which literary era/mood matches?
5. **Generates prose** — Combines pattern + style + context

### Example: Player Betrays an Ally

```
Intent: betrayal
Simulation: Relationship destroyed, faction tension rises
Archetype: Genesis 37 (Joseph sold by brothers)
Style: Victorian social drama
Result: Narrative exploring betrayal's consequences with Dickensian social detail
```

### Dynamic Difficulty

Quest templates include **moral ambiguity scores** (0-1):
- 0.0 — Clear good/evil (children's stories)
- 0.5 — Complex choices (standard RPG)
- 1.0 — No clear right answer (mature narratives)

---

## Performance Architecture

### Why Pre-processing Wins

| Approach | Latency | Token Cost | Quality |
|----------|---------|------------|---------|
| **On-the-fly LLM** | 2-5 seconds | High | Variable |
| **Pre-processed DB** | <100ms | Minimal | Consistent |
| **Hybrid (TNS)** | <100ms + polish | Low | High |

### The Hybrid Approach

1. **DB Query** — Get structured template (millisecond)
2. **Variable Substitution** — Fill in context (microsecond)
3. **Style Application** — Apply literary patterns (millisecond)
4. **LLM Polish** — Final prose generation (optional, for critical moments)

This gives us **database speed** with **LLM quality** where it matters.

---

## Future Expansions

### Additional Literary Sources

| Source | Potential | Status |
|--------|-----------|--------|
| **Shakespeare** | Drama patterns, soliloquy styles | Planned |
| **Mythology** (Greek, Norse, Celtic) | Hero's journey, divine intervention | Planned |
| **Historical chronicles** | Political intrigue, war narratives | Planned |
| **Folk tales** | Moral lessons, cultural patterns | Planned |

### Enhanced NPC Systems

| Feature | Description | Status |
|---------|-------------|--------|
| **Cultural backgrounds** | Region-specific behaviors and speech | In progress |
| **Generational memory** | Family histories, inherited grudges | Planned |
| **Economic specialization** | Guild-specific trading and crafting | In progress |
| **Political factions** | Dynamic alliance and rivalry systems | Active |

---

## World Rules and Economy

### Feudal Hierarchy

TrueNeverStory implements a **10-level feudal rank system** that governs wealth, taxes, privileges, and social interactions:

| Rank | Wealth Min | Guards | Base Tax | Salary | Can Give Bribes | Can Take Bribes |
|------|------------|--------|----------|--------|-----------------|-----------------|
| **Slave** | 0 | 0 | 100% | 0 | No | No |
| **Commoner** | 0 | 0 | 90% | 0 | Yes | No |
| **Baronet** | 100,000 | 50 | 30% | 0 | Yes | Yes |
| **Baron** | 500,000 | 200 | 28% | 0 | Yes | Yes |
| **Viscount** | 2,000,000 | 1,000 | 25% | 0 | Yes | Yes |
| **Count** | 10,000,000 | 5,000 | 22% | 0 | Yes | Yes |
| **Marquis** | 50,000,000 | 20,000 | 20% | 0 | Yes | Yes |
| **Duke** | 200,000,000 | 100,000 | 18% | 0 | Yes | Yes |
| **King** | 1,000,000,000 | 500,000 | 15% | 0 | Yes | Yes |
| **Emperor** | 10,000,000,000 | 2,000,000 | 10% | 0 | Yes | Yes |

**Key Rules:**
- **Slaves** cannot participate in the bribe economy (no agency)
- **Commoners** can give bribes but cannot receive them (no power)
- **Higher ranks** pay lower taxes (power discount) but have higher maintenance costs
- **Wealth thresholds** must be met to achieve rank promotion

### Tax System

The tax system is **dynamic** and influenced by multiple factors:

```
Effective Tax = Base Tax × (1 - Power Discount - Popularity Discount)
```

**Components:**
- **Base Tax** — Defined by rank (90% for commoners, 10% for emperors)
- **Power Discount** — Up to 90% reduction based on political power (power / 10,000)
- **Popularity Discount** — Up to 30% reduction based on public approval (popularity / 3,000)

**Tax Flow:**
```
NPC Income → Tax Calculation → Treasury Collection → Lord's Treasury
     ↓              ↓                  ↓                  ↓
  Rank-based    Dynamic rate      Per-turn processing   Feudal chain
  salary        modifiers         with loyalty checks   accumulation
```

**Consequences of High Taxes:**
- **Betrayal Risk** = (Tax Burden + Bribes) / Income × (1 - Loyalty / 1000)
- High tax burden increases rebellion likelihood
- Loyalty acts as a buffer against betrayal

### Bribe Economy

Bribes are a **first-class economic mechanic** that influences politics, loyalty, and power dynamics:

**Bribe Types:**
| Type | Purpose | Risk Level |
|------|---------|------------|
| **Protection** | Avoid punishment or persecution | Medium |
| **Favor** | Gain preferential treatment | Low |
| **Silence** | Keep secrets hidden | High |
| **Access** | Reach restricted areas or people | Medium |
| **Promotion** | Advance in rank or position | High |
| **Exemption** | Avoid taxes or obligations | Very High |

**Bribe Risk Formula:**
```
Risk = Base Risk (10%) + Amount Risk (amount / 10,000) + Witness Risk (witnesses × 15%) - Taker Skill (intrigue × 0.1%)
```

**Risk Factors:**
- **Amount** — Larger bribes are riskier
- **Witnesses** — More observers increase detection chance
- **Taker's Intrigue** — Skilled officials can hide corruption
- **Bribe Type** — Some types are inherently riskier

**Economic Impact:**
- Bribes **reduce loyalty** (corruption erodes trust)
- Bribes **increase wealth** for recipients
- Bribes **increase power** (1% of bribe amount converts to power)
- Bribes **reduce popularity** (public disapproves of corruption)

### Economic Cycles (Joseph Model)

Based on the **biblical model of Joseph** (Genesis 41), the economy cycles through three phases:

**Phase Cycle:**
```
Abundance (30 days) → Transition (10 days) → Famine (20 days) → Abundance...
```

**Phase Effects:**
| Phase | Price Modifier | Reserve Change | Narrative Events |
|-------|---------------|----------------|------------------|
| **Abundance** | 0.8× (cheap) | +20% per turn | Harvest, trade booms |
| **Transition** | 1.0× (normal) | Stable | Market uncertainty |
| **Famine** | 2.0× (expensive) | -30% per turn | Drought, plague, war |

**Strategic Implications:**
- **Store reserves** during abundance for famine survival
- **Price planning** requires anticipating phase transitions
- **Player decisions** can influence phase duration and severity

### Jubilee System

Every **50 years**, a **Jubilee event** triggers massive economic reset:

**Jubilee Effects:**
1. **Debt Reset** — All outstanding debts are forgiven
2. **Land Return** — All mortgaged lands return to original owners
3. **Loyalty Boost** — +30% loyalty bonus for all NPCs (lasts 10 days)

**Historical Basis:**
Based on the **Biblical Jubilee** (Leviticus 25), which prevented permanent poverty and maintained social mobility.

**Strategic Implications:**
- **Debt timing** — Avoid lending near Jubilee years
- **Land acquisition** — Temporary ownership creates interesting dynamics
- **Social stability** — Jubilee prevents extreme wealth concentration

### Faction Tax Dilemmas

When two factions have conflicting tax claims, the system generates **moral dilemmas** for the player:

**Dilemma Generation:**
- 30% chance per economic tick
- Minimum 30-day cooldown between dilemmas
- Tax amounts range from 100 to 1,000 gold

**Player Choices:**
| Choice | Faction A Loyalty | Faction B Loyalty | Reputation |
|--------|-------------------|-------------------|------------|
| **Pay Faction A** | +50 | -30 | Neutral |
| **Pay Faction B** | -30 | +50 | Neutral |
| **Refuse Both** | -20 | -20 | -10 (unreliable) |

**Narrative Integration:**
Each dilemma generates a contextual story explaining the conflict, forcing the player to make meaningful political choices.

### Faction Labor Rules

Each faction can set **custom labor policies** that affect wages and loyalty:

**Labor Rule Parameters:**
- **Fixed Wages** — Yes/No (predictable vs. performance-based)
- **Wage Amount** — Base pay per work period
- **Loyalty Modifier** — Bonus/penalty to worker loyalty

**Wage Calculation:**
```
Final Wage = Base Wage × Hours Worked × Productivity × Faction Modifier
```

**Loyalty Conflicts:**
When NPCs work for multiple factions, loyalty conflicts can arise:
- **Dual loyalty** reduces effectiveness
- **Faction switching** has reputation costs
- **Work stoppages** occur during conflicts

### Slave Economy

A **morally complex** system that reflects historical power dynamics:

**Slave Properties:**
- **Health** — Physical condition (affects value)
- **Experience** — Skills and knowledge (increases value)
- **Vices** — Greed, wrath, sloth (decreases value)
- **Family** — Slaves can have families (creates obligations)

**Slave Value Formula:**
```
Value = 100 + (Experience × 0.1) + (Health × 0.05) - Vice Penalties
```

**Slave Lifecycle:**
1. **Enslavement** — Through debt, capture, or birth
2. **Labor** — Produces goods (300-1000 units per turn)
3. **Rebellion** — Possible if guards are weak (strength ratio determines success)
4. **Liberation** — Costs 200 gold, grants commoner status

**Ethical Considerations:**
- System is designed to be **morally uncomfortable**
- Player choices have **real consequences** for slave NPCs
- **Rebellion mechanics** ensure slavery is never "safe"
- **Liberation paths** provide moral redemption opportunities

### Social Graph Integration

The economy integrates with the **social graph** for realistic power dynamics:

**Feudal Relationships:**
```
Vassal → Lord (tax + military obligation)
  ↓
Chain of Command (multiple levels)
  ↓
Tax Flow Accumulation (total taxes collected)
```

**Faction Economics:**
- **Economic factions** control trade and resources
- **Military factions** provide security (at cost)
- **Religious factions** influence moral choices
- **Criminal factions** operate outside legal economy

**Reputation System:**
- **Public approval** affects tax rates
- **Faction standing** determines access to resources
- **Personal reputation** influences bribe success rates

### Economic Database

All economic data is stored in a dedicated **SQLite database** (`economic.db`):

**Tables:**
- `economic_cycles` — Phase tracking with price modifiers
- `jubilee_events` — Historical Jubilee records
- `faction_labor_rules` — Per-faction wage policies
- `faction_dilemmas` — Tax dispute history

**Performance:**
- **Indexed queries** for fast economic calculations
- **Batch processing** for NPC operations (age decay, vice decay, tax, loyalty)
- **Mojo kernels** for compute-intensive operations (5× speedup)

---

## Summary

TrueNeverStory's architecture combines:

1. **English-first processing** for LLM quality and token efficiency
2. **Pre-processed literary databases** for instant access to rich narrative patterns
3. **Multi-layered NPC systems** for believable, memorable characters
4. **Hybrid generation** balancing speed and quality

The result is a system that can generate **literary-quality narratives** at **database speeds** while maintaining **deep character consistency** and **meaningful player choices**.
