import { Bot, Context, InlineKeyboard } from 'grammy';
import 'dotenv/config';
import { gameService } from './services/game.service';
import { pokemonService } from './services/pokemon.service';
import { PlayerSession } from './types';

const bot = new Bot(process.env.BOT_TOKEN || '');

// --- STARTER DATA (Gens 1-8) ---
const starters: Record<number, { name: string, id: number }[]> = {
  1: [{ name: 'Bulbasaur', id: 1 }, { name: 'Charmander', id: 4 }, { name: 'Squirtle', id: 7 }, { name: 'Pikachu', id: 25 }],
  2: [{ name: 'Chikorita', id: 152 }, { name: 'Cyndaquil', id: 155 }, { name: 'Totodile', id: 158 }],
  3: [{ name: 'Treecko', id: 252 }, { name: 'Torchic', id: 255 }, { name: 'Mudkip', id: 258 }],
  4: [{ name: 'Turtwig', id: 387 }, { name: 'Chimchar', id: 390 }, { name: 'Piplup', id: 393 }],
  5: [{ name: 'Snivy', id: 495 }, { name: 'Tepig', id: 498 }, { name: 'Oshawott', id: 501 }],
  6: [{ name: 'Chespin', id: 650 }, { name: 'Fennekin', id: 653 }, { name: 'Froakie', id: 656 }],
  7: [{ name: 'Rowlet', id: 722 }, { name: 'Litten', id: 725 }, { name: 'Popplio', id: 728 }],
  8: [{ name: 'Grookey', id: 810 }, { name: 'Scorbunny', id: 813 }, { name: 'Sobble', id: 816 }]
};

function getStatusText(s: PlayerSession): string {
  const teamList = s.team.map(p => `${p.shiny ? '✨' : ''}${p.name} (Pw:${p.power})`).join(', ') || 'None';
  return `
🆔 *ID Card*
👤 ${s.gender === 'male' ? 'Boy' : 'Girl'} | Gen: ${s.generation}
🏅 Badges: ${s.badges} | Round: ${s.round}/8
🎒 Items: ${s.items.map(i => `${i.name} x${i.count}`).join(', ') || 'Empty'}
👥 Team: ${teamList}
`;
}

// --- MAIN HANDLER ---

bot.command('start', async (ctx) => {
  const userId = ctx.from!.id;
  const s = gameService.resetSession(userId);
  
  // LOCKING: Append userId to the data
  await ctx.reply(`🎰 *Pokemon Roulette Started!* 
First up: Which Generation will you play?`, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('🎲 Spin Generation', `action_spin|${userId}`)
  });
});

bot.command('team', (ctx) => {
  const s = gameService.getSession(ctx.from!.id);
  ctx.reply(getStatusText(s), { parse_mode: 'Markdown' });
});

bot.on('callback_query:data', async (ctx) => {
  const clickerId = ctx.from.id;
  const rawData = ctx.callbackQuery.data;

  // LOCKING: Split action and ownerId
  const [action, ownerIdStr] = rawData.split('|');
  
  // If button has an owner and clicker isn't owner, block them
  if (ownerIdStr && ownerIdStr !== clickerId.toString()) {
    return ctx.answerCallbackQuery({
      text: "🚫 This is not your game session! Type /start to play.",
      show_alert: true
    });
  }

  const s = gameService.getSession(clickerId);

  // Filter valid actions
  if (action !== 'action_spin' && !action.startsWith('use_potion')) return;

  let text = '';
  let nextButtonText = '🎲 Spin Roulette';
  let nextButtonData = `action_spin|${clickerId}`; // Default next action

  // --- STATE MACHINE ---

  // 1. GEN ROULETTE
  if (s.state === 'GEN_ROULETTE') {
    s.generation = gameService.spinGen();
    s.state = 'GENDER_ROULETTE';
    text = `🌍 *Generation ${s.generation}* selected!\nNext: Are you a Boy or a Girl?`;
    nextButtonText = '🎲 Spin Gender';
  } 
  
  // 2. GENDER ROULETTE
  else if (s.state === 'GENDER_ROULETTE') {
    s.gender = gameService.spinGender();
    s.state = 'STARTER_ROULETTE';
    text = `👤 You are a *${s.gender === 'male' ? 'Boy' : 'Girl'}*!\nNext: Who will be your partner?`;
    nextButtonText = '🎲 Spin Starter';
  }

  // 3. STARTER ROULETTE
  else if (s.state === 'STARTER_ROULETTE') {
    const genStarters = starters[s.generation];
    const pick = genStarters[Math.floor(Math.random() * genStarters.length)];
    const isShiny = Math.random() < 0.02;
    
    const starterMon = await pokemonService.getPokemon(pick.id, isShiny);
    if (starterMon) {
      s.team.push(starterMon);
      text = `📦 You obtained *${starterMon.name}*!`;
      if (isShiny) text += `\n✨ *SHINY ALERT!* Your starter is Shiny! ✨`;
      
      s.state = 'START_ADVENTURE';
      text += `\n\n🤔 *What to do first?*`;
      nextButtonText = '🎲 Spin First Event';
    }
  }

  // 4. START ADVENTURE
  else if (s.state === 'START_ADVENTURE') {
    const event = gameService.spinStartAdventure();
    text = await handleAdventureEvent(s, event);
    
    s.state = 'GYM_BATTLE';
    text += `\n\n🏛️ *First Gym Battle* approaching!`;
    nextButtonText = '⚔️ Battle Gym Leader';
  }

  // 5. GYM BATTLE
  else if (s.state === 'GYM_BATTLE') {
    const won = gameService.calculateBattleVictory(s);
    if (won) {
      s.badges++;
      s.round++;
      text = `🎉 *VICTORY!* Badge #${s.badges} obtained!`;
      
      if (s.badges >= 8) {
        if (s.round > 8) { 
             s.state = 'VICTORY';
             text += `\n\n🏆 *CHAMPION!* You defeated everyone!`;
             nextButtonText = '🏁 Hall of Fame';
        } else {
             s.state = 'EVOLUTION'; 
             nextButtonText = '🧬 Spin Evolution';
        }
      } else {
        s.state = 'EVOLUTION'; 
        nextButtonText = '🧬 Spin Evolution';
      }
    } else {
      const hasPotion = gameService.usePotion(s);
      if (hasPotion) {
        text = `💥 *DEFEAT!* You used a Potion to revive your team. Try again?`;
        nextButtonText = '⚔️ Retry Battle';
        // Note: We keep action as action_spin, logic handles the retry
      } else {
        s.state = 'GAME_OVER';
        text = `☠️ *GAME OVER* You have no Potions left.`;
        nextButtonText = '🏁 See Final Team';
      }
    }
  }

  // 6. EVOLUTION
  else if (s.state === 'EVOLUTION') {
    const candidates = s.team.filter(p => pokemonService.canEvolve(p.id));
    
    if (candidates.length > 0) {
      const oldMon = candidates[Math.floor(Math.random() * candidates.length)];
      const newMon = await pokemonService.evolve(oldMon);
      
      if (newMon) {
        const index = s.team.indexOf(oldMon);
        s.team[index] = newMon;
        text = `🧬 *Evolution Time!* \nWhat? ${oldMon.name} is evolving... \n\n🎉 Congratulations! Your *${oldMon.name}* evolved into *${newMon.name}*! \n(New Power: ${newMon.power})`;
      } else {
        text = `🧬 ${oldMon.name} tried to evolve but failed!`;
      }
    } else {
      text = `🧬 You watched your team, but none of them can evolve right now.`;
    }
    s.state = 'ADVENTURE';
    nextButtonText = '🌲 Continue Adventure';
  }

  // 7. MAIN ADVENTURE LOOP
  else if (s.state === 'ADVENTURE') {
    const event = gameService.spinMainAdventure();
    text = await handleAdventureEvent(s, event);
    
    s.state = 'GYM_BATTLE';
    text += `\n\n🏛️ *Gym Battle #${s.badges + 1}* upcoming!`;
    nextButtonText = '⚔️ Battle Gym Leader';
  }

  // 8. END GAME SCREENS
  else if (s.state === 'GAME_OVER' || s.state === 'VICTORY') {
    const title = s.state === 'VICTORY' ? '🏆 HALL OF FAME 🏆' : '☠️ GAME OVER ☠️';
    text = `${title}\n\n${getStatusText(s)}\n\n/start to play again.`;
    await ctx.editMessageText(text, { parse_mode: 'Markdown' });
    return;
  }

  // Send Update with LOCKED button
  try {
    await ctx.editMessageText(text, { 
      parse_mode: 'Markdown', 
      reply_markup: new InlineKeyboard().text(nextButtonText, nextButtonData) 
    });
  } catch (e: any) {
    // Ignore "message is not modified" error
    if (e.description?.includes('message is not modified')) {
      // Do nothing
    } else {
      throw e; // Rethrow other errors
    }
  }
  await ctx.answerCallbackQuery();
});

// Helper for Adventure Logic
async function handleAdventureEvent(s: PlayerSession, event: string): Promise<string> {
  let text = `🎲 *Event:* ${event.replace(/_/g, ' ')}\n`;

  switch (event) {
    case 'CATCH_POKEMON':
    case 'CATCH_TWO':
    case 'EXPLORE_CAVE':
    case 'FISHING':
    case 'SNORLAX':
    case 'LEGENDARY':
    case 'VISIT_DAYCARE':
    case 'MYSTERIOUS_EGG':
      const count = event === 'CATCH_TWO' ? 2 : 1;
      for(let i=0; i<count; i++) {
        const isLegend = event === 'LEGENDARY';
        let newMon = await pokemonService.getRandomPokemon(s.generation);
        
        const isShiny = Math.random() < 0.01;
        if (newMon) {
            newMon.shiny = isShiny;
            if (isLegend) newMon.power = 5; 
            
            if (s.team.length < 6) {
              s.team.push(newMon);
              text += `✅ Caught *${newMon.name}*! ${isShiny ? '✨' : ''}\n`;
            } else {
              s.storage.push(newMon);
              text += `📦 Caught *${newMon.name}* (Sent to PC)\n`;
            }
        }
      }
      break;

    case 'BUY_POTIONS':
    case 'FIND_ITEM':
    case 'MULTITASK':
    case 'FOSSIL':
      const amount = event === 'MULTITASK' ? 2 : 1;
      const pot = s.items.find(i => i.id === 'potion');
      if (pot) pot.count += amount;
      text += `🧪 Found ${amount} Potion(s)!`;
      break;

    case 'BATTLE_TRAINER':
    case 'RIVAL':
    case 'TEAM_ROCKET':
      if (Math.random() > 0.5) {
        text += `⚔️ Won the battle! +1 Potion.`;
        const p = s.items.find(i => i.id === 'potion');
        if (p) p.count++;
      } else {
        text += `😵 Lost the battle (Fled).`;
      }
      break;
      
    case 'TRADE':
      if (s.team.length > 0) {
        const tradeIn = await pokemonService.getRandomPokemon(s.generation);
        const idx = Math.floor(Math.random() * s.team.length);
        const out = s.team[idx];
        if (tradeIn) {
            s.team[idx] = tradeIn;
            text += `🔄 Traded *${out.name}* for *${tradeIn.name}*!`;
        }
      } else {
        text += `(No Pokemon to trade)`;
      }
      break;

    default:
      text += `(Nothing happened)`;
  }
  return text;
}

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof Error) {
    console.error("Error in middleware:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.start();
