import { PlayerSession, AdventureEvent, Item } from '../types';

export class GameService {
  private sessions: Map<number, PlayerSession> = new Map();

  private adventureWeights: { event: AdventureEvent; weight: number }[] = [
    { event: 'CATCH_POKEMON', weight: 3 },
    { event: 'BATTLE_TRAINER', weight: 1 },
    { event: 'BUY_POTIONS', weight: 1 },
    { event: 'NOTHING', weight: 1 },
    { event: 'CATCH_TWO', weight: 1 },
    { event: 'VISIT_DAYCARE', weight: 1 },
    { event: 'TEAM_ROCKET', weight: 1 },
    { event: 'MYSTERIOUS_EGG', weight: 1 },
    { event: 'LEGENDARY', weight: 1 },
    { event: 'TRADE', weight: 1 },
    { event: 'FIND_ITEM', weight: 1 },
    { event: 'EXPLORE_CAVE', weight: 1 },
    { event: 'SNORLAX', weight: 1 },
    { event: 'MULTITASK', weight: 1 },
    { event: 'FISHING', weight: 1 },
    { event: 'FOSSIL', weight: 1 },
    { event: 'RIVAL', weight: 1 },
  ];

  getSession(userId: number): PlayerSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        userId,
        state: 'CHARACTER_SELECT',
        generation: 1,
        round: 0,
        team: [],
        storage: [],
        items: [{ id: 'potion', name: 'Potion', description: 'Retry a battle', count: 1 }],
        badges: 0,
        gymRetriesLeft: 0
      });
    }
    return this.sessions.get(userId)!;
  }

  resetSession(userId: number) {
    this.sessions.delete(userId);
    return this.getSession(userId);
  }

  spinAdventure(): AdventureEvent {
    const totalWeight = this.adventureWeights.reduce((acc, item) => acc + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of this.adventureWeights) {
      if (random < item.weight) return item.event;
      random -= item.weight;
    }
    return 'NOTHING';
  }

  calculateBattleVictory(session: PlayerSession): boolean {
    const teamPower = session.team.reduce((acc, p) => acc + p.power, 0);
    const yesWedges = 1 + teamPower; 
    const noWedges = session.round + 1;
    const totalWedges = yesWedges + noWedges;
    const roll = Math.random() * totalWedges;
    return roll < yesWedges;
  }

  usePotion(session: PlayerSession): boolean {
    const potion = session.items.find(i => i.id === 'potion');
    if (potion && potion.count > 0) {
      potion.count--;
      return true;
    }
    return false;
  }
}

export const gameService = new GameService();