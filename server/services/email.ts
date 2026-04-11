import { Resend } from "resend";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

export async function sendConfirmationEmail({
  firstName,
  email,
}: {
  firstName: string;
  email: string;
}) {
  const resend = getResendClient();
  if (!resend) {
    console.warn("RESEND_API_KEY not configured — skipping confirmation email");
    return;
  }

  try {
    await resend.emails.send({
      from: "Xenios Technologies <team@xeniostechnology.com>",
      to: email,
      subject: "Welcome to the Xenios Coach Waitlist 🚀",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
          <h2 style="font-size: 24px; margin-bottom: 16px;">Welcome to Xenios, ${firstName}!</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #444;">Thank you for joining the Xenios coach waitlist.</p>

          <p style="font-size: 16px; line-height: 1.6; color: #444;"><strong>What We're Building</strong><br>
          The AI-native operating system for coaches, trainers, and performance teams.</p>

          <p style="font-size: 16px; line-height: 1.6; color: #444;"><strong>How You Can Help</strong></p>
          <ul style="font-size: 15px; line-height: 1.8; color: #444;">
            <li>Participate in product discovery interviews</li>
            <li>Test early features</li>
            <li>Join our founding coach cohort</li>
          </ul>

          <p style="font-size: 16px; line-height: 1.6; color: #444;"><strong>Stay Connected</strong></p>
          <ul style="font-size: 15px; line-height: 1.8; color: #444;">
            <li><a href="https://www.linkedin.com/company/xenios-health" style="color: #2563eb;">LinkedIn</a></li>
            <li><a href="https://www.instagram.com/xenioshealth/" style="color: #2563eb;">Instagram</a></li>
            <li><a href="https://xenios.beehiiv.com/subscribe" style="color: #2563eb;">Newsletter</a></li>
            <li><a href="https://www.xeniostechnology.com" style="color: #2563eb;">Website</a></li>
          </ul>

          <p style="font-size: 16px; line-height: 1.6; color: #444;">We're excited to build the future of coaching with you.</p>
          <p style="font-size: 16px; line-height: 1.6; color: #444;"><strong>— Team Xenios</strong></p>

          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />
          <p style="font-size: 12px; color: #999;">Xenios Technologies · Austin, Texas<br>
          <a href="https://www.xeniostechnology.com" style="color: #999;">xeniostechnology.com</a></p>
        </div>
      `,
    });
    console.log(`Confirmation email sent to ${email}`);
  } catch (error) {
    console.error("Failed to send confirmation email:", error);
  }
}
