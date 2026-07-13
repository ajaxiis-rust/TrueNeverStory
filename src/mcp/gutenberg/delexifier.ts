// ─── Delexifier ──────────────────────────────────────────────────────────────
// Replaces proper nouns (names, places) with generic placeholders
// to create "style CSS" patterns that preserve structure without content.

export class Delexifier {
  // Common first names (English)
  private readonly FIRST_NAMES = new Set([
    'john', 'james', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
    'mary', 'patricia', 'jennifer', 'linda', 'barbara', 'elizabeth', 'susan', 'jessica', 'sarah', 'karen',
    'george', 'edward', 'henry', 'albert', 'arthur', 'fred', 'frank', 'walter', 'harold', 'arthur',
    'alice', 'helen', 'dorothy', 'margaret', 'ruth', 'virginia', 'anna', 'emma', 'florence', 'edith',
    'pierre', 'jean', 'louis', 'philippe', 'jacques', 'francois', 'antoine', 'nicolas', 'claude', 'andre',
    'marie', 'jeanne', 'colette', 'sylvie', 'isabelle', 'catherine', 'anne', 'sophie', 'helene', 'nathalie',
    'ivan', 'nikolai', 'alexander', 'dmitri', 'sergei', 'vladimir', 'boris', 'yuri', 'andrei', 'viktor',
    'natasha', 'olga', 'elena', 'tatiana', 'irina', 'nina', 'anna', 'marina', 'galina', 'lyudmila',
  ]);

  // Common last names (English)
  private readonly LAST_NAMES = new Set([
    'smith', 'johnson', 'williams', 'brown', 'jones', 'miller', 'davis', 'garcia', 'rodriguez', 'wilson',
    'martinez', 'anderson', 'taylor', 'thomas', 'hernandez', 'moore', 'martin', 'jackson', 'thompson', 'white',
    'lopez', 'lee', 'gonzalez', 'harris', 'clark', 'lewis', 'robinson', 'walker', 'perez', 'hall',
    'green', 'adams', 'baker', 'nelson', 'hill', 'ramirez', 'campbell', 'mitchell', 'roberts', 'carter',
    'scott', 'turner', 'phillips', 'parker', 'evans', 'edwards', 'collins', 'stewart', 'sanchez', 'morris',
    'dubois', 'moreau', 'laurent', 'bernard', 'petit', 'durand', 'lambert', 'bonnet', 'francois', 'martin',
    'mueller', 'schmidt', 'schneider', 'fischer', 'weber', 'meyer', 'wagner', 'becker', 'hoffmann', 'schulz',
    'romano', 'rossi', 'russo', 'ferrari', 'esposito', 'bianchi', 'romano', 'colombo', 'ricci', 'marino',
    'ivanov', 'petrov', 'smirnov', 'kuznetsov', 'popov', 'vasiliev', 'sokolov', 'mikhailov', 'novikov', 'morozov',
  ]);

  // Common place name patterns
  private readonly PLACE_PATTERNS = [
    /\b(the\s+)?[A-Z][a-z]+(?:ville|ton|burg|berg|field|ford|wood|shire|stead|bury|mouth|port|haven|gate|bridge|mount|hill|lake|river|valley|forest|wood)\b/g,
    /\b[A-Z][a-z]+(?:ian|ese|ish|ic)\s+(?:City|Town|Village|Province|Region|Kingdom|Empire|Republic|State)\b/g,
  ];

  // Story-level placeholders
  private readonly CHARACTER_PLACEHOLDERS = [
    '[PROTAGONIST]',
    '[ANTAGONIST]',
    '[ALLY]',
    '[MENTOR]',
    '[RIVAL]',
    '[LOVE_INTEREST]',
    '[STRANGER]',
    '[ELDER]',
    '[CHILD]',
    '[GUARD]',
    '[MERCHANT]',
    '[NARRATOR]',
  ];

  private readonly PLACE_PLACEHOLDERS = [
    '[CITY]',
    '[TOWN]',
    '[VILLAGE]',
    '[FOREST]',
    '[MOUNTAIN]',
    '[CASTLE]',
    '[PALACE]',
    '[TOWER]',
    '[BRIDGE]',
    '[RIVER]',
    '[LAKE]',
    '[ROAD]',
    '[PATH]',
    '[ROOM]',
    '[HALL]',
    '[CHAMBER]',
    '[GARDEN]',
    '[MARKET]',
    '[TEMPLE]',
    '[CHURCH]',
  ];

  private charIndex = 0;
  private placeIndex = 0;
  private charMap = new Map<string, string>();
  private placeMap = new Map<string, string>();

  /**
   * Delexify a text passage.
   * Replaces proper nouns with generic placeholders.
   */
  delexify(text: string): string {
    this.charIndex = 0;
    this.placeIndex = 0;
    this.charMap.clear();
    this.placeMap.clear();

    let result = text;

    // Replace character names
    result = this.replaceCharacterNames(result);

    // Replace place names
    result = this.replacePlaceNames(result);

    // Replace quoted dialogue (keep structure, remove content)
    result = result.replace(/"[^"]*"/g, '"[DIALOGUE]"');

    // Replace apostrophe-quoted dialogue
    result = result.replace(/'[^']*'/g, "'[DIALOGUE]'");

    return result;
  }

  private replaceCharacterNames(text: string): string {
    // Match capitalized words that look like names
    const namePattern = /\b([A-Z][a-z]{2,15})\b/g;
    let match;

    while ((match = namePattern.exec(text)) !== null) {
      const name = match[1]!.toLowerCase();

      // Check if it's a known name
      if (this.FIRST_NAMES.has(name) || this.LAST_NAMES.has(name)) {
        if (!this.charMap.has(name)) {
          const placeholder = this.CHARACTER_PLACEHOLDERS[this.charIndex % this.CHARACTER_PLACEHOLDERS.length]!;
          this.charMap.set(name, placeholder);
          this.charIndex++;
        }

        // Replace in text (case-insensitive)
        const regex = new RegExp(`\\b${match[1]}\\b`, 'g');
        text = text.replace(regex, this.charMap.get(name)!);
      }
    }

    return text;
  }

  private replacePlaceNames(text: string): string {
    // Replace common place patterns
    for (const pattern of this.PLACE_PATTERNS) {
      text = text.replace(pattern, (match) => {
        const key = match.toLowerCase();
        if (!this.placeMap.has(key)) {
          const placeholder = this.PLACE_PLACEHOLDERS[this.placeIndex % this.PLACE_PLACEHOLDERS.length]!;
          this.placeMap.set(key, placeholder);
          this.placeIndex++;
        }
        return this.placeMap.get(key)!;
      });
    }

    // Replace remaining capitalized words (likely places)
    const placePattern = /\b([A-Z][a-z]{3,15})\b/g;
    let match;

    while ((match = placePattern.exec(text)) !== null) {
      const name = match[1]!.toLowerCase();

      // Skip common words
      if (this.isCommonWord(name)) continue;

      // If not already a character, treat as place
      if (!this.charMap.has(name) && !this.placeMap.has(name)) {
        const placeholder = this.PLACE_PLACEHOLDERS[this.placeIndex % this.PLACE_PLACEHOLDERS.length]!;
        this.placeMap.set(name, placeholder);
        this.placeIndex++;
      }

      if (this.placeMap.has(name)) {
        const regex = new RegExp(`\\b${match[1]}\\b`, 'g');
        text = text.replace(regex, this.placeMap.get(name)!);
      }
    }

    return text;
  }

  private isCommonWord(word: string): boolean {
    const common = new Set([
      'the', 'and', 'but', 'for', 'not', 'you', 'all', 'can', 'had', 'her',
      'was', 'one', 'our', 'out', 'are', 'has', 'his', 'how', 'its', 'may',
      'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say',
      'she', 'too', 'use', 'man', 'big', 'end', 'far', 'low', 'set', 'run',
      'put', 'try', 'ask', 'men', 'own', 'say', 'she', 'two', 'way', 'who',
      'boy', 'did', 'got', 'job', 'key', 'lot', 'few', 'yes', 'yet', 'age',
      'ago', 'air', 'arm', 'art', 'bad', 'bag', 'bed', 'bit', 'box', 'bus',
      'car', 'cut', 'dog', 'dry', 'ear', 'eat', 'eye', 'fit', 'fly', 'fun',
      'gap', 'god', 'gun', 'hat', 'hit', 'hot', 'ice', 'ill', 'ink', 'joy',
      'kid', 'lay', 'led', 'leg', 'lie', 'lit', 'log', 'map', 'mix', 'mud',
      'net', 'nor', 'odd', 'oil', 'pay', 'pin', 'pit', 'pot', 'rap', 'raw',
      'red', 'row', 'sad', 'sat', 'saw', 'sir', 'sit', 'six', 'ski', 'son',
      'sun', 'tan', 'tea', 'ten', 'tie', 'tip', 'top', 'toy', 'van', 'war',
      'wet', 'win', 'won', 'yes', 'yet', 'you', 'act', 'add', 'ago', 'aid',
      'aim', 'allow', 'apply', 'area', 'army', 'away', 'baby', 'back', 'ball',
      'bank', 'base', 'beat', 'bed', 'bell', 'best', 'bird', 'bit', 'blow',
      'blue', 'board', 'boat', 'bone', 'book', 'born', 'boss', 'both', 'bowl',
      'build', 'burn', 'busy', 'cake', 'call', 'calm', 'came', 'camp', 'card',
      'care', 'case', 'cash', 'cast', 'cell', 'chat', 'chip', 'city', 'claim',
      'class', 'clean', 'clear', 'climb', 'clock', 'close', 'cloud', 'club',
      'coach', 'coat', 'code', 'cold', 'come', 'cook', 'cool', 'cope', 'copy',
      'core', 'cost', 'crew', 'crop', 'crowd', 'cup', 'dance', 'deal', 'deep',
      'desk', 'dinner', 'direct', 'disc', 'dish', 'doctor', 'document', 'dog',
      'double', 'draw', 'drive', 'dust', 'duty', 'east', 'edge', 'else', 'enter',
      'error', 'event', 'every', 'except', 'fact', 'fair', 'fall', 'fan', 'farm',
      'fast', 'fate', 'fear', 'feel', 'fill', 'film', 'final', 'find', 'fine',
      'fire', 'firm', 'fish', 'fix', 'flat', 'floor', 'flow', 'fold', 'food',
      'foot', 'form', 'forum', 'free', 'front', 'fruit', 'full', 'fund', 'future',
      'game', 'garden', 'gas', 'gate', 'gather', 'gave', 'gift', 'girl', 'give',
      'glass', 'go', 'goal', 'god', 'gold', 'gone', 'good', 'grab', 'gray',
      'great', 'green', 'ground', 'group', 'grow', 'guitar', 'gun', 'guy', 'hair',
      'half', 'hall', 'hand', 'hang', 'happen', 'hard', 'harm', 'hate', 'head',
      'hear', 'heart', 'heat', 'help', 'here', 'hero', 'hide', 'high', 'hill',
      'hire', 'hold', 'hole', 'hope', 'horse', 'hot', 'hotel', 'house', 'human',
      'humor', 'hurt', 'ice', 'idea', 'image', 'index', 'inner', 'input', 'issue',
      'item', 'jacket', 'job', 'join', 'joy', 'judge', 'jump', 'keen', 'keep',
      'key', 'kick', 'kill', 'kind', 'king', 'kitchen', 'knee', 'knew', 'knife',
      'knock', 'know', 'label', 'lack', 'lady', 'lake', 'land', 'language', 'last',
      'late', 'laugh', 'law', 'lawyer', 'lay', 'lead', 'leaf', 'learn', 'left',
      'leg', 'lend', 'lens', 'less', 'let', 'level', 'lie', 'life', 'lift', 'light',
      'like', 'limit', 'line', 'link', 'list', 'live', 'load', 'loan', 'lock',
      'log', 'lonely', 'long', 'look', 'lord', 'lose', 'loss', 'lost', 'love',
      'luck', 'mail', 'main', 'major', 'make', 'male', 'mall', 'manage', 'manner',
      'march', 'mark', 'mass', 'master', 'match', 'meal', 'mean', 'measure', 'meat',
      'media', 'medical', 'meet', 'menu', 'mere', 'mess', 'metal', 'might', 'mile',
      'milk', 'million', 'mind', 'mine', 'minute', 'miss', 'mistake', 'mix', 'model',
      'modern', 'moment', 'mood', 'moon', 'moral', 'motor', 'mount', 'mouse', 'mouth',
      'move', 'movie', 'mud', 'music', 'naked', 'name', 'narrow', 'nation', 'native',
      'nature', 'near', 'neck', 'need', 'news', 'next', 'nice', 'night', 'noble',
      'noise', 'normal', 'north', 'nose', 'note', 'nothing', 'novel', 'nurse', 'ocean',
      'offer', 'office', 'oil', 'okay', 'old', 'online', 'open', 'option', 'orange',
      'origin', 'output', 'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'palace',
      'palm', 'park', 'part', 'party', 'pass', 'past', 'path', 'patient', 'pattern',
      'pay', 'peace', 'pen', 'pencil', 'people', 'period', 'permit', 'person', 'pet',
      'phone', 'photo', 'piano', 'piece', 'pilot', 'pin', 'pink', 'pipe', 'pitch',
      'place', 'plain', 'plan', 'plane', 'plant', 'plate', 'play', 'please', 'plenty',
      'pocket', 'poem', 'poet', 'point', 'polar', 'police', 'policy', 'pool', 'poor',
      'popular', 'portion', 'pose', 'post', 'pound', 'power', 'press', 'price', 'pride',
      'prime', 'print', 'prior', 'prize', 'proof', 'proper', 'proud', 'prove', 'public',
      'pull', 'pure', 'purple', 'purpose', 'push', 'puzzle', 'queen', 'quest', 'quick',
      'quiet', 'quite', 'quote', 'race', 'radio', 'rain', 'raise', 'range', 'rapid',
      'rate', 'rather', 'reach', 'read', 'ready', 'realm', 'reason', 'record', 'refer',
      'region', 'relate', 'remain', 'remote', 'remove', 'rent', 'repeat', 'report',
      'require', 'rest', 'result', 'rice', 'rich', 'ride', 'ring', 'rise', 'risk',
      'road', 'rock', 'role', 'roll', 'roof', 'room', 'root', 'rope', 'rose', 'round',
      'row', 'rule', 'rush', 'safe', 'sail', 'sake', 'sale', 'salt', 'same', 'sand',
      'save', 'scene', 'score', 'screen', 'sea', 'search', 'season', 'seat', 'seek',
      'seem', 'self', 'sell', 'send', 'sense', 'serve', 'set', 'settle', 'seven',
      'sex', 'shade', 'shake', 'shall', 'shame', 'shape', 'share', 'sharp', 'shell',
      'shift', 'shine', 'ship', 'shirt', 'shock', 'shoe', 'shoot', 'shop', 'short',
      'shoulder', 'shout', 'shut', 'sick', 'side', 'sign', 'silk', 'silly', 'silver',
      'simple', 'sin', 'since', 'sing', 'sir', 'sister', 'sit', 'site', 'size', 'skill',
      'skin', 'sky', 'sleep', 'slide', 'slip', 'slow', 'small', 'smart', 'smell', 'smile',
      'smoke', 'snow', 'so', 'soccer', 'social', 'sock', 'soft', 'soil', 'soldier', 'solid',
      'solve', 'some', 'son', 'song', 'soon', 'sort', 'soul', 'sound', 'soup', 'source',
      'south', 'space', 'speak', 'speed', 'spend', 'spirit', 'split', 'sport', 'spot',
      'spread', 'spring', 'square', 'stable', 'star', 'start', 'state', 'station', 'stay',
      'steal', 'steel', 'step', 'stick', 'still', 'stock', 'stone', 'stop', 'store',
      'storm', 'story', 'stove', 'strategy', 'street', 'strike', 'strong', 'structure',
      'student', 'study', 'stuff', 'style', 'sugar', 'suggest', 'suit', 'summer', 'sun',
      'super', 'supply', 'sure', 'surface', 'surprise', 'sweet', 'swim', 'switch', 'symbol',
      'system', 'tale', 'talk', 'tank', 'tape', 'task', 'tax', 'tea', 'teach', 'team',
      'tear', 'tell', 'ten', 'tennis', 'term', 'test', 'text', 'than', 'thank', 'that',
      'theater', 'their', 'them', 'theme', 'then', 'theory', 'there', 'these', 'they',
      'thick', 'thin', 'thing', 'think', 'third', 'this', 'those', 'though', 'thought',
      'three', 'throat', 'through', 'throw', 'ticket', 'tie', 'tight', 'tiny', 'tire',
      'title', 'toe', 'together', 'tomorrow', 'tone', 'tongue', 'tonight', 'too', 'tool',
      'tooth', 'topic', 'total', 'tough', 'towel', 'tower', 'town', 'toy', 'track',
      'trade', 'trail', 'train', 'trait', 'trash', 'travel', 'treat', 'trend', 'trial',
      'tribe', 'trick', 'troop', 'truck', 'true', 'truly', 'trust', 'truth', 'try',
      'tube', 'tune', 'turn', 'twelve', 'twenty', 'twice', 'twin', 'type', 'uncle',
      'under', 'union', 'unit', 'unless', 'unlike', 'update', 'upon', 'upper', 'upset',
      'urban', 'usage', 'usual', 'valley', 'valid', 'value', 'variety', 'vast', 'very',
      'victim', 'view', 'village', 'violence', 'virus', 'visit', 'vital', 'vocal',
      'voice', 'volume', 'vote', 'wage', 'wait', 'wake', 'walk', 'wall', 'want',
      'war', 'warm', 'warn', 'wash', 'waste', 'watch', 'water', 'wave', 'way', 'weak',
      'wealth', 'weapon', 'wear', 'weather', 'web', 'week', 'weight', 'weird', 'well',
      'west', 'western', 'wet', 'what', 'wheel', 'where', 'whether', 'which', 'while',
      'white', 'whole', 'whom', 'whose', 'wide', 'wife', 'wild', 'will', 'win',
      'wind', 'window', 'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'within',
      'without', 'witness', 'woman', 'wonder', 'wood', 'word', 'work', 'worker', 'world',
      'worry', 'worse', 'worst', 'worth', 'would', 'wound', 'write', 'writer', 'wrong',
      'yard', 'yeah', 'year', 'yellow', 'yesterday', 'young', 'youth',
    ]);

    return common.has(word);
  }
}
