// Client -> Server events
export const CLIENT_EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_READY: 'room:ready',
  BUILD_SUBMIT_PART: 'build:submit_part',
  REVEAL_ACCEPT: 'reveal:accept',
  BATTLE_PLAY_CARD: 'battle:play_card',
  BATTLE_END_TURN: 'battle:end_turn',
} as const;

// Server -> Client events
export const SERVER_EVENTS = {
  ROOM_STATE: 'room:state',
  ROOM_PHASE_CHANGE: 'room:phase_change',
  ROOM_ERROR: 'room:error',
  REVEAL_CHIMERA: 'reveal:chimera',
  BATTLE_STATE: 'battle:state',
  BATTLE_CARD_PLAYED: 'battle:card_played',
  BATTLE_TURN_CHANGE: 'battle:turn_change',
  BATTLE_EFFECT: 'battle:effect',
  BATTLE_RESULT: 'battle:result',
} as const;
