# Jungian Profiler — Phase 4A: Author embeddings corpus (Task 4.1)

> **For agentic workers:** REQUIRED SUB-SKILL: compose:subagent или compose:execute. Steps — checkbox `- [ ]`.
> **Родитель:** `2026-08-14-jungian-profiler.md` (Global Constraints наследуются).
> **Covers:** дизайн S7; impl-спека `spec-profiler-implementation.md` (out of scope, теперь Phase 4).

**Acceptance (4A):** `data/author-embeddings.json` — 50 валидных записей `AuthorEntry`, каждая с непустым `embedding` одинаковой dim (= настроенной embedding-модели), `psychotype`, 3-5 `samplePhrases`, `genres`. Скрипт `bun run scripts/build-author-embeddings.ts` идемпотентен (перезапись файла) и падает с ненулевым кодом, если embedding-сервер недоступен.

> **Модель embedding — настроенная, не хардкод BGE-M3:** default `WORLD_EMBEDDING_MODEL=text-embedding-3-small`; BGE-M3 подключается через llama.cpp (`EMBEDDING_ENDPOINT=127.0.0.1:5002`, 1024-dim) при соответствующей конфигурации. Ниже «BGE-M3» читается как «настроенная embedding-модель».

**Files:**
- Create: `scripts/build-author-embeddings.ts`
- Create: `data/author-embeddings.json` (генерируется скриптом, не руками)

---

## Task 4.1: Author embeddings corpus

**Covers:** S7
**Interfaces (Produces):** `data/author-embeddings.json` — массив `AuthorEntry[]` (тип определён в Task 4.2). Потребляется `loadAuthorCorpus()` (Task 4.2) и `matchAuthor()` (Task 4.2).

> Выбор сигнатуры: embedding автора = embedding от `samplePhrases.join(' ')` (few-shot фразы и есть стилевой слепок автора). Это консистентно с тем, что на лету сравнивается embedding пролога с этими же фразовыми embedding'ами.

- [ ] **Step 1: Write the seed + build script**

```typescript
// scripts/build-author-embeddings.ts (create)
import { LLMClient } from '../src/lib/llm-client';

interface SeedAuthor {
  name: string;
  genres: string[];
  psychotype: { e: number; n: number; t: number; j: number };
  samplePhrases: string[];
}

const SEED_AUTHORS: SeedAuthor[] = [
  // Fantasy
  { name: 'J.R.R. Tolkien', genres: ['fantasy'], psychotype: { e: 0.30, n: 0.80, t: 0.55, j: 0.75 },
    samplePhrases: ['In a hole in the ground there lived a hobbit.', 'Not all those who wander are lost.'] },
  { name: 'C.S. Lewis', genres: ['fantasy'], psychotype: { e: 0.40, n: 0.70, t: 0.50, j: 0.70 },
    samplePhrases: ['Once there were four children whose names were Peter, Susan, Edmund and Lucy.', 'This is a story about something that happened long ago.'] },
  { name: 'Ursula K. Le Guin', genres: ['fantasy', 'scifi'], psychotype: { e: 0.35, n: 0.75, t: 0.60, j: 0.55 },
    samplePhrases: ['The island of Gont, a single mountain that lifts its peak a mile above the storm-racked Northeast Sea, is a land famous for wizards.', 'Only in silence the word, only in dark the light.'] },
  { name: 'George R.R. Martin', genres: ['fantasy'], psychotype: { e: 0.40, n: 0.55, t: 0.70, j: 0.50 },
    samplePhrases: ['The morning had dawned clear and cold, with a crispness that hinted at the end of summer.', 'Winter is coming.'] },
  { name: 'Robert E. Howard', genres: ['fantasy'], psychotype: { e: 0.70, n: 0.50, t: 0.60, j: 0.40 },
    samplePhrases: ['Know, O prince, that between the years when the oceans drank Atlantis and the gleaming cities.', 'Hither came Conan, the Cimmerian, black-haired, sullen-eyed.'] },
  { name: 'Lord Dunsany', genres: ['fantasy'], psychotype: { e: 0.30, n: 0.90, t: 0.50, j: 0.40 },
    samplePhrases: ['Toldees, Mondath, Arizim, these are the Inner Lands.', 'I know not whether these things be true or false.'] },
  { name: 'William Morris', genres: ['fantasy'], psychotype: { e: 0.40, n: 0.80, t: 0.45, j: 0.55 },
    samplePhrases: ['Up and away through the bracken and thorn.', 'This is the book of the wanderers.'] },
  { name: 'Terry Pratchett', genres: ['fantasy'], psychotype: { e: 0.55, n: 0.70, t: 0.60, j: 0.45 },
    samplePhrases: ['The sun rose slowly, as if it was not sure it was worth all the effort.', 'The entire cosmos is a huge practical joke.'] },
  { name: 'Neil Gaiman', genres: ['fantasy', 'horror'], psychotype: { e: 0.50, n: 0.80, t: 0.50, j: 0.45 },
    samplePhrases: ['There was a hand in the darkness, and it held a knife.', 'The magician\'s house had a very large library.'] },
  { name: 'J.K. Rowling', genres: ['fantasy'], psychotype: { e: 0.45, n: 0.60, t: 0.40, j: 0.60 },
    samplePhrases: ['Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much.', 'It takes a great deal of bravery to stand up to our enemies, but just as much to stand up to our friends.'] },
  { name: 'Patrick Rothfuss', genres: ['fantasy'], psychotype: { e: 0.40, n: 0.70, t: 0.55, j: 0.60 },
    samplePhrases: ['It was night again. The Waystone Inn lay in silence, and it was a silence of three parts.', 'My name is Kvothe.'] },
  { name: 'Brandon Sanderson', genres: ['fantasy'], psychotype: { e: 0.45, n: 0.70, t: 0.70, j: 0.65 },
    samplePhrases: ['Ash fell from the sky.', 'Life before death, strength before weakness, journey before destination.'] },
  { name: 'Michael Moorcock', genres: ['fantasy'], psychotype: { e: 0.50, n: 0.70, t: 0.50, j: 0.40 },
    samplePhrases: ['Elric of Melniboné, last of the Bright Emperors, sat alone upon the Ruby Throne.', 'The past is a dream that never ends.'] },
  { name: 'Andre Norton', genres: ['fantasy', 'scifi'], psychotype: { e: 0.40, n: 0.60, t: 0.55, j: 0.60 },
    samplePhrases: ['The storm had come up out of the sea without warning.', 'There is no peace save that which a man makes for himself.'] },
  // Sci-fi
  { name: 'Isaac Asimov', genres: ['scifi'], psychotype: { e: 0.45, n: 0.75, t: 0.85, j: 0.70 },
    samplePhrases: ['The last question was asked for the first time, half in jest, on May 21, 2061.', 'Violence is the last refuge of the incompetent.'] },
  { name: 'Arthur C. Clarke', genres: ['scifi'], psychotype: { e: 0.40, n: 0.75, t: 0.85, j: 0.70 },
    samplePhrases: ['The drought had lasted now for ten million years, and the reign of the terrible lizards had long since ended.', 'Any sufficiently advanced technology is indistinguishable from magic.'] },
  { name: 'Robert A. Heinlein', genres: ['scifi'], psychotype: { e: 0.60, n: 0.60, t: 0.80, j: 0.60 },
    samplePhrases: ['The door dilated.', 'Specialization is for insects.'] },
  { name: 'Philip K. Dick', genres: ['scifi'], psychotype: { e: 0.40, n: 0.85, t: 0.60, j: 0.40 },
    samplePhrases: ['A merry little surge of electricity piped by automatic alarm from the mood organ beside his bed awakened Rick Deckard.', 'Everything is true. Except what I tell you.'] },
  { name: 'Frank Herbert', genres: ['scifi'], psychotype: { e: 0.40, n: 0.80, t: 0.75, j: 0.70 },
    samplePhrases: ['A beginning is the time for taking the most delicate care that the balances are correct.', 'Fear is the mind-killer.'] },
  { name: 'Ray Bradbury', genres: ['scifi'], psychotype: { e: 0.50, n: 0.75, t: 0.50, j: 0.45 },
    samplePhrases: ['It was a pleasure to burn.', 'Stuff your eyes with wonder.'] },
  { name: 'William Gibson', genres: ['scifi'], psychotype: { e: 0.40, n: 0.75, t: 0.65, j: 0.45 },
    samplePhrases: ['The sky above the port was the color of television, tuned to a dead channel.', 'The future is already here, it is just not evenly distributed.'] },
  { name: 'Stanislaw Lem', genres: ['scifi'], psychotype: { e: 0.40, n: 0.80, t: 0.80, j: 0.55 },
    samplePhrases: ['One day Trurl the constructor put together a machine.', 'The Invincible moved at a speed close to that of light.'] },
  { name: 'H.G. Wells', genres: ['scifi'], psychotype: { e: 0.40, n: 0.75, t: 0.70, j: 0.60 },
    samplePhrases: ['No one would have believed in the last years of the nineteenth century that this world was being watched keenly and closely by intelligences greater than man\'s.', 'The universe is not only stranger than we imagine, it is stranger than we can imagine.'] },
  { name: 'Jules Verne', genres: ['scifi', 'adventure'], psychotype: { e: 0.50, n: 0.60, t: 0.75, j: 0.70 },
    samplePhrases: ['The year 1866 was signalised by a remarkable incident, a mysterious and puzzling phenomenon.', 'The sea is everything.'] },
  { name: 'Kurt Vonnegut', genres: ['scifi'], psychotype: { e: 0.55, n: 0.70, t: 0.55, j: 0.40 },
    samplePhrases: ['All this happened, more or less.', 'So it goes.'] },
  { name: 'Iain M. Banks', genres: ['scifi'], psychotype: { e: 0.50, n: 0.75, t: 0.70, j: 0.50 },
    samplePhrases: ['The ship did not even have a name yet.', 'It was a lovely party.'] },
  { name: 'Dan Simmons', genres: ['scifi'], psychotype: { e: 0.45, n: 0.80, t: 0.65, j: 0.55 },
    samplePhrases: ['The Hegemony Consul sat on the balcony of his ebony spaceship.', 'The sky was the color of a wound.'] },
  // Horror
  { name: 'H.P. Lovecraft', genres: ['horror'], psychotype: { e: 0.20, n: 0.85, t: 0.70, j: 0.55 },
    samplePhrases: ['The most merciful thing in the world, I think, is the inability of the human mind to correlate all its contents.', 'Ph\'nglui mglw\'nafh Cthulhu R\'lyeh wgah\'nagl fhtagn.'] },
  { name: 'Edgar Allan Poe', genres: ['horror'], psychotype: { e: 0.35, n: 0.80, t: 0.60, j: 0.50 },
    samplePhrases: ['Once upon a midnight dreary, while I pondered, weak and weary.', 'It was many and many a year ago, in a kingdom by the sea.'] },
  { name: 'Mary Shelley', genres: ['horror'], psychotype: { e: 0.35, n: 0.70, t: 0.50, j: 0.55 },
    samplePhrases: ['You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.', 'It was on a dreary night of November that I beheld the accomplishment of my toils.'] },
  { name: 'Bram Stoker', genres: ['horror'], psychotype: { e: 0.40, n: 0.65, t: 0.60, j: 0.70 },
    samplePhrases: ['3 May. Bistritz. Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning.', 'I am all in a sea of wonders.'] },
  { name: 'Shirley Jackson', genres: ['horror'], psychotype: { e: 0.35, n: 0.70, t: 0.55, j: 0.60 },
    samplePhrases: ['The morning of June 27th was clear and sunny, with the fresh warmth of a full-summer day.', 'No live organism can continue for long to exist sanely under conditions of absolute reality.'] },
  { name: 'Stephen King', genres: ['horror'], psychotype: { e: 0.50, n: 0.70, t: 0.55, j: 0.50 },
    samplePhrases: ['The man in black fled across the desert, and the gunslinger followed.', 'Time is the only currency.'] },
  { name: 'M.R. James', genres: ['horror'], psychotype: { e: 0.30, n: 0.70, t: 0.60, j: 0.65 },
    samplePhrases: ['St Bertrand de Comminges is a decayed town on the spurs of the Pyrenees.', 'The tale is not for telling after dark.'] },
  // Romance
  { name: 'Jane Austen', genres: ['romance'], psychotype: { e: 0.40, n: 0.55, t: 0.35, j: 0.80 },
    samplePhrases: ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', 'I declare after all there is no enjoyment like reading.'] },
  { name: 'Charlotte Brontë', genres: ['romance'], psychotype: { e: 0.30, n: 0.65, t: 0.45, j: 0.70 },
    samplePhrases: ['There was no possibility of taking a walk that day.', 'I am no bird, and no net ensnares me.'] },
  { name: 'Emily Brontë', genres: ['romance'], psychotype: { e: 0.25, n: 0.80, t: 0.40, j: 0.55 },
    samplePhrases: ['1801. I have just returned from a visit to my landlord, the solitary neighbour that I shall be troubled with.', 'He is more myself than I am.'] },
  { name: 'Daphne du Maurier', genres: ['romance'], psychotype: { e: 0.30, n: 0.70, t: 0.45, j: 0.60 },
    samplePhrases: ['Last night I dreamt I went to Manderley again.', 'Happiness is not a possession to be prized, it is a quality of thought.'] },
  // Adventure / classics
  { name: 'Alexandre Dumas', genres: ['adventure'], psychotype: { e: 0.60, n: 0.50, t: 0.55, j: 0.55 },
    samplePhrases: ['On the first Monday of the month of April, 1625, the market town of Meung.', 'All for one, and one for all.'] },
  { name: 'Robert Louis Stevenson', genres: ['adventure'], psychotype: { e: 0.45, n: 0.55, t: 0.60, j: 0.65 },
    samplePhrases: ['Mr. Utterson the lawyer was a man of a rugged countenance that was never lighted by a smile.', 'Fifteen men on the dead man\'s chest.'] },
  { name: 'Herman Melville', genres: ['adventure'], psychotype: { e: 0.50, n: 0.70, t: 0.60, j: 0.50 },
    samplePhrases: ['Call me Ishmael.', 'It is not down on any map; true places never are.'] },
  { name: 'Jack London', genres: ['adventure'], psychotype: { e: 0.70, n: 0.45, t: 0.60, j: 0.50 },
    samplePhrases: ['Buck did not read the newspapers, or he would have known that trouble was brewing.', 'The proper function of man is to live, not to exist.'] },
  { name: 'Mark Twain', genres: ['adventure'], psychotype: { e: 0.65, n: 0.55, t: 0.45, j: 0.45 },
    samplePhrases: ['You don\'t know about me without you have read a book by the name of The Adventures of Tom Sawyer.', 'The report of my death was an exaggeration.'] },
  { name: 'Charles Dickens', genres: ['adventure'], psychotype: { e: 0.50, n: 0.60, t: 0.50, j: 0.60 },
    samplePhrases: ['It was the best of times, it was the worst of times.', 'No one is useless in this world who lightens the burdens of another.'] },
  { name: 'Joseph Conrad', genres: ['adventure'], psychotype: { e: 0.40, n: 0.70, t: 0.60, j: 0.55 },
    samplePhrases: ['The Nellie, a cruising yawl, swung to her anchor without a flutter of the sails.', 'The horror! The horror!'] },
  { name: 'Ernest Hemingway', genres: ['adventure'], psychotype: { e: 0.50, n: 0.40, t: 0.60, j: 0.45 },
    samplePhrases: ['He was an old man who fished alone in a skiff in the Gulf Stream and he had gone eighty-four days now without taking a fish.', 'The world breaks everyone, and afterward many are strong at the broken places.'] },
  { name: 'F. Scott Fitzgerald', genres: ['adventure'], psychotype: { e: 0.50, n: 0.60, t: 0.50, j: 0.50 },
    samplePhrases: ['In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since.', 'So we beat on, boats against the current, borne back ceaselessly into the past.'] },
  { name: 'Gabriel García Márquez', genres: ['adventure'], psychotype: { e: 0.45, n: 0.80, t: 0.50, j: 0.45 },
    samplePhrases: ['Many years later, as he faced the firing squad, Colonel Aureliano Buendía was to remember that distant afternoon when his father took him to discover ice.', 'No medicine cures what happiness cannot.'] },
  { name: 'Leo Tolstoy', genres: ['adventure'], psychotype: { e: 0.40, n: 0.60, t: 0.55, j: 0.65 },
    samplePhrases: ['All happy families are alike; each unhappy family is unhappy in its own way.', 'Everyone thinks of changing the world, but no one thinks of changing himself.'] },
  { name: 'Fyodor Dostoevsky', genres: ['adventure'], psychotype: { e: 0.30, n: 0.75, t: 0.65, j: 0.55 },
    samplePhrases: ['At the beginning of July, in the heat of the day, a young man walked out of his little room.', 'The mystery of human existence lies not in just staying alive, but in finding something to live for.'] },
  { name: 'Franz Kafka', genres: ['adventure'], psychotype: { e: 0.25, n: 0.80, t: 0.60, j: 0.50 },
    samplePhrases: ['As Gregor Samsa awoke one morning from uneasy dreams he found himself transformed in his bed into a gigantic insect.', 'A book must be the axe for the frozen sea within us.'] },
  { name: 'Victor Hugo', genres: ['adventure'], psychotype: { e: 0.45, n: 0.65, t: 0.50, j: 0.60 },
    samplePhrases: ['In 1815, M. Charles-François-Bienvenu Myriel was Bishop of Digne.', 'Even the darkest night will end and the sun will rise.'] },
  { name: 'George Orwell', genres: ['adventure', 'scifi'], psychotype: { e: 0.40, n: 0.60, t: 0.70, j: 0.60 },
    samplePhrases: ['It was a bright cold day in April, and the clocks were striking thirteen.', 'Big Brother is watching you.'] },
];

async function main(): Promise<void> {
  const llm = new LLMClient();
  const out: Array<Record<string, unknown>> = [];
  for (const a of SEED_AUTHORS) {
    const signature = a.samplePhrases.join(' ');
    const embedding = await llm.generateEmbedding(signature);
    if (embedding.length === 0) {
      throw new Error(`empty embedding for ${a.name} — embedding server unavailable (проверь EMBEDDING_ENDPOINT / WORLD_EMBEDDING_MODEL)`);
    }
    out.push({
      name: a.name,
      embedding,
      psychotype: {
        extraversion: { preference: a.psychotype.e, range: 0.1 },
        intuition: { preference: a.psychotype.n, range: 0.1 },
        thinking: { preference: a.psychotype.t, range: 0.1 },
        judging: { preference: a.psychotype.j, range: 0.1 },
        confidence: 1,
        axisConfidence: { extraversion: 0.8, intuition: 0.8, thinking: 0.8, judging: 0.8 },
        source: 'default',
      },
      samplePhrases: a.samplePhrases,
      genres: a.genres,
    });
  }
  if (out.length < 50) throw new Error(`expected >= 50 authors, got ${out.length}`);
  // Cross-entry dimension check: все embedding должны быть одной dim (иначе topNAuthors рассинхрон).
  const dim = (out[0]!.embedding as number[]).length;
  for (const o of out) {
    if ((o.embedding as number[]).length !== dim) {
      throw new Error(`dim mismatch for ${o.name}: ${(o.embedding as number[]).length} !== ${dim}`);
    }
  }
  await Bun.write('data/author-embeddings.json', JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} author embeddings (dim=${(out[0]!.embedding as number[]).length}) to data/author-embeddings.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run script to generate the corpus**

Run: `bun run scripts/build-author-embeddings.ts`
Expected: `Wrote 50 author embeddings (dim=<фактическая dim настроенной embedding-модели>) to data/author-embeddings.json`. Файл создан; при отсутствии embedding-сервера — nonzero exit с `embedding server unavailable`.

- [ ] **Step 3: Validate corpus shape**

Run: `bun -e "const c = JSON.parse(await Bun.file('data/author-embeddings.json').text()); if (c.length < 50) throw new Error('too few'); for (const a of c) { if (!a.name || !Array.isArray(a.embedding) || a.embedding.length === 0 || !Array.isArray(a.samplePhrases)) throw new Error('bad entry: ' + a.name); } console.log('OK', c.length, 'entries');"`
Expected: `OK 50 entries`

- [ ] **Step 4: Commit**

```bash
git add scripts/build-author-embeddings.ts data/author-embeddings.json
git commit -m "feat(profiler): author embeddings corpus (50 authors, BGE-M3) — Phase 4"
```

**Phase 4A DONE.** Переходи к `2026-08-14-jungian-profiler-p4b.md`.
