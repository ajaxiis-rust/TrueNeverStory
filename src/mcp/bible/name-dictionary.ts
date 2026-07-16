import type { NameDictionaryEntry } from './types';

export const NAME_DICTIONARY: NameDictionaryEntry[] = [
  // OT Patriarchs
  { canonical: 'adam', variants: { en: ['Adam'], ru: ['Адам'] }, significance: 'patriarch', testament: 'OT', description: 'First man, created by God' },
  { canonical: 'noah', variants: { en: ['Noah', 'Noe'], ru: ['Ной'] }, significance: 'patriarch', testament: 'OT', description: 'Builder of the Ark' },
  { canonical: 'abraham', variants: { en: ['Abraham', 'Abram'], ru: ['Авраам'] }, significance: 'patriarch', testament: 'OT', description: 'Father of many nations' },
  { canonical: 'isaac', variants: { en: ['Isaac'], ru: ['Исаак'] }, significance: 'patriarch', testament: 'OT', description: 'Son of Abraham, father of Jacob' },
  { canonical: 'jacob', variants: { en: ['Jacob', 'Israel'], ru: ['Иаков', 'Израиль'] }, significance: 'patriarch', testament: 'OT', description: 'Son of Isaac, father of 12 tribes' },
  { canonical: 'joseph', variants: { en: ['Joseph'], ru: ['Иосиф'] }, significance: 'patriarch', testament: 'OT', description: 'Son of Jacob, ruler of Egypt' },
  { canonical: 'moses', variants: { en: ['Moses'], ru: ['Моисей'] }, significance: 'prophet', testament: 'OT', description: 'Lawgiver, led Exodus from Egypt' },
  { canonical: 'aaron', variants: { en: ['Aaron'], ru: ['Аарон'] }, significance: 'prophet', testament: 'OT', description: 'Brother of Moses, first High Priest' },
  // OT Leaders
  { canonical: 'joshua', variants: { en: ['Joshua'], ru: ['Иисус Навин'] }, significance: 'prophet', testament: 'OT', description: 'Successor of Moses' },
  { canonical: 'samuel', variants: { en: ['Samuel'], ru: ['Самуил'] }, significance: 'prophet', testament: 'OT', description: 'Last judge, anointed Saul and David' },
  { canonical: 'saul', variants: { en: ['Saul'], ru: ['Саул'] }, significance: 'king', testament: 'OT', description: 'First king of Israel' },
  { canonical: 'david', variants: { en: ['David'], ru: ['Давид'] }, significance: 'king', testament: 'OT', description: 'King of Israel, psalmist' },
  { canonical: 'solomon', variants: { en: ['Solomon'], ru: ['Соломон'] }, significance: 'king', testament: 'OT', description: 'Son of David, builder of the Temple' },
  // OT Prophets
  { canonical: 'elijah', variants: { en: ['Elijah', 'Elias'], ru: ['Илья', 'Илия'], he: ['אֵלִיָּהוּ'], el: ['Ἠλίας'] }, significance: 'prophet', testament: 'OT', description: 'Prophet who called down fire from heaven' },
  { canonical: 'elisha', variants: { en: ['Elisha'], ru: ['Елисей'] }, significance: 'prophet', testament: 'OT', description: 'Successor of Elijah' },
  { canonical: 'isaiah', variants: { en: ['Isaiah'], ru: ['Исаия'] }, significance: 'prophet', testament: 'OT', description: 'Major prophet, messianic prophecies' },
  { canonical: 'jeremiah', variants: { en: ['Jeremiah'], ru: ['Иеремия'] }, significance: 'prophet', testament: 'OT', description: 'Weeping prophet' },
  { canonical: 'daniel', variants: { en: ['Daniel'], ru: ['Даниил'] }, significance: 'prophet', testament: 'OT', description: 'Prophet in Babylon, visions of empires' },
  { canonical: 'jonah', variants: { en: ['Jonah'], ru: ['Иона'] }, significance: 'prophet', testament: 'OT', description: 'Prophet swallowed by great fish' },
  { canonical: 'job', variants: { en: ['Job'], ru: ['Иов'] }, significance: 'minor', testament: 'OT', description: 'Man who endured great suffering' },
  // NT Key Figures
  { canonical: 'jesus', variants: { en: ['Jesus', 'Christ'], ru: ['Иисус', 'Христос'], el: ['Ἰησοῦς'] }, significance: 'prophet', testament: 'NT', description: 'Son of God, Messiah, Savior' },
  { canonical: 'mary', variants: { en: ['Mary'], ru: ['Мария'] }, significance: 'minor', testament: 'NT', description: 'Mother of Jesus' },
  { canonical: 'mary_magdalene', variants: { en: ['Mary Magdalene'], ru: ['Мария Магдалина'] }, significance: 'minor', testament: 'NT', description: 'Follower of Jesus, first witness of resurrection' },
  { canonical: 'peter', variants: { en: ['Peter', 'Simon Peter', 'Cephas'], ru: ['Пётр', 'Петр'] }, significance: 'apostle', testament: 'NT', description: 'Leader of the apostles' },
  { canonical: 'paul', variants: { en: ['Paul'], ru: ['Павел'] }, significance: 'apostle', testament: 'NT', description: 'Apostle to the Gentiles' },
  { canonical: 'john', variants: { en: ['John'], ru: ['Иоанн'] }, significance: 'apostle', testament: 'NT', description: 'Beloved disciple' },
  { canonical: 'john_the_baptist', variants: { en: ['John the Baptist'], ru: ['Иоанн Креститель'] }, significance: 'prophet', testament: 'NT', description: 'Forerunner of Jesus' },
  { canonical: 'james', variants: { en: ['James'], ru: ['Иаков'] }, significance: 'apostle', testament: 'NT', description: 'Son of Zebedee, brother of John' },
  { canonical: 'philip', variants: { en: ['Philip'], ru: ['Филипп'] }, significance: 'apostle', testament: 'NT', description: 'Apostle, brought Nathanael to Jesus' },
  { canonical: 'thomas', variants: { en: ['Thomas', 'Didymus'], ru: ['Фома'] }, significance: 'apostle', testament: 'NT', description: 'Doubting apostle' },
  { canonical: 'andrew', variants: { en: ['Andrew'], ru: ['Андрей'] }, significance: 'apostle', testament: 'NT', description: 'Brother of Peter' },
  { canonical: 'barnabas', variants: { en: ['Barnabas'], ru: ['Варнава'] }, significance: 'apostle', testament: 'NT', description: 'Companion of Paul' },
  { canonical: 'timothy', variants: { en: ['Timothy'], ru: ['Тимофей'] }, significance: 'minor', testament: 'NT', description: 'Recipient of Pauline epistles' },
  { canonical: 'luke', variants: { en: ['Luke'], ru: ['Лука'] }, significance: 'apostle', testament: 'NT', description: 'Author of Gospel of Luke' },
  { canonical: 'mark', variants: { en: ['Mark'], ru: ['Марк'] }, significance: 'apostle', testament: 'NT', description: 'Author of Gospel of Mark' },
  { canonical: 'matthew', variants: { en: ['Matthew', 'Levi'], ru: ['Матфей'] }, significance: 'apostle', testament: 'NT', description: 'Author of Gospel of Matthew' },
  // Key Historical Figures
  { canonical: 'caesar_augustus', variants: { en: ['Augustus'], ru: ['Август'] }, significance: 'king', testament: 'NT', description: 'Roman emperor at time of Jesus birth' },
  { canonical: 'pontius_pilate', variants: { en: ['Pilate', 'Pontius Pilate'], ru: ['Пилат'] }, significance: 'minor', testament: 'NT', description: 'Roman governor who sentenced Jesus' },
  { canonical: 'herod', variants: { en: ['Herod'], ru: ['Ирод'] }, significance: 'king', testament: 'NT', description: 'King of Judea' },
  { canonical: 'herod_antipas', variants: { en: ['Herod Antipas'], ru: ['Ирод Антипа'] }, significance: 'king', testament: 'NT', description: 'Tetrarch who executed John the Baptist' },
  { canonical: 'pharaoh', variants: { en: ['Pharaoh'], ru: ['Фараон'] }, significance: 'king', testament: 'OT', description: 'Egyptian ruler (generic title)' },
  { canonical: 'nebuchadnezzar', variants: { en: ['Nebuchadnezzar'], ru: ['Навуходоносор'] }, significance: 'king', testament: 'OT', description: 'King of Babylon, destroyed Temple' },
  { canonical: 'cyrus', variants: { en: ['Cyrus'], ru: ['Кир'] }, significance: 'king', testament: 'OT', description: 'Persian king who allowed Jews to return' },
];

const EN_MAP = new Map<string, string>();
const RU_MAP = new Map<string, string>();
const ALL_VARIANTS = new Map<string, NameDictionaryEntry>();

for (const entry of NAME_DICTIONARY) {
  ALL_VARIANTS.set(entry.canonical, entry);
  for (const en of entry.variants.en) {
    EN_MAP.set(en.toLowerCase(), entry.canonical);
  }
  for (const ru of entry.variants.ru) {
    RU_MAP.set(ru.toLowerCase(), entry.canonical);
  }
}

export function lookupName(name: string): string | null {
  const lower = name.toLowerCase();
  return EN_MAP.get(lower) ?? RU_MAP.get(lower) ?? null;
}

export function getDictionary(): NameDictionaryEntry[] {
  return NAME_DICTIONARY;
}

export function getEntry(canonical: string): NameDictionaryEntry | undefined {
  return ALL_VARIANTS.get(canonical);
}
