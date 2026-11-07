import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In-memory or env-based email configuration
let emailSettings = {
  defaultRecipient: process.env.VISITOR_NOTIFICATION_EMAIL || "017mattakin@gmail.com",
  senderName: process.env.EMAIL_SENDER_NAME || "Windy Group Visitor Security Desk",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpSecure: process.env.SMTP_SECURE === "true" || false,
};

// Helper to create nodemailer transporter
function getTransporter() {
  if (emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.smtpPass) {
    return nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpSecure || emailSettings.smtpPort === 465,
      auth: {
        user: emailSettings.smtpUser,
        pass: emailSettings.smtpPass,
      },
    });
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get current email config
  app.get("/api/email-config", (req, res) => {
    res.json({
      defaultRecipient: emailSettings.defaultRecipient,
      senderName: emailSettings.senderName,
      smtpConfigured: Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.smtpPass),
      smtpHost: emailSettings.smtpHost || "Not Configured (Simulated Mode)",
      smtpPort: emailSettings.smtpPort,
      smtpUser: emailSettings.smtpUser ? `${emailSettings.smtpUser.substring(0, 3)}***` : "None"
    });
  });

  // Update email config
  app.post("/api/email-config", (req, res) => {
    const { defaultRecipient, senderName, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure } = req.body;
    if (defaultRecipient) emailSettings.defaultRecipient = String(defaultRecipient).trim();
    if (senderName) emailSettings.senderName = String(senderName).trim();
    if (smtpHost !== undefined) emailSettings.smtpHost = String(smtpHost).trim();
    if (smtpPort !== undefined) emailSettings.smtpPort = parseInt(smtpPort, 10) || 587;
    if (smtpUser !== undefined) emailSettings.smtpUser = String(smtpUser).trim();
    if (smtpPass !== undefined) emailSettings.smtpPass = String(smtpPass).trim();
    if (smtpSecure !== undefined) emailSettings.smtpSecure = Boolean(smtpSecure);

    res.json({
      success: true,
      message: "Email configuration updated successfully",
      config: {
        defaultRecipient: emailSettings.defaultRecipient,
        senderName: emailSettings.senderName,
        smtpConfigured: Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.smtpPass)
      }
    });
  });

  // Send Test Email
  app.post("/api/email/test", async (req, res) => {
    try {
      const recipient = req.body.recipient || emailSettings.defaultRecipient;
      const transporter = getTransporter();

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <div style="background-color: #1e293b; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px;">WINDY GROUP - VISITOR SYSTEM</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Email Notification Verification / টেস্ট ইমেইল</p>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 14px; color: #334155; margin-top: 0;">
              This is a test notification from the <strong>Windy Group Visitor In-Out System</strong>.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 14px; font-size: 13px; color: #1e293b;">
              <div><strong>Status:</strong> Email dispatch system is active & ready</div>
              <div><strong>Recipient:</strong> ${recipient}</div>
              <div><strong>Timestamp:</strong> ${new Date().toLocaleString()}</div>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 16px;">
              Whenever a visitor enters or exits, an instant notification will be delivered automatically.
            </p>
          </div>
        </div>
      `;

      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${emailSettings.senderName}" <${emailSettings.smtpUser}>`,
          to: recipient,
          subject: `[Test] Windy Group Visitor Notification Test - ${new Date().toLocaleTimeString()}`,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient });
      } else {
        console.log(`[Email Simulation] Test email prepared for ${recipient}:`);
        return res.json({
          success: true,
          mode: "simulated",
          message: "Test email simulated successfully. (To deliver live external emails directly, enter SMTP credentials in Settings)",
          recipient,
          previewHtml: htmlContent
        });
      }
    } catch (err: any) {
      console.error("Test email error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to send test email" });
    }
  });

  // Instant notification when a visitor is added (In-Time) or checked out (Out-Time)
  app.post("/api/visitors/notify", async (req, res) => {
    try {
      const { visitor, customRecipient, actionType = "checkin" } = req.body;
      if (!visitor) {
        return res.status(400).json({ success: false, error: "Visitor data is required" });
      }

      const recipient = customRecipient || emailSettings.defaultRecipient;
      const isExit = actionType === "checkout" || Boolean(visitor.out_time);

      const actionTitle = isExit 
        ? "ভিজিটর প্রস্থান বিজ্ঞপ্তি / Visitor Exit Notification" 
        : "ভিজিটর আগমন বিজ্ঞপ্তি / New Visitor Arrival Notification";

      const subject = isExit
        ? `[Windy Group] ভিজিটর প্রস্থান: ${visitor.company_name} - ${visitor.visitor_name || 'Visitor'}`
        : `[Windy Group] নতুন ভিজিটর আগমন: ${visitor.company_name} - ${visitor.visitor_name || 'Visitor'}`;

      const htmlContent = `
        <div style="font-family: Arial, 'Segoe UI', Tahoma, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <div style="background-color: ${isExit ? '#334155' : '#0f172a'}; color: #ffffff; padding: 20px 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 style="margin: 0; font-size: 19px; font-weight: bold; letter-spacing: 0.5px;">WINDY GROUP</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #cbd5e1; font-weight: 500;">
                  ${actionTitle}
                </p>
              </div>
            </div>
          </div>

          <!-- Alert Badge -->
          <div style="background-color: ${isExit ? '#f1f5f9' : '#fef3c7'}; border-bottom: 1px solid ${isExit ? '#e2e8f0' : '#fde68a'}; padding: 10px 24px; font-size: 12px; font-weight: bold; color: ${isExit ? '#475569' : '#92400e'};">
            ${isExit ? '✓ Visitor has officially checked out / ভিজিটর প্রস্থান সম্পন্ন' : '🚨 New visitor has checked in at the gate / নতুন ভিজিটর প্রবেশ করেছেন'}
          </div>

          <!-- Visitor Details Table -->
          <div style="padding: 24px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #1e293b;">
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b; width: 35%;">ক্রমিক নং / SL:</td>
                  <td style="padding: 10px 0; font-weight: bold; font-family: monospace;">${visitor.sl || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">তারিখ / Date:</td>
                  <td style="padding: 10px 0; font-weight: bold;">${visitor.date || new Date().toISOString().split('T')[0]}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">কোম্পানির নাম / Company:</td>
                  <td style="padding: 10px 0; font-weight: bold; color: #0369a1; font-size: 14px;">${visitor.company_name || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">ভিজিটরের নাম / Visitor:</td>
                  <td style="padding: 10px 0; font-weight: bold;">${visitor.visitor_name || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">মোবাইল নম্বর / Phone:</td>
                  <td style="padding: 10px 0; font-family: monospace;">${visitor.phone_number || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9; background-color: #fafaf9;">
                  <td style="padding: 10px 8px; font-weight: bold; color: #b45309;">কার সাথে সাক্ষাৎ / Who Meet:</td>
                  <td style="padding: 10px 8px; font-weight: bold; color: #92400e; font-size: 14px;">${visitor.who_meet || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">উদ্দেশ্য / Purpose:</td>
                  <td style="padding: 10px 0;">${visitor.purpose || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">প্রবেশের সময় / In Time:</td>
                  <td style="padding: 10px 0; font-weight: bold; color: #15803d; font-family: monospace;">${visitor.in_time || '-'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">বের হওয়ার সময় / Out Time:</td>
                  <td style="padding: 10px 0; font-weight: bold; color: #b91c1c; font-family: monospace;">${visitor.out_time || '(Inside / এখনও অবস্থান করছেন)'}</td>
                </tr>
                ${visitor.id_card_no ? `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 10px 0; font-weight: bold; color: #64748b;">পাস নং / Card No:</td>
                  <td style="padding: 10px 0; font-family: monospace;">${visitor.id_card_no}</td>
                </tr>` : ''}
              </tbody>
            </table>

            <div style="margin-top: 24px; padding: 12px; background-color: #f8fafc; border-radius: 4px; font-size: 11px; color: #64748b; text-align: center;">
              This is an automated notification from Windy Group Security & Visitor Gate Control System.
            </div>
          </div>
        </div>
      `;

      const transporter = getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${emailSettings.senderName}" <${emailSettings.smtpUser}>`,
          to: recipient,
          subject,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient });
      } else {
        console.log(`[Email Notification] Instant notification sent for ${visitor.company_name} to ${recipient}`);
        return res.json({
          success: true,
          mode: "simulated",
          message: `Instant notification dispatched to ${recipient}`,
          recipient,
          previewSubject: subject,
          previewHtml: htmlContent
        });
      }
    } catch (err: any) {
      console.error("Visitor notify error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to dispatch notification" });
    }
  });

  // Consolidated Daily Report Email
  app.post("/api/visitors/daily-report-email", async (req, res) => {
    try {
      const { date, visitors = [], customRecipient } = req.body;
      const reportDate = date || new Date().toISOString().split('T')[0];
      const recipient = customRecipient || emailSettings.defaultRecipient;

      const totalCount = visitors.length;
      const insideCount = visitors.filter((v: any) => !v.out_time || v.status === 'Inside').length;
      const outCount = totalCount - insideCount;

      const rowsHtml = visitors.map((v: any, idx: number) => `
        <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 8px 10px; text-align: center; font-weight: bold;">${v.sl || idx + 1}</td>
          <td style="padding: 8px 10px; font-weight: bold; color: #0284c7;">${v.company_name || '-'}</td>
          <td style="padding: 8px 10px; font-weight: 500;">${v.visitor_name || '-'}</td>
          <td style="padding: 8px 10px; font-family: monospace; font-size: 11px;">${v.phone_number || '-'}</td>
          <td style="padding: 8px 10px; font-weight: bold; color: #92400e;">${v.who_meet || '-'}</td>
          <td style="padding: 8px 10px;">${v.purpose || '-'}</td>
          <td style="padding: 8px 10px; text-align: center; font-family: monospace; font-weight: bold; color: #16a34a;">${v.in_time || '-'}</td>
          <td style="padding: 8px 10px; text-align: center; font-family: monospace; font-weight: bold; color: #dc2626;">${v.out_time || '-'}</td>
          <td style="padding: 8px 10px; text-align: center; font-size: 11px; font-weight: bold;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background-color: ${v.out_time ? '#e2e8f0' : '#dcfce7'}; color: ${v.out_time ? '#475569' : '#166534'};">
              ${v.out_time ? 'Checked Out' : 'Inside'}
            </span>
          </td>
        </tr>
      `).join('');

      const htmlContent = `
        <div style="font-family: Arial, 'Segoe UI', Tahoma, sans-serif; max-width: 900px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
          <!-- Header -->
          <div style="background-color: #1e293b; color: #ffffff; padding: 22px 28px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">WINDY GROUP</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; font-weight: bold; text-transform: uppercase;">
                  DAILY VISITOR CONSOLIDATED REPORT / দৈনিক ভিজিটর লগ রিপোর্ট
                </p>
              </div>
            </div>
            <div style="margin-top: 14px; font-size: 13px; color: #cbd5e1; border-top: 1px solid #334155; padding-top: 10px;">
              <strong>Report Date:</strong> ${reportDate} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleTimeString()}
            </div>
          </div>

          <!-- Summary Metric Cards -->
          <div style="display: flex; background-color: #f1f5f9; padding: 16px 28px; gap: 16px; border-bottom: 1px solid #cbd5e1;">
            <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Total Visitors / মোট ভিজিটর</div>
              <div style="font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 4px;">${totalCount} জন</div>
            </div>
            <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; font-weight: bold; color: #166534; text-transform: uppercase;">Currently Inside / অবস্থানে আছেন</div>
              <div style="font-size: 20px; font-weight: bold; color: #15803d; margin-top: 4px;">${insideCount} জন</div>
            </div>
            <div style="flex: 1; background: #ffffff; padding: 12px 16px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Checked Out / প্রস্থান করেছেন</div>
              <div style="font-size: 20px; font-weight: bold; color: #334155; margin-top: 4px;">${outCount} জন</div>
            </div>
          </div>

          <!-- Table Container -->
          <div style="padding: 24px; background-color: #ffffff; overflow-x: auto;">
            ${totalCount === 0 ? `
              <div style="text-align: center; padding: 36px; color: #94a3b8; font-style: italic;">
                No visitors registered for this date.
              </div>
            ` : `
              <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                <thead>
                  <tr style="background-color: #0f172a; color: #ffffff;">
                    <th style="padding: 10px; text-align: center; font-size: 11px;">SL</th>
                    <th style="padding: 10px; font-size: 11px;">Company Name</th>
                    <th style="padding: 10px; font-size: 11px;">Visitor Name</th>
                    <th style="padding: 10px; font-size: 11px;">Phone No</th>
                    <th style="padding: 10px; font-size: 11px;">Who Meet</th>
                    <th style="padding: 10px; font-size: 11px;">Purpose</th>
                    <th style="padding: 10px; text-align: center; font-size: 11px;">In Time</th>
                    <th style="padding: 10px; text-align: center; font-size: 11px;">Out Time</th>
                    <th style="padding: 10px; text-align: center; font-size: 11px;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            `}

            <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
              End of Day Consolidated Visitor Report &bull; Windy Group Administration & Security Desk
            </div>
          </div>
        </div>
      `;

      const subject = `[Windy Group] দৈনিক ভিজিটর রিপোর্ট / Daily Visitor Report (${reportDate}) - Total: ${totalCount}`;

      const transporter = getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${emailSettings.senderName}" <${emailSettings.smtpUser}>`,
          to: recipient,
          subject,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient, totalCount });
      } else {
        console.log(`[Daily Report Email] Daily consolidated report prepared for ${recipient} on ${reportDate}`);
        return res.json({
          success: true,
          mode: "simulated",
          message: `Daily report dispatched to ${recipient}`,
          recipient,
          totalCount,
          previewSubject: subject,
          previewHtml: htmlContent
        });
      }
    } catch (err: any) {
      console.error("Daily report email error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to dispatch daily report email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
