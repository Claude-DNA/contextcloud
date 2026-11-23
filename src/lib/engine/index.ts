/** Character State Engine — public entry points. Spec: "Character State Engine: Spec v2.1". */
export * from './types';
export { simulate, K, FLAG_CODES } from './simulate';
export { buildStory, readBeat, readDeed, readEvent, readEffect, readSettings, type EngineItem } from './story';
export { newIdentity, readIdentity, readInstance, readAgenda, temperatureOf, persistenceOf } from './identity';
export { REFERENCE_CHARACTERS, blendReferences, findReference, type ReferenceCharacter } from './references';
export { FEELINGS, FEELING, CARRIED, PASSING, DISPLAY_AS } from './feelings';
export { distance, moralScore, cosine } from './math';
