import { Bot, Context, session, InlineKeyboard } from 'grammy';
import 'dotenv/config';
import { gameService } from './services/game.service';
import { pokemonService } from './services/pokemon.service';
import { PlayerSession } from './types';

const bot = new Bot(process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN');

function getStatusText(s: PlayerSession): string {
  const teamText = s.team.map(p => `${p.shiny ? '✨' : ''}${p.name} (Pw:${p.power})`).join(', ') || 'Empty';
  return `
👤 *Trainer Info*
badges: ${s.badges} 🏅
Round: ${s.round} / 8
🎒 Items: ${s.items.map(i => `${i.name} x${i.count}`).join(', ')}
👥 Team: ${teamText}
  `;
}

bot.command('start', async (ctx) => {
  const s = gameService.resetSession(ctx.from!.id);
  const keyboard = new InlineKeyboard()
    .text('Gen 1 (Kanto)', 'gen_1').text('Gen 2 (Johto)', 'gen_2').row()
    .text('Gen 3 (Hoenn)', 'gen_3').text('Gen 4 (Sinnoh)', 'gen_4').row()
    .text('Gen 5 (Unova)', 'gen_5').text('Gen 6 (Kalos)', 'gen_6');

  await ctx.reply('Welcome to *Pokemon Roulette*! 🎰\nPick your generation to start:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

bot.command('team', (ctx) => {
  const s = gameService.getSession(ctx.from!.id);
  ctx.reply(getStatusText(s), { parse_mode: 'Markdown' });
});

bot.on('callback_query:data', async (ctx) => {
  const userId = ctx.from.id;
  const s = gameService.getSession(userId);
  const data = ctx.callbackQuery.data;

  // 1. Generation Selection
  if (data.startsWith('gen_')) {
    s.generation = parseInt(data.split('_')[1]);
    s.state = 'STARTER_SELECT';
    const p1 = await pokemonService.getRandomPokemon(s.generation);
    s.team.push(p1!); 
    s.state = 'ADVENTURE';
    
    await ctx.editMessageText(`You chose Gen ${s.generation}! \nYour starter is: *${p1?.name}* (Power: ${p1?.power})`, { parse_mode: 'Markdown' });
    await showAdventureMenu(ctx, s);
  }

  // 2. Adventure Spin (The Main Logic)
  else if (data === 'spin_adventure') {
    const event = gameService.spinAdventure();
    let text = `🎲 *Roulette Result:* ${event.replace(/_/g, ' ')}\n\n`;
    
    switch (event) {
      case 'CATCH_POKEMON':
      case 'EXPLORE_CAVE':
      case 'FISHING':
      case 'SNORLAX':
        const newMon = await pokemonService.getRandomPokemon(s.generation);
        if (newMon) {
          if (s.team.length < 6) {
            s.team.push(newMon);
            text += `✅ You caught a *${newMon.name}*! (Power: ${newMon.power})`;
          } else {
            s.storage.push(newMon);
            text += `📦 You caught *${newMon.name}*! Sent to PC.`;
          }
        }
        break;

      case 'CATCH_TWO':
        const mon1 = await pokemonService.getRandomPokemon(s.generation);
        const mon2 = await pokemonService.getRandomPokemon(s.generation);
        if (mon1 && mon2) {
           s.team.length < 6 ? s.team.push(mon1) : s.storage.push(mon1);
           s.team.length < 6 ? s.team.push(mon2) : s.storage.push(mon2);
           text += `🔥 Lucky! You caught *${mon1.name}* AND *${mon2.name}*!`;
        }
        break;

      case 'BUY_POTIONS':
      case 'FIND_ITEM':
      case 'FOSSIL':
        const potion = s.items.find(i => i.id === 'potion');
        if (potion) potion.count++;
        text += `🧪 You found a Potion! (Total: ${potion?.count})`;
        break;

      case 'MULTITASK':
        // Simulating finding 2 items
        const pot = s.items.find(i => i.id === 'potion');
        if (pot) pot.count += 2;
        text += `🏃 You multitasked and found *2 Potions*!`;
        break;

      case 'BATTLE_TRAINER':
      case 'RIVAL':
      case 'TEAM_ROCKET':
        const wonBattle = Math.random() > 0.4; // 60% chance to win
        if (wonBattle) {
            text += `⚔️ You won the battle! You grabbed a Potion as spoils.`;
            const p = s.items.find(i => i.id === 'potion');
            if (p) p.count++;
        } else {
            text += `😵 You lost the battle and fled to the Center.`;
        }
        break;

      case 'LEGENDARY':
        // Simulating a hard catch (30% chance)
        const legend = await pokemonService.getRandomPokemon(s.generation); 
        // In real app, fetch specific legendary list. Here we assume random for now.
        if (legend) {
            // Force high power for "Legendary" feel if random one was weak
            if (legend.power < 4) legend.power = 5; 
            
            const caught = Math.random() > 0.7;
            if (caught) {
                 s.team.push(legend);
                 text += `✨✨ *LEGENDARY ENCOUNTER* ✨✨\nUnbelievable! You caught *${legend.name}*!`;
            } else {
                 text += `⚠️ A wild *${legend.name}* appeared but ran away!`;
            }
        }
        break;

      case 'VISIT_DAYCARE':
      case 'MYSTERIOUS_EGG':
        const eggMon = await pokemonService.getRandomPokemon(s.generation);
        if (eggMon) {
            text += `🥚 You received a Mysterious Egg... it hatched into *${eggMon.name}*!`;
            s.team.length < 6 ? s.team.push(eggMon) : s.storage.push(eggMon);
        }
        break;

      case 'TRADE':
        if (s.team.length > 0) {
            const tradeIn = await pokemonService.getRandomPokemon(s.generation);
            const removeIdx = Math.floor(Math.random() * s.team.length);
            const removed = s.team[removeIdx];
            
            if (tradeIn) {
                s.team[removeIdx] = tradeIn;
                text += `🔄 You traded your *${removed.name}* for a *${tradeIn.name}*!`;
            }
        } else {
            text += `🔄 You wanted to trade, but you have no Pokemon!`;
        }
        break;
        
      case 'NOTHING':
      default:
        text += `🍃 A quiet walk... nothing happened.`;
        break;
    }
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
    await showAdventureMenu(ctx, s);
  }

  // 3. Gym Entry
  else if (data === 'enter_gym') {
    s.state = 'GYM_BATTLE';
    const leaderName = `Gym Leader #${s.round + 1}`;
    
    const keyboard = new InlineKeyboard().text('⚔️ Fight!', 'fight_gym');
    await ctx.reply(`🏛️ You entered the Gym! \nOpponent: *${leaderName}*`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  // 4. Gym Battle Logic
  else if (data === 'fight_gym') {
    const win = gameService.calculateBattleVictory(s);
    
    if (win) {
      s.round++;
      s.badges++;
      s.state = 'ADVENTURE';
      await ctx.editMessageText(`🎉 *VICTORY!* \nYou defeated the Gym Leader! You earned the Badge #${s.badges}.`, { parse_mode: 'Markdown' });
      await showAdventureMenu(ctx, s);
    } else {
      const hasPotion = gameService.usePotion(s);
      if (hasPotion) {
        const keyboard = new InlineKeyboard().text('🧪 Use Potion & Retry', 'fight_gym');
        await ctx.editMessageText(`💥 *DEFEAT!* \nBut you have a Potion! Use it to try again?`, { 
          parse_mode: 'Markdown', 
          reply_markup: keyboard 
        });
      } else {
        s.state = 'GAME_OVER';
        await ctx.editMessageText(`☠️ *GAME OVER* \nYou lost and have no items left. /start to try again.`, { parse_mode: 'Markdown' });
      }
    }
  }

  await ctx.answerCallbackQuery();
});

async function showAdventureMenu(ctx: Context, s: PlayerSession) {
  const keyboard = new InlineKeyboard()
    .text('🎲 Spin Roulette', 'spin_adventure').row();
    
  if (s.state === 'ADVENTURE') {
    keyboard.text('🏛️ Challenge Gym', 'enter_gym');
  }
    
  await ctx.reply(`🌲 *Adventure Continues* \nWhat will you do?`, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

bot.start();
