export type GameState = 
  | 'CHARACTER_SELECT'
  | 'STARTER_SELECT'
  | 'ADVENTURE'
  | 'GYM_BATTLE'
  | 'GAME_OVER'
  | 'VICTORY';

export interface Pokemon {
  id: number;
  name: string;
  power: number; // calculated dynamically
  shiny: boolean;
  baseStatsTotal: number;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  count: number;
}

export interface PlayerSession {
  userId: number;
  state: GameState;
  generation: number;
  round: number; // 0 to 8 (Gyms) + Elite Four
  team: Pokemon[];
  storage: Pokemon[];
  items: Item[];
  badges: number;
  gymRetriesLeft: number; 
}

export type AdventureEvent = 
  | 'CATCH_POKEMON' 
  | 'BATTLE_TRAINER' 
  | 'BUY_POTIONS' 
  | 'NOTHING' 
  | 'CATCH_TWO' 
  | 'VISIT_DAYCARE' 
  | 'TEAM_ROCKET' 
  | 'MYSTERIOUS_EGG' 
  | 'LEGENDARY' 
  | 'TRADE' 
  | 'FIND_ITEM' 
  | 'EXPLORE_CAVE' 
  | 'SNORLAX' 
  | 'MULTITASK' 
  | 'FISHING' 
  | 'FOSSIL' 
  | 'RIVAL';