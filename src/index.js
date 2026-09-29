const { Telegraf } = require('telegraf');

// Базовый URL веб-сервиса (Express API).
// Для локальной разработки можно переопределить переменной окружения WEB_API_URL.
const WEB_API_URL = process.env.WEB_API_URL || 'http://localhost:3000';

const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальная переменная для хранения контекста
let globalContext = null;

bot.start((ctx) =>
  ctx.reply(
    `Привет, ${ctx.message.from.first_name || 'друг'}! 🤖\n\n` +
      `Это бот отраслевого агрегатора ИТ-вакансий.\n\n` +
      `Доступные команды:\n` +
      `/achievements <ID ФСП> — проверить подтверждённые достижения участника ФСП\n` +
      `/vacancies — список актуальных вакансий\n` +
      `/help — справка`
  )
);

bot.help((ctx) =>
  ctx.reply(
    `Справка по командам:\n\n` +
      `/achievements FSP-0001 — показать достижения участника ФСП (дисциплины, соревнования, результаты, разряды)\n` +
      `/vacancies — показать актуальные вакансии с зарплатами\n\n` +
      `Работодатель может проверить профиль кандидата по его ID ФСП, а соискатель — показать свои достижения.`
  )
);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function handleAchievements(ctx, fspId) {
  const id = (fspId || '').trim().toUpperCase();
  if (!id) {
    return ctx.reply('Укажите ID участника ФСП, например: /achievements FSP-0001');
  }
  try {
    const achievements = await fetchJson(`${WEB_API_URL}/api/fsp/achievements/${encodeURIComponent(id)}`);
    if (!achievements.length) {
      return ctx.reply(`По ID ${id} достижения не найдены.`);
    }
    const lines = achievements.map(
      (a) =>
        `🏆 ${a.competition}\n` +
        `   Дисциплина: ${a.discipline}\n` +
        `   Результат: ${a.result || '—'}\n` +
        `   Роль: ${a.role || '—'}\n` +
        `   Разряд: ${a.rank || '—'}\n` +
        `   Год: ${a.year || '—'}`
    );
    return ctx.reply(`Достижения участника ${id}:\n\n${lines.join('\n\n')}`);
  } catch (error) {
    console.error('Error fetching achievements:', error);
    return ctx.reply(`Не удалось получить достижения: ${error.message}`);
  }
}

async function handleVacancies(ctx) {
  try {
    const vacancies = await fetchJson(`${WEB_API_URL}/api/vacancies`);
    if (!vacancies.length) {
      return ctx.reply('Актуальных вакансий пока нет.');
    }
    const lines = vacancies.map((v) => {
      const salary = [v.salary_from, v.salary_to].filter(Boolean).join(' – ');
      return (
        `💼 ${v.title}\n` +
        `   Компания: ${v.company}\n` +
        `   Стек: ${v.stack}\n` +
        `   Грейд/роль: ${v.grade} / ${v.role}\n` +
        `   Зарплата: ${salary ? salary + ' ₽' : 'не указана'}\n` +
        `   Формат: ${v.work_format}`
      );
    });
    return ctx.reply(`Актуальные вакансии (${vacancies.length}):\n\n${lines.join('\n\n')}`);
  } catch (error) {
    console.error('Error fetching vacancies:', error);
    return ctx.reply(`Не удалось получить вакансии: ${error.message}`);
  }
}

bot.command('achievements', (ctx) => {
  const fspId = ctx.message.text.split(' ').slice(1).join(' ');
  return handleAchievements(ctx, fspId);
});

bot.command('vacancies', (ctx) => handleVacancies(ctx));

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Удобство: если пользователь просто прислал ID вида FSP-XXXX
  if (/^FSP-\d+$/i.test(text)) {
    return handleAchievements(ctx, text);
  }

  await ctx.reply(
    `Я понимаю только команды:\n` +
      `/achievements <ID ФСП>\n` +
      `/vacancies\n` +
      `/help`
  );
});

module.exports.handler = async function (event, context) {
  // Сохраняем контекст в глобальную переменную
  globalContext = context;

  const message = JSON.parse(event.body);
  await bot.handleUpdate(message);
  return {
    statusCode: 200,
    body: '',
  };
};