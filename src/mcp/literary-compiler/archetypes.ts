export const ARCHETYPES = [
  'escape_liberation',
  'judgment_trial',
  'loyalty',
  'betrayal',
  'inheritance_return',
  'endurance_suffering',
  'rescue',
  'rise_fall_rise',
  'wisdom_counsel',
  'political_intrigue',
  'quest_journey',
  'temptation_fall',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export const EVERYDAY_LIFE = 'everyday_life' as const;

export const ARCHETYPE_KEYWORDS: Record<Archetype, string[]> = {
  escape_liberation: [
    'escape', 'flee', 'cross', 'sea', 'river', 'pass through',
    'deliver', 'rescue', 'free', 'liberate', 'bondage', 'slavery', 'chains',
    'break', 'exodus', 'wilderness', 'wandering',
  ],
  judgment_trial: [
    'judge', 'judgment', 'decide', 'dispute', 'claim', 'truth', 'verdict',
    'trial', 'court', 'testimony', 'witness', 'accuse', 'defend', 'sentence',
  ],
  loyalty: [
    'loyal', 'follow', 'faithful', 'devoted', 'stick', 'remain', 'serve',
    'steadfast', 'covenant', 'oath', 'promise', 'dedication', 'commit',
  ],
  betrayal: [
    'betray', 'deny', 'abandon', 'forsake', 'deceive', 'lie', 'treachery',
    'sell', 'sell out', 'turn against', 'backstab', 'disloyal',
  ],
  inheritance_return: [
    'inherit', 'son', 'daughter', 'father', 'estate', 'portion', 'return',
    'birthright', 'primogeniture', 'legacy', 'heir', 'lineage', 'descend',
  ],
  endurance_suffering: [
    'suffer', 'endure', 'patience', 'trial', 'test', 'loss', 'grief',
    'persecution', 'oppression', 'affliction', 'persevere', 'tribulation',
  ],
  rescue: [
    'save', 'deliver', 'oppressed', 'enemy', 'battle', 'war', 'victory',
    'redeem', 'restore', 'champion', 'defend', 'shield', 'protect',
  ],
  rise_fall_rise: [
    'rise', 'fall', 'exalt', 'humble', 'power', 'servant',
    'promote', 'demote', 'elevate', 'cast down', 'throne', 'pit',
  ],
  wisdom_counsel: [
    'wisdom', 'wise', 'counsel', 'advice', 'proverb', 'teach', 'learn',
    'understand', 'insight', 'discernment', 'parable', 'instruction',
  ],
  political_intrigue: [
    'king', 'queen', 'throne', 'power', 'plot', 'secret', 'decree',
    'scheme', 'coup', 'conspiracy', 'cabinet', 'council', 'faction',
  ],
  quest_journey: [
    'journey', 'quest', 'travel', 'pilgrimage', 'road', 'path', 'seek',
    'search', 'find', 'wander', 'explore', 'expedition', 'adventure',
  ],
  temptation_fall: [
    'tempt', 'sin', 'desire', 'seduce', 'corrupt', 'forbidden', 'fall',
    'disobey', 'rebel', 'idol', 'covet', 'lust', 'transgress',
  ],
};

export const ARCHETYPE_VARIABLES: Record<Archetype, string[]> = {
  escape_liberation: [
    'current_leader', 'followers', 'current_tyrant', 'obstacle', 'intervention',
  ],
  judgment_trial: [
    'claimant_A', 'claimant_B', 'object', 'judge', 'hidden_truth',
  ],
  loyalty: [
    'current_hero', 'mentor', 'hardship', 'reward',
  ],
  betrayal: [
    'current_hero', 'betrayer', 'trust', 'consequence', 'aftermath',
  ],
  inheritance_return: [
    'current_hero', 'mentor', 'share', 'wealth', 'legacy',
  ],
  endurance_suffering: [
    'current_hero', 'trial', 'loss', 'choice', 'comfort',
  ],
  rescue: [
    'current_hero', 'nation', 'oppressor', 'allies',
  ],
  rise_fall_rise: [
    'current_hero', 'mentor', 'rivals', 'power', 'restoration',
  ],
  wisdom_counsel: [
    'current_hero', 'dilemma', 'mentor', 'lesson', 'path',
  ],
  political_intrigue: [
    'current_hero', 'plot', 'ally', 'enemy', 'scheme',
  ],
  quest_journey: [
    'current_hero', 'destination', 'companions', 'obstacle', 'treasure',
  ],
  temptation_fall: [
    'current_hero', 'tempter', 'desire', 'cost', 'redemption',
  ],
};

export const ARCHETYPE_POSITIONS: Record<Archetype, string[]> = {
  escape_liberation: ['leader', 'follower', 'savior'],
  judgment_trial: ['judge', 'leader', 'witness'],
  loyalty: ['follower', 'mentor'],
  betrayal: ['follower', 'betrayer'],
  inheritance_return: ['leader', 'follower', 'heir'],
  endurance_suffering: ['follower'],
  rescue: ['leader', 'savior'],
  rise_fall_rise: ['leader', 'tyrant', 'follower'],
  wisdom_counsel: ['follower', 'wise_one'],
  political_intrigue: ['leader', 'tyrant'],
  quest_journey: ['leader', 'follower', 'guide'],
  temptation_fall: ['follower', 'tempter'],
};

export function isValidArchetype(value: string): value is Archetype {
  return (ARCHETYPES as readonly string[]).includes(value) || value === EVERYDAY_LIFE;
}
