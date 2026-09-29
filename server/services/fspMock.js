// Заглушка интеграции с информационными системами ФСП.
// Когда будет предоставлена спецификация API ФСП и/или реальный мок-сервис,
// этот модуль заменяется на HTTP-клиент к реальному API. Контракт методов сохранён.

const MOCK_DISCIPLINES = [
  { code: 'algorithm', name: 'Алгоритмическое программирование' },
  { code: 'sports', name: 'Спортивное программирование' },
  { code: 'product', name: 'Продуктовая разработка' },
  { code: 'info-security', name: 'Информационная безопасность' },
  { code: 'robotics', name: 'Робототехника' },
];

// Ключ fsp_id -> достижения участника
const MOCK_ACHIEVEMENTS = {
  FSP-0001: [
    {
      discipline: 'algorithm',
      competition: 'Кубок ФСП по спортивному программированию',
      result: '1 место',
      role: 'Участник',
      rank: 'КМС',
      year: 2024,
    },
    {
      discipline: 'sports',
      competition: 'Всероссийская олимпиада по спортивному программированию',
      result: 'Призёр (топ-10)',
      role: 'Капитан команды',
      rank: 'КМС',
      year: 2023,
    },
  ],
  'FSP-0002': [
    {
      discipline: 'product',
      competition: 'Хакатон ФСП «Цифровой прорыв»',
      result: 'Победитель',
      role: 'Backend-разработчик',
      rank: null,
      year: 2024,
    },
  ],
  'FSP-0003': [
    {
      discipline: 'info-security',
      competition: 'CTF-турнир ФСП',
      result: '2 место',
      role: 'Участник',
      rank: 'I разряд',
      year: 2023,
    },
  ],
  'FSP-0004': [
    {
      discipline: 'algorithm',
      competition: 'Кубок ФСП по спортивному программированию',
      result: '3 место',
      role: 'Участник',
      rank: 'I разряд',
      year: 2024,
    },
  ],
  'FSP-0005': [
    {
      discipline: 'robotics',
      competition: 'Фестиваль робототехники ФСП',
      result: 'Финалист',
      role: 'Разработчик ПО',
      rank: null,
      year: 2024,
    },
  ],
};

function getDisciplines() {
  return [...MOCK_DISCIPLINES];
}

function getAchievements(fspId) {
  if (!fspId) {
    return [];
  }
  return (MOCK_ACHIEVEMENTS[fspId] || []).map((a) => ({ ...a }));
}

module.exports = { getDisciplines, getAchievements };