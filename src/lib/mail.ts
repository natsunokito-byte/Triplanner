// Minimal Resend client (plain fetch). Without RESEND_API_KEY it logs the code in non-production only.
export async function sendOtpEmail(to: string, code: string, tripTitle: string, locale: "zh-TW" | "en"): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") console.log(`[dev] OTP for ${to}: ${code}`);
    return process.env.NODE_ENV !== "production";
  }
  const zh = locale === "zh-TW";
  const subject = zh ? `${tripTitle} 驗證碼：${code}` : `${tripTitle} — your code is ${code}`;
  const text = zh
    ? `你的驗證碼是 ${code}，10 分鐘內有效。\n如果你沒有要求這封信，可以忽略它。`
    : `Your verification code is ${code}. It expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Generic plain-text mail via Resend. Returns false (and logs in dev) when not configured or on failure. */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") console.log(`[dev] mail to ${to}: ${subject}\n${text}`);
    return process.env.NODE_ENV !== "production";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
