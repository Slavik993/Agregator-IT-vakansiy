// Движок тестирования кандидатов.
//
// Механика устойчивости к распространению заданий:
//  1) банк заданий шире, чем выдаётся за один тест: тест собирается случайной выборкой;
//  2) варианты ответов перемешиваются при каждой генерации;
//  3) параметрические задания генерируют уникальные числовые данные для каждого кандидата;
//  4) смена грейда ограничена по времени (GRADE_CHANGE_COOLDOWN_DAYS = 90).
//
// Оценка результата:
//  - >= CONFIDENT_THRESHOLD (85%) -> confident: кандидат сильнее заявленного грейда,
//    возможен переход на уровень выше;
//  - >= PASS_THRESHOLD (55%)       -> passed: заявленный грейд подтверждён;
//  - иначе                          -> not_passed: грейд не подтверждён,
//    кандидату предлагается пройти тест уровнем ниже.
//
// Грейд принудительно не понижается: при неудаче сохраняется предыдущий подтверждённый грейд.

const GRADE_ORDER = ['junior', 'middle', 'senior', 'lead'];
const GRADE_CHANGE_COOLDOWN_DAYS = 90;

const PASS_THRESHOLD = 55;
const CONFIDENT_THRESHOLD = 85;

// ---- Утилиты ----

function rndInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextGrade(grade) {
  const i = GRADE_ORDER.indexOf(grade);
  return i >= 0 && i < GRADE_ORDER.length - 1 ? GRADE_ORDER[i + 1] : null;
}

function prevGrade(grade) {
  const i = GRADE_ORDER.indexOf(grade);
  return i > 0 ? GRADE_ORDER[i - 1] : null;
}

// ---- Банк заданий ----
// kind: 'choice' — фиксированный вопрос с вариантами;
//       'param'  — генератор уникального задания (числовые данные для каждого кандидата).
const TEST_BANK = [
  // ===== Backend / junior =====
  {
    id: 'b-j-1', role: 'backend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какой HTTP-метод используется для частичного обновления ресурса?',
    options: ['PUT', 'PATCH', 'POST', 'DELETE'], answer: 1,
    explanation: 'PATCH применяется для частичного обновления, PUT — для полной замены ресурса.',
  },
  {
    id: 'b-j-2', role: 'backend', grade: 'junior', kind: 'param', weight: 1,
    make: () => {
      const n = rndInt(3, 12);
      return {
        text: `Сколько раз выполнится тело цикла for (let i = 0; i < ${n}; i++)?`,
        options: [String(n), String(n - 1), String(n + 1), '0'],
        correctIndex: 0,
        explanation: `Цикл выполняется ${n} раз: i принимает значения 0..${n - 1}.`,
      };
    },
  },
  {
    id: 'b-j-3', role: 'backend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какая СУБД относится к категории реляционных?',
    options: ['PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch'], answer: 0,
    explanation: 'PostgreSQL — реляционная СУБД; MongoDB, Redis и Elasticsearch — NoSQL-решения.',
  },
  {
    id: 'b-j-4', role: 'backend', grade: 'junior', kind: 'param', weight: 1,
    make: () => {
      const a = rndInt(2, 9);
      const b = rndInt(2, 9);
      return {
        text: `Чему равно значение выражения ${a} + ${b} * 2?`,
        options: [String(a + b * 2), String((a + b) * 2), String(a * b + 2), String(a + b)],
        correctIndex: 0,
        explanation: `Сначала выполняется умножение: ${b} * 2 = ${b * 2}, затем сложение: ${a} + ${b * 2} = ${a + b * 2}.`,
      };
    },
  },
  {
    id: 'b-j-5', role: 'backend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Что такое индекс в базе данных?',
    options: [
      'Структура данных для ускорения поиска',
      'Резервная копия таблицы',
      'Список пользователей БД',
      'Журнал транзакций',
    ],
    answer: 0,
    explanation: 'Индекс — дополнительная структура данных, ускоряющая операции поиска и выборки.',
  },

  // ===== Backend / middle =====
  {
    id: 'b-m-1', role: 'backend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Какая проблема возникает при использовании N+1 запросов в ORM?',
    options: [
      'Лишние запросы к БД для связанных сущностей',
      'Потеря соединений с БД',
      'Некорректные транзакции',
      'Дублирование данных',
    ],
    answer: 0,
    explanation: 'N+1 — когда для каждой из N записей выполняется дополнительный запрос, что резко увеличивает число обращений к БД.',
  },
  {
    id: 'b-m-2', role: 'backend', grade: 'middle', kind: 'param', weight: 2,
    make: () => {
      const n = rndInt(1000, 100000);
      const log2 = Math.ceil(Math.log2(n));
      return {
        text: `Дан отсортированный массив из ${n} элементов. Сколько сравнений в худшем случае сделает бинарный поиск?`,
        options: [String(log2), String(n), String(n * n), String(Math.ceil(n / 2))],
        correctIndex: 0,
        explanation: `Бинарный поиск имеет сложность O(log N); для N=${n} это ≈ ${log2} сравнений.`,
      };
    },
  },
  {
    id: 'b-m-3', role: 'backend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Для чего используется очередь сообщений (message queue) в распределённых системах?',
    options: [
      'Для асинхронной передачи задач между сервисами',
      'Для хранения паролей пользователей',
      'Для кэширования статических файлов',
      'Для балансировки DNS-запросов',
    ],
    answer: 0,
    explanation: 'Очереди сообщений обеспечивают слабую связанность сервисов и асинхронную обработку.',
  },
  {
    id: 'b-m-4', role: 'backend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Какой подход гарантирует идемпотентность POST-запроса?',
    options: [
      'Передача idempotency key и повторная обработка с тем же ключом',
      'Использование только GET-запросов',
      'Отключение кэширования',
      'Увеличение таймаута запроса',
    ],
    answer: 0,
    explanation: 'Идемпотентность достигается ключом, по которому повторные запросы не дублируют эффект.',
  },
  {
    id: 'b-m-5', role: 'backend', grade: 'middle', kind: 'param', weight: 2,
    make: () => {
      const n = rndInt(4, 10);
      return {
        text: `Сколько уникальных ключей будет в Map после выполнения кода: for (let i = 0; i < ${n}; i++) map.set(i % 3, i); ?`,
        options: ['3', String(n), String(Math.min(3, n)), '0'],
        correctIndex: 0,
        explanation: `Ключи принимают значения 0, 1, 2 — всего 3 уникальных ключа, значения перезаписываются.`,
      };
    },
  },

  // ===== Backend / senior =====
  {
    id: 'b-s-1', role: 'backend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Какая стратегия кэширования минимизирует чтение устаревших данных при обновлении?',
    options: [
      'Cache-aside с инвалидацией при записи',
      'Кэширование без TTL',
      'Запись сразу в кэш без обновления источника',
      'Отключение кэша на чтение',
    ],
    answer: 0,
    explanation: 'Cache-aside с инвалидацией при записи снижает вероятность отдачи устаревших данных.',
  },
  {
    id: 'b-s-2', role: 'backend', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const n = rndInt(100, 500);
      const m = rndInt(100, 500);
      return {
        text: `Алгоритм выполняет двойной цикл: внешний — ${n} итераций, внутренний — ${m} итераций. Какова асимптотическая сложность по O-нотации?`,
        options: [`O(${n * m})`, `O(${n + m})`, `O(${Math.max(n, m)})`, `O(${Math.min(n, m)})`],
        correctIndex: 0,
        explanation: `Вложенные циклы дают O(N*M): всего ≈ ${n * m} операций.`,
      };
    },
  },
  {
    id: 'b-s-3', role: 'backend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Что из перечисленного характерно для распределённой транзакции (Saga)?',
    options: [
      'Серия локальных транзакций с компенсирующими действиями',
      'Одна атомарная транзакция на все сервисы',
      'Отсутствие согласованности данных',
      'Синхронная блокировка всех участников',
    ],
    answer: 0,
    explanation: 'Saga разбивает операцию на шаги с компенсацией при сбое, сохраняя итоговую согласованность.',
  },
  {
    id: 'b-s-4', role: 'backend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Какой механизм чаще всего используют для rate limiting на уровне API-шлюза?',
    options: [
      'Token bucket / sliding window',
      'Полное дублирование запросов',
      'Отключение авторизации',
      'Кэширование ответов навсегда',
    ],
    answer: 0,
    explanation: 'Token bucket и sliding window — стандартные алгоритмы ограничения частоты запросов.',
  },
  {
    id: 'b-s-5', role: 'backend', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const n = rndInt(5, 20);
      return {
        text: `Для N=${n} элементов, сколько сравнений в худшем случае делает быстрая сортировка (quick sort)?`,
        options: [
          `O(N log N) ≈ ${Math.round(n * Math.log2(n))}`,
          `O(N^2) ≈ ${n * n}`,
          `O(N) ≈ ${n}`,
          `O(log N) ≈ ${Math.ceil(Math.log2(n))}`,
        ],
        correctIndex: 0,
        explanation: `Средняя сложность быстрой сортировки — O(N log N); худший случай O(N^2) встречается редко при хорошем выборе опорного элемента.`,
      };
    },
  },

  // ===== Frontend / junior =====
  {
    id: 'f-j-1', role: 'frontend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какой тег используется для создания ссылки в HTML?',
    options: ['<a>', '<link>', '<href>', '<url>'], answer: 0,
    explanation: 'Ссылки создаются тегом <a href="...">.',
  },
  {
    id: 'f-j-2', role: 'frontend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какое CSS-свойство задаёт цвет текста?',
    options: ['color', 'text-color', 'font-color', 'background'], answer: 0,
    explanation: 'Цвет текста задаётся свойством color.',
  },
  {
    id: 'f-j-3', role: 'frontend', grade: 'junior', kind: 'param', weight: 1,
    make: () => {
      const a = rndInt(1, 9);
      const b = rndInt(1, 9);
      return {
        text: `Что выведет console.log(${a} + '${b}')?`,
        options: [`"${a}${b}"`, String(a + b), `"${a}+${b}"`, 'NaN'],
        correctIndex: 0,
        explanation: `Сложение числа и строки приводит к конкатенации: ${a} + '${b}' = "${a}${b}".`,
      };
    },
  },
  {
    id: 'f-j-4', role: 'frontend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какой метод добавляет элемент в конец массива?',
    options: ['push()', 'pop()', 'shift()', 'unshift()'], answer: 0,
    explanation: 'push() добавляет элемент в конец массива.',
  },
  {
    id: 'f-j-5', role: 'frontend', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Что означает CSS-свойство display: flex?',
    options: [
      'Элемент становится flex-контейнером',
      'Элемент скрывается',
      'Элемент получает фиксированную ширину',
      'Элемент становится блочным по центру',
    ],
    answer: 0,
    explanation: 'display: flex включает flexbox-раскладку для дочерних элементов.',
  },

  // ===== Frontend / middle =====
  {
    id: 'f-m-1', role: 'frontend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Что такое виртуализация списка (windowing) в SPA?',
    options: [
      'Рендер только видимых элементов списка',
      'Создание нескольких DOM-деревьев',
      'Кэширование запросов к серверу',
      'Использование iframe для каждого элемента',
    ],
    answer: 0,
    explanation: 'Виртуализация рендерит лишь видимую часть длинного списка, снижая нагрузку на DOM.',
  },
  {
    id: 'f-m-2', role: 'frontend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Чем отличается useMemo от useCallback в React?',
    options: [
      'useMemo мемоизирует значение, useCallback — функцию',
      'useMemo мемоизирует функцию, useCallback — значение',
      'Они полностью эквивалентны',
      'useCallback работает только с классами',
    ],
    answer: 0,
    explanation: 'useMemo возвращает мемоизированное значение, useCallback — мемоизированную функцию.',
  },
  {
    id: 'f-m-3', role: 'frontend', grade: 'middle', kind: 'param', weight: 2,
    make: () => {
      const n = rndInt(2, 8);
      return {
        text: `Сколько раз вызовется useEffect без массива зависимостей при ${n} последовательных рендерах компонента?`,
        options: [String(n), '1', String(n + 1), '0'],
        correctIndex: 0,
        explanation: 'useEffect без зависимостей выполняется после каждого рендера.',
      };
    },
  },
  {
    id: 'f-m-4', role: 'frontend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Какой инструмент чаще всего используют для типизации JavaScript?',
    options: ['TypeScript', 'Sass', 'Webpack', 'ESLint'], answer: 0,
    explanation: 'TypeScript добавляет статическую типизацию поверх JavaScript.',
  },
  {
    id: 'f-m-5', role: 'frontend', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Что такое CSS-переменная (custom property)?',
    options: [
      'Значение, определяемое через --name и применяемое через var()',
      'Переменная в JavaScript, влияющая на стили',
      'Переменная окружения браузера',
      'Имя CSS-класса',
    ],
    answer: 0,
    explanation: 'Custom properties объявляются как --name и используются через var(--name).',
  },

  // ===== Frontend / senior =====
  {
    id: 'f-s-1', role: 'frontend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Какой подход позволяет рендерить React-приложение на сервере для улучшения SEO?',
    options: [
      'SSR (Server-Side Rendering)',
      'Только клиентский рендер',
      'Использование iframe',
      'Отключение JavaScript',
    ],
    answer: 0,
    explanation: 'SSR отдаёт готовый HTML с сервера, что улучшает индексацию и время первого рендера.',
  },
  {
    id: 'f-s-2', role: 'frontend', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const n = rndInt(2, 6);
      return {
        text: `Компонент рендерит список из ${n} элементов без ключей (keys). Что произойдёт при изменении порядка списка?`,
        options: [
          'React может некорректно переиспользовать DOM-узлы',
          'Ничего не произойдёт, keys не нужны',
          'Приложение упадёт с ошибкой',
          'Браузер заблокирует рендер',
        ],
        correctIndex: 0,
        explanation: 'Без ключей React не может надёжно сопоставить элементы, что приводит к ошибкам состояния.',
      };
    },
  },
  {
    id: 'f-s-3', role: 'frontend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Что такое Code Splitting?',
    options: [
      'Разбиение бандла на части, загружаемые по требованию',
      'Разделение кода на строки',
      'Удаление мёртвого кода',
      'Обфускация исходников',
    ],
    answer: 0,
    explanation: 'Code Splitting уменьшает стартовый бандл, загружая фрагменты кода лениво.',
  },
  {
    id: 'f-s-4', role: 'frontend', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Чем Content Security Policy (CSP) помогает веб-приложению?',
    options: [
      'Ограничивает источники загружаемых ресурсов и снижает риск XSS',
      'Ускоряет загрузку страницы',
      'Шифрует данные в localStorage',
      'Заменяет HTTPS',
    ],
    answer: 0,
    explanation: 'CSP задаёт политику источников для скриптов и стилей, блокируя нежелательный код.',
  },
  {
    id: 'f-s-5', role: 'frontend', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const n = rndInt(100, 1000);
      return {
        text: `Страница содержит ${n} DOM-узлов и обновляет их все при каждом изменении состояния. Какая проблема возникает?`,
        options: [
          'Высокая стоимость перерисовки (reflow/repaint)',
          'Потеря сетевого соединения',
          'Утечка пароля',
          'Некорректная кодировка',
        ],
        correctIndex: 0,
        explanation: 'Массовые обновления DOM вызывают дорогие пересчёты раскладки и перерисовку.',
      };
    },
  },

  // ===== ML / junior =====
  {
    id: 'm-j-1', role: 'ml', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какая задача относится к обучению с учителем (supervised learning)?',
    options: [
      'Классификация по размеченным данным',
      'Кластеризация без меток',
      'Поиск аномалий',
      'Снижение размерности',
    ],
    answer: 0,
    explanation: 'В supervised learning модель обучается на парах «признаки — целевая метка».',
  },
  {
    id: 'm-j-2', role: 'ml', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какая метрика подходит для бинарной классификации?',
    options: ['Accuracy / Precision / Recall', 'Perplexity', 'BLEU', 'IoU'], answer: 0,
    explanation: 'Accuracy, Precision и Recall — стандартные метрики бинарной классификации.',
  },
  {
    id: 'm-j-3', role: 'ml', grade: 'junior', kind: 'param', weight: 1,
    make: () => {
      const tp = rndInt(80, 95);
      const fp = rndInt(5, 20);
      return {
        text: `Модель дала ${tp} верных положительных и ${fp} ложных положительных предсказаний. Чему равна Precision (округлённо)?`,
        options: [
          String(Math.round((tp / (tp + fp)) * 100)),
          String(tp),
          String(fp),
          String(Math.round((tp / 100) * 100)),
        ],
        correctIndex: 0,
        explanation: `Precision = TP / (TP + FP) = ${tp} / ${tp + fp} ≈ ${Math.round((tp / (tp + fp)) * 100)}%.`,
      };
    },
  },
  {
    id: 'm-j-4', role: 'ml', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Что такое переобучение (overfitting)?',
    options: [
      'Модель запоминает обучающие данные и плохо обобщает',
      'Модель слишком простая и не может выучить данные',
      'Модель обучается слишком быстро',
      'Модель не использует GPU',
    ],
    answer: 0,
    explanation: 'Overfitting — высокая точность на обучении при низкой на новых данных.',
  },
  {
    id: 'm-j-5', role: 'ml', grade: 'junior', kind: 'choice', weight: 1,
    question: 'Какая библиотека Python чаще всего используется для работы с табличными данными?',
    options: ['pandas', 'flask', 'requests', 'beautifulsoup4'], answer: 0,
    explanation: 'pandas — основной инструмент для табличных данных в Python.',
  },

  // ===== ML / middle =====
  {
    id: 'm-m-1', role: 'ml', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Какая функция активации чаще всего используется на выходном слое многоклассовой классификации?',
    options: ['Softmax', 'ReLU', 'Sigmoid', 'Tanh'], answer: 0,
    explanation: 'Softmax превращает логиты в распределение вероятностей по классам.',
  },
  {
    id: 'm-m-2', role: 'ml', grade: 'middle', kind: 'param', weight: 2,
    make: () => {
      const k = rndInt(3, 10);
      return {
        text: `В задаче классификации ${k} классов сеть выводит вектор логитов размерности ${k}. Какой функцией получают вероятности?`,
        options: ['Softmax по всем классам', 'Sigmoid по каждому классу', 'ReLU по каждому классу', 'Argmax'],
        correctIndex: 0,
        explanation: 'Для многоклассовой классификации применяется softmax по всем классам.',
      };
    },
  },
  {
    id: 'm-m-3', role: 'ml', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Что такое градиентный спуск?',
    options: [
      'Итеративный метод минимизации функции потерь',
      'Метод увеличения точности без данных',
      'Способ хранения моделей',
      'Метод нормализации признаков',
    ],
    answer: 0,
    explanation: 'Градиентный спуск обновляет веса в направлении антиградиента функции потерь.',
  },
  {
    id: 'm-m-4', role: 'ml', grade: 'middle', kind: 'choice', weight: 2,
    question: 'Какой метод используется для борьбы с переобучением?',
    options: [
      'Regularization (L1/L2), dropout',
      'Увеличение числа эпох до бесконечности',
      'Удаление валидационной выборки',
      'Использование всех признаков без фильтрации',
    ],
    answer: 0,
    explanation: 'Регуляризация и dropout снижают переобучение.',
  },
  {
    id: 'm-m-5', role: 'ml', grade: 'middle', kind: 'param', weight: 2,
    make: () => {
      const lr = rndInt(1, 10) / 100;
      const lrStr = lr.toFixed(2);
      return {
        text: `При learning rate = ${lrStr} и градиенте потерь g = 1, на сколько уменьшится значение веса за один шаг SGD (без импульса)?`,
        options: [lrStr, String(1 - lr), '1', '0'],
        correctIndex: 0,
        explanation: `Обновление веса: w = w - lr * g = w - ${lrStr}.`,
      };
    },
  },

  // ===== ML / senior =====
  {
    id: 'm-s-1', role: 'ml', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Что такое attention-механизм в трансформерах?',
    options: [
      'Механизм взвешивания значимости элементов последовательности',
      'Способ сжатия изображений',
      'Метод увеличения размера батча',
      'Алгоритм кластеризации',
    ],
    answer: 0,
    explanation: 'Attention позволяет модели фокусироваться на релевантных элементах последовательности.',
  },
  {
    id: 'm-s-2', role: 'ml', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const d = rndInt(64, 512);
      return {
        text: `Размерность эмбеддинга d_model = ${d}. Сколько параметров у матрицы проекции Q одной головы внимания (без bias)?`,
        options: [String(d * d), String(d), String(d * 3), String(3 * d * d)],
        correctIndex: 0,
        explanation: `Матрица проекции для головы имеет размер d x d, то есть ${d * d} параметров (упрощённо).`,
      };
    },
  },
  {
    id: 'm-s-3', role: 'ml', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Что такое F1-score?',
    options: [
      'Гармоническое среднее Precision и Recall',
      'Среднее арифметическое Accuracy и Loss',
      'Произведение Precision и Recall',
      'Разность Recall и Precision',
    ],
    answer: 0,
    explanation: 'F1 = 2 * P * R / (P + R) — гармоническое среднее precision и recall.',
  },
  {
    id: 'm-s-4', role: 'ml', grade: 'senior', kind: 'choice', weight: 3,
    question: 'Для чего применяется техника Fine-tuning предобученной модели?',
    options: [
      'Для адаптации модели к конкретной задаче на небольших данных',
      'Для ускорения инференса',
      'Для сжатия модели без обучения',
      'Для шифрования весов',
    ],
    answer: 0,
    explanation: 'Fine-tuning дообучает предобученную модель на целевой задаче.',
  },
  {
    id: 'm-s-5', role: 'ml', grade: 'senior', kind: 'param', weight: 3,
    make: () => {
      const p = rndInt(50, 90);
      const r = rndInt(50, 90);
      const f1 = Math.round((2 * p * r) / (p + r));
      return {
        text: `Precision = ${p}%, Recall = ${r}%. Чему равен F1-score (округлённо)?`,
        options: [
          String(f1),
          String(Math.round((p + r) / 2)),
          String(Math.round(p - r)),
          String(Math.round((p * r) / 100)),
        ],
        correctIndex: 0,
        explanation: `F1 = 2PR/(P+R) = 2*${p}*${r}/(${p}+${r}) ≈ ${f1}%.`,
      };
    },
  },
];

// ---- Генерация теста ----

// Собирает уникальный тест: случайная выборка заданий по специализации,
// 3 задания заявленного грейда + по одному соседнему уровню (ниже/выше) для оценки уверенности.
function generateTest(role, claimedGrade) {
  const pool = TEST_BANK.filter((q) => q.role === role);
  const gradeIdx = GRADE_ORDER.indexOf(claimedGrade);
  const primary = pool.filter((q) => q.grade === claimedGrade);
  const lower = pool.filter((q) => q.grade === GRADE_ORDER[gradeIdx - 1]);
  const upper = pool.filter((q) => q.grade === GRADE_ORDER[gradeIdx + 1]);

  const chosen = [];
  chosen.push(...shuffle(primary).slice(0, Math.min(3, primary.length)));
  if (lower.length) chosen.push(...shuffle(lower).slice(0, 1));
  if (upper.length) chosen.push(...shuffle(upper).slice(0, 1));
  const need = 5 - chosen.length;
  if (need > 0) {
    const rest = shuffle(primary.filter((q) => !chosen.includes(q)));
    chosen.push(...rest.slice(0, need));
  }

  return shuffle(chosen).map((q, i) => {
    const generated = q.kind === 'param' ? q.make() : {
      text: q.question,
      options: [...q.options],
      correctIndex: q.answer,
      explanation: q.explanation,
    };
    const options = shuffle(generated.options);
    const correctValue = options[generated.correctIndex];
    const correctIndex = options.indexOf(correctValue);
    return {
      id: `${q.id}#${i + 1}`,
      baseId: q.id,
      text: generated.text,
      options,
      correctIndex,
      weight: q.weight,
      explanation: generated.explanation,
    };
  });
}

// ---- Оценка теста ----

function gradeAttempt(attempt, answers) {
  const questions = attempt.questions;
  let score = 0;
  let maxScore = 0;
  const details = questions.map((q) => {
    const givenRaw = answers && answers[q.id];
    const given = givenRaw === undefined || givenRaw === null ? null : Number(givenRaw);
    const correct = given !== null && given === q.correctIndex;
    maxScore += q.weight;
    if (correct) score += q.weight;
    return { id: q.id, correct, given, correctIndex: q.correctIndex, explanation: q.explanation };
  });
  const percent = maxScore ? Math.round((score / maxScore) * 100) : 0;
  let result;
  if (percent >= CONFIDENT_THRESHOLD) result = 'confident';
  else if (percent >= PASS_THRESHOLD) result = 'passed';
  else result = 'not_passed';
  return { score, maxScore, percent, result, details };
}

// ---- Правила смены грейда ----

function canChangeGrade(candidate, now = new Date()) {
  if (!candidate.last_grade_change) return true;
  const last = new Date(candidate.last_grade_change);
  if (Number.isNaN(last.getTime())) return true;
  const diffMs = now.getTime() - last.getTime();
  return diffMs >= GRADE_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

// Определяет новый грейд по результату теста. Грейд принудительно не понижается.
function resolveGrade(attempt, graded, candidate) {
  const claimed = attempt.claimed_grade;
  const currentVerified = candidate.verified_grade || null;
  const declared = candidate.grade;
  const now = new Date();
  let gradeAfter = currentVerified || declared;
  let changed = false;
  let cooldownBlocked = false;

  if (graded.result === 'confident') {
    const target = nextGrade(claimed);
    if (target) {
      if (canChangeGrade(candidate, now)) {
        gradeAfter = target;
        changed = true;
      } else {
        cooldownBlocked = true;
        gradeAfter = claimed;
      }
    } else {
      gradeAfter = claimed;
    }
  } else if (graded.result === 'passed') {
    if (claimed !== (currentVerified || declared)) {
      if (canChangeGrade(candidate, now)) {
        gradeAfter = claimed;
        changed = true;
      } else {
        cooldownBlocked = true;
        gradeAfter = currentVerified || declared;
      }
    } else {
      gradeAfter = claimed;
    }
  }
  // not_passed: грейд не меняем (не понижаем), кандидат может пройти тест уровнем ниже.

  return { gradeAfter, changed, cooldownBlocked };
}

module.exports = {
  TEST_BANK,
  GRADE_ORDER,
  GRADE_CHANGE_COOLDOWN_DAYS,
  PASS_THRESHOLD,
  CONFIDENT_THRESHOLD,
  generateTest,
  gradeAttempt,
  resolveGrade,
  canChangeGrade,
  nextGrade,
  prevGrade,
};