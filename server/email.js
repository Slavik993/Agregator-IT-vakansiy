// Сервис email-уведомлений. В MVP пишет в консоль и в лог-файл,
// чтобы демонстрация работала без SMTP. Контракт совместим с реальным SMTP-провайдером.
//
// В проде sendVerificationCode подменяется на вызов SMTP / SES / Mailgun.
// Все сообщения логируются в server/data/email-outbox.log.

const fs = require('fs');
const path = require('path');

const OUTBOX = path.join(__dirname, '..', 'data', 'email-outbox.log');

function logLine(line) {
  try {
    fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
    fs.appendFileSync(OUTBOX, line + '\n', 'utf8');
  } catch (e) {
    // не критично — письмо уже выведено в консоль
  }
}

function sendVerificationCode(email, code) {
  const subject = 'Подтверждение регистрации — Agregator IT вакansiy';
  const text = `Код подтверждения: ${code}\n\nВведите его в форме регистрации, чтобы активировать аккаунт.`;
  // eslint-disable-next-line no-console
  console.log(`\n[email] -> ${email}\n${subject}\n${text}\n`);
  logLine(`${new Date().toISOString()}\tto=${email}\tsubject=${subject}\tcode=${code}`);
}

function sendGeneric(to, subject, text) {
  // eslint-disable-next-line no-console
  console.log(`\n[email] -> ${to}\n${subject}\n${text}\n`);
  logLine(`${new Date().toISOString()}\tto=${to}\tsubject=${subject}\t${text.replace(/\n/g, ' ')}`);
}

module.exports = { sendVerificationCode, sendGeneric };