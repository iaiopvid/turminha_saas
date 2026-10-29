import "server-only";
import nodemailer from "nodemailer";

export class EmailDeliveryUnavailable extends Error {
  constructor() {
    super("O serviço de e-mail não está configurado ou está indisponível.");
    this.name = "EmailDeliveryUnavailable";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export async function sendEmailVerification(input: { to: string; displayName: string; schoolName: string; token: string }) {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  if (!host || !from || !appBaseUrl || !Number.isInteger(port) || port < 1 || port > 65535 || (!!user !== !!password)) throw new EmailDeliveryUnavailable();

  let base: URL;
  try { base = new URL(appBaseUrl); } catch { throw new EmailDeliveryUnavailable(); }
  if (!["https:", "http:"].includes(base.protocol) || (process.env.NODE_ENV === "production" && base.protocol !== "https:") || base.username || base.password) throw new EmailDeliveryUnavailable();
  const verificationUrl = new URL(`/verificar-email/${encodeURIComponent(input.token)}`, base).toString();
  const displayName = escapeHtml(input.displayName);
  const schoolName = escapeHtml(input.schoolName);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: process.env.NODE_ENV === "production" && port !== 465,
    ...(user && password ? { auth: { user, pass: password } } : {}),
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: `Confirme seu e-mail para acessar ${input.schoolName.replace(/[\r\n\u0000-\u001f\u007f]/g, " ").slice(0, 120)}`,
      text: `Olá, ${input.displayName}. Para confirmar seu e-mail e aceitar o convite da escola ${input.schoolName}, acesse: ${verificationUrl}\n\nO link expira em 24 horas. Se você não esperava este convite, ignore esta mensagem.`,
      html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:24px;color:#1e293b"><p style="color:#7c3aed;font-weight:bold">Turminha</p><h1>Confirme seu e-mail</h1><p>Olá, ${displayName}. Confirme o endereço para aceitar o convite de <strong>${schoolName}</strong>.</p><p><a href="${verificationUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Confirmar e-mail</a></p><p>Este link expira em 24 horas. Se você não esperava este convite, ignore esta mensagem.</p></main>`,
    });
  } catch {
    throw new EmailDeliveryUnavailable();
  } finally {
    transporter.close();
  }
}
