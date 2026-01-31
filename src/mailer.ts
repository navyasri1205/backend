import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter: nodemailer.Transporter | null = null;

/**
 * Create or get Ethereal transporter.
 * If ETHEREAL_USER/PASS are set, use them; otherwise create a test account at runtime.
 */
export async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  if (config.etherealUser && config.etherealPass) {
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: config.etherealUser,
        pass: config.etherealPass,
      },
    });
    return transporter;
  }

  const testAccount = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  console.log('Ethereal test account created. Save credentials for debugging:', {
    user: testAccount.user,
    pass: testAccount.pass,
  });
  return transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export async function sendMail(options: SendMailOptions): Promise<{ messageId: string; previewUrl?: string }> {
  const transport = await getTransporter();
  const from = options.from ?? (config.etherealUser || 'noreply@ethereal.email');
  const info = await transport.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, '<br>'),
  });
  const previewUrl = nodemailer.getTestMessageUrl(info) ?? undefined;
  return { messageId: info.messageId, previewUrl };
}
