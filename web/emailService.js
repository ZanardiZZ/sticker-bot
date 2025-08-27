const nodemailer = require('nodemailer');
const crypto = require('crypto');

class EmailService {
  constructor() {
    this.transporter = null;
    this.setupTransport();
  }

  setupTransport() {
    // Email configuration from environment variables
    const emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT) || 587,
      // Automatically set secure to true for port 465 unless explicitly overridden
      secure: (typeof process.env.SMTP_SECURE !== 'undefined')
        ? process.env.SMTP_SECURE === 'true'
        : (parseInt(process.env.SMTP_PORT) === 465),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    // Create transporter only if SMTP credentials are provided
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      this.transport = nodemailer.createTransport(emailConfig);
      console.log('[EMAIL] Email service configured');
    } else {
      console.warn('[EMAIL] Email service not configured - missing SMTP credentials');
    }
  }

  async sendConfirmationEmail(to, username, confirmationToken) {
    if (!this.transport) {
      console.warn('[EMAIL] Cannot send email - service not configured');
      return false;
    }

    const confirmationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/confirm-email?token=${confirmationToken}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@stickerbot.com',
      to: to,
      subject: 'Confirme seu email - Sticker Bot',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Confirme seu email</h2>
          <p>Olá <strong>${username}</strong>,</p>
          <p>Obrigado por se registrar no Sticker Bot! Para completar seu cadastro, confirme seu email clicando no link abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Confirmar Email
            </a>
          </div>
          <p>Ou copie e cole este link no seu navegador:</p>
          <p style="word-break: break-all; color: #666;">${confirmationUrl}</p>
          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            Este link expira em 24 horas. Se você não criou esta conta, ignore este email.
          </p>
        </div>
      `,
      text: `
Olá ${username},

Obrigado por se registrar no Sticker Bot! Para completar seu cadastro, confirme seu email clicando no link abaixo:

${confirmationUrl}

Este link expira em 24 horas. Se você não criou esta conta, ignore este email.
      `
    };

    try {
      const info = await this.transport.sendMail(mailOptions);
      console.log('[EMAIL] Confirmation email sent to:', to, 'Message ID:', info.messageId);
      return true;
    } catch (error) {
      console.error('[EMAIL] Error sending confirmation email:', error);
      return false;
    }
  }

  generateConfirmationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async testConnection() {
    if (!this.transport) {
      return false;
    }
    
    try {
      await this.transport.verify();
      console.log('[EMAIL] SMTP connection test successful');
      return true;
    } catch (error) {
      console.error('[EMAIL] SMTP connection test failed:', error);
      return false;
    }
  }
}

module.exports = new EmailService();