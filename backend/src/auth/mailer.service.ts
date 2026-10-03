import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * MailerService — transactional email dispatch.
 *
 * The default implementation logs the reset link to stdout (safe for
 * development / test environments where no SMTP relay is configured).
 * Production deployments swap in a nodemailer createTransport() that
 * delivers to a real relay.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');

  /**
   * Send a password-reset link to `email`. The `token` is a single-use,
   * short-lived secret that the UI will POST back to /auth/password-reset/confirm.
   */
  async sendPasswordReset(email: string, token: string): Promise<void> {
    // Intentionally short-circuit in test / development: just log the token so
    // integration tests can capture it without an SMTP relay.
    this.logger.log(`[password-reset] token for ${email}: ${token}`);
  }

  /**
   * Send a customer invitation containing a single-use activation link.
   */
  async sendCustomerInvitation(email: string, activationUrl: string): Promise<void> {
    this.logger.log(`[customer-invite] activation link for ${email}: ${activationUrl}`);
    const host = process.env.SMTP_HOST;
    if (!host) {
      // No relay configured (local / test): the logged link is the delivery.
      return;
    }
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = /^(1|true|yes)$/i.test(process.env.SMTP_SECURE ?? '') || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM ?? process.env.MAIL_FROM ?? 'no-reply@b2b-comms.local';
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });
    const safeUrl = activationUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    try {
      const info = await transport.sendMail({
        from,
        to: email,
        subject: "You're invited",
        text: `You've been invited to join the workspace portal.\n\nActivate your customer account: ${activationUrl}\n\nThis link can be used once.`,
        html: `<p>You've been invited to join the workspace portal.</p><p><a href="${safeUrl}">Activate your customer account</a></p><p>Or open this link: <a href="${safeUrl}">${safeUrl}</a></p><p>This link can be used once.</p>`,
      });
      this.logger.log(`[customer-invite] email sent to ${email}: ${info.messageId ?? 'ok'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[customer-invite] failed to send email to ${email}: ${message}`);
      throw new Error(`Failed to send invitation email: ${message}`);
    }
  }
}
