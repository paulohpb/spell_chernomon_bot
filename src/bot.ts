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

  if (data.startsWith('gen_')) {
    s.generation = parseInt(data.split('_')[1]);
    s.state = 'STARTER_SELECT';
    const p1 = await pokemonService.getRandomPokemon(s.generation);
    s.team.push(p1!); 
    s.state = 'ADVENTURE';
    
    await ctx.editMessageText(`You chose Gen ${s.generation}! \nYour starter is: *${p1?.name}* (Power: ${p1?.power})`, { parse_mode: 'Markdown' });
    await showAdventureMenu(ctx, s);
  }

  else if (data === 'spin_adventure') {
    const event = gameService.spinAdventure();
    let text = `🎲 *Roulette Result:* ${event.replace('_', ' ')}\n`;
    
    switch (event) {
      case 'CATCH_POKEMON':
      case 'CATCH_TWO':
      case 'EXPLORE_CAVE':
        const newMon = await pokemonService.getRandomPokemon(s.generation);
        if (newMon) {
          if (s.team.length < 6) {
            s.team.push(newMon);
            text += `You caught a *${newMon.name}*! (Power: ${newMon.power})`;
          } else {
            s.storage.push(newMon);
            text += `You caught *${newMon.name}*! sent to PC.`;
          }
        }
        break;

      case 'BUY_POTIONS':
      case 'FIND_ITEM':
        const potion = s.items.find(i => i.id === 'potion');
        if (potion) potion.count++;
        text += `You found a Potion! 🧪`;
        break;
        
      case 'NOTHING':
        text += `A quiet walk... nothing happened.`;
        break;
    }
    
    await ctx.reply(text, { parse_mode: 'Markdown' });
    await showAdventureMenu(ctx, s);
  }

  else if (data === 'enter_gym') {
    s.state = 'GYM_BATTLE';
    const leaderName = `Gym Leader #${s.round + 1}`;
    
    const keyboard = new InlineKeyboard().text('⚔️ Fight!', 'fight_gym');
    await ctx.reply(`🏛️ You entered the Gym! \nOpponent: *${leaderName}*`, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

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
