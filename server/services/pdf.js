// Генерация PDF-профиля. Использует pdfkit — табличные правды генерируются
// без обращения к шрифтам, встроенный Helvetica.
// В проде можно перейти на HTML→PDF (puppeteer) или шаблонизатор.

const PDFDocument = require('pdfkit');
const { Writable } = require('stream');

function buildCandidatePdf(candidate, achievements) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Заголовок
  doc.fontSize(22).fillColor('#1f2937').text(candidate.full_name || 'Кандидат', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#6b7280').text(`Профиль кандидата · ${new Date().toLocaleDateString('ru-RU')}`);
  doc.moveDown(1);

  // Контакты — выводятся только если кандидат разрешил публикацию контактов
  const showContacts = !!candidate.privacy_show_contacts;
  if (showContacts) {
    doc.fontSize(11).fillColor('#111827').text('Контакты:', { continued: false });
    if (candidate.email) doc.fontSize(10).fillColor('#374151').text(`Email: ${candidate.email}`);
    if (candidate.telegram) doc.text(`Telegram: ${candidate.telegram}`);
    if (candidate.phone) doc.text(`Телефон: ${candidate.phone}`);
    doc.moveDown(0.6);
  }

  // Основные поля
  doc.fontSize(14).fillColor('#111827').text('Специализация');
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor('#374151')
    .text(`Грейд: ${candidate.verified_grade || candidate.grade}`)
    .text(`Роль: ${candidate.role}`)
    .text(`Опыт: ${candidate.experience_years} лет`)
    .text(`Формат: ${candidate.work_format}`)
    .text(`Город: ${candidate.city || '—'}`);
  doc.moveDown(0.6);

  doc.fontSize(14).fillColor('#111827').text('Стек');
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor('#374151').text(String(candidate.stack || '').replace(/,/g, ', '));
  doc.moveDown(0.6);

  if (candidate.bio) {
    doc.fontSize(14).fillColor('#111827').text('О себе');
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#374151').text(candidate.bio);
    doc.moveDown(0.6);
  }

  if (candidate.soft_skills) {
    doc.fontSize(14).fillColor('#111827').text('Soft skills');
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor('#374151').text(candidate.soft_skills);
    doc.moveDown(0.6);
  }

  if (achievements && achievements.length && candidate.privacy_show_achievements) {
    doc.fontSize(14).fillColor('#111827').text('Достижения ФСП');
    doc.moveDown(0.2);
    achievements.forEach((a) => {
      doc.fontSize(11).fillColor('#374151').text(
        `• ${a.competition} (${a.year || '—'}) — ${a.result || ''}` +
          (a.rank ? `, разряд ${a.rank}` : '') +
          (a.discipline ? ` [${a.discipline}]` : '')
      );
    });
  }

  doc.end();
  return done;
}

module.exports = { buildCandidatePdf };