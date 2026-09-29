const nodemailer = require('nodemailer');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return transporter;
}

const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendVerificationEmail(to, name, code) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured');
    console.log(`[DEV] Verification code for ${to}: ${code}`); // local testing without email
    return;
  }
  const from = process.env.MAIL_FROM || `Committee Showcase <${process.env.SMTP_USER}>`;
  await getTransporter().sendMail({
    from,
    to,
    subject: `Your verification code: ${code}`,
    text: `Hi ${name},\n\nYour Committee Showcase verification code is ${code}.\nIt expires in 15 minutes.\n\nIf you did not sign up, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px">
      <p>Hi ${esc(name)},</p>
      <p>Your Committee Showcase verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px">${esc(code)}</p>
      <p>It expires in 15 minutes. If you did not sign up, ignore this email.</p></div>`,
  });
}

module.exports = { sendVerificationEmail };