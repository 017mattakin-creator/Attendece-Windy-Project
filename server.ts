import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "email-config.json");

interface EmailSettings {
  currentUserEmail: string;       // User/operator email making the entry
  currentUserName: string;        // User/operator name
  adminEmail: string;              // Admin email receiving instant notifications
  superAdminEmail: string;         // Super Admin email receiving end-of-day list
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
}

// Default configuration with user's verified email
let emailSettings: EmailSettings = {
  currentUserEmail: process.env.CURRENT_USER_EMAIL || "017mattakin@gmail.com",
  currentUserName: process.env.CURRENT_USER_NAME || "Gate Security Operator",
  adminEmail: process.env.ADMIN_EMAIL || "017mattakin@gmail.com",
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || "017mattakin@gmail.com",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpSecure: process.env.SMTP_SECURE === "true" || false,
};

// Load saved configuration from file if exists
try {
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    emailSettings = { ...emailSettings, ...parsed };
  }
} catch (e) {
  console.warn("Could not read email-config.json, using defaults:", e);
}

function saveConfigToFile() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(emailSettings, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist email-config.json:", e);
  }
}

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

  // Get current role & email routing configuration
  app.get("/api/email-config", (req, res) => {
    res.json({
      currentUserEmail: emailSettings.currentUserEmail,
      currentUserName: emailSettings.currentUserName,
      adminEmail: emailSettings.adminEmail,
      superAdminEmail: emailSettings.superAdminEmail,
      smtpConfigured: Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.smtpPass),
      smtpHost: emailSettings.smtpHost || "Not Configured (Preview / Direct Mode)",
      smtpPort: emailSettings.smtpPort,
      smtpUser: emailSettings.smtpUser ? `${emailSettings.smtpUser.substring(0, 3)}***` : "None"
    });
  });

  // Update role & email routing configuration
  app.post("/api/email-config", (req, res) => {
    const { 
      currentUserEmail, 
      currentUserName, 
      adminEmail, 
      superAdminEmail, 
      smtpHost, 
      smtpPort, 
      smtpUser, 
      smtpPass, 
      smtpSecure 
    } = req.body;

    if (currentUserEmail !== undefined) emailSettings.currentUserEmail = String(currentUserEmail).trim();
    if (currentUserName !== undefined) emailSettings.currentUserName = String(currentUserName).trim();
    if (adminEmail !== undefined) emailSettings.adminEmail = String(adminEmail).trim();
    if (superAdminEmail !== undefined) emailSettings.superAdminEmail = String(superAdminEmail).trim();

    if (smtpHost !== undefined) emailSettings.smtpHost = String(smtpHost).trim();
    if (smtpPort !== undefined) emailSettings.smtpPort = parseInt(smtpPort, 10) || 587;
    if (smtpUser !== undefined) emailSettings.smtpUser = String(smtpUser).trim();
    if (smtpPass !== undefined) emailSettings.smtpPass = String(smtpPass).trim();
    if (smtpSecure !== undefined) emailSettings.smtpSecure = Boolean(smtpSecure);

    saveConfigToFile();

    res.json({
      success: true,
      message: "Email routing & role settings updated successfully",
      config: {
        currentUserEmail: emailSettings.currentUserEmail,
        currentUserName: emailSettings.currentUserName,
        adminEmail: emailSettings.adminEmail,
        superAdminEmail: emailSettings.superAdminEmail,
        smtpConfigured: Boolean(emailSettings.smtpHost && emailSettings.smtpUser && emailSettings.smtpPass)
      }
    });
  });

  // Send Test Email to test Admin or Super Admin connectivity
  app.post("/api/email/test", async (req, res) => {
    try {
      const recipient = req.body.recipient || emailSettings.adminEmail;
      const targetRole = req.body.targetRole || "Admin";
      const transporter = getTransporter();

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <div style="background-color: #1e293b; color: #ffffff; padding: 18px 24px;">
            <h2 style="margin: 0; font-size: 18px;">WINDY GROUP - VISITOR SYSTEM</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Role Verification Test Email / টেস্ট ইমেইল</p>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 14px; color: #334155; margin-top: 0;">
              This is a test notification verifying the role routing setup:
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 14px; font-size: 13px; color: #1e293b; line-height: 1.6;">
              <div><strong>Target Role:</strong> ${targetRole}</div>
              <div><strong>Recipient Email:</strong> ${recipient}</div>
              <div><strong>Active Operator (Sender):</strong> ${emailSettings.currentUserName} (${emailSettings.currentUserEmail})</div>
              <div><strong>Admin Email:</strong> ${emailSettings.adminEmail}</div>
              <div><strong>Super Admin Email:</strong> ${emailSettings.superAdminEmail}</div>
              <div><strong>Timestamp:</strong> ${new Date().toLocaleString()}</div>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 16px;">
              System is ready: instant alerts route to Admin, and end-of-day lists route to Super Admin.
            </p>
          </div>
        </div>
      `;

      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${emailSettings.currentUserName} (Windy Gate)" <${emailSettings.smtpUser || emailSettings.currentUserEmail}>`,
          to: recipient,
          replyTo: emailSettings.currentUserEmail,
          subject: `[Test] Windy Group Role Test for ${targetRole} - ${new Date().toLocaleTimeString()}`,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient });
      } else {
        console.log(`[Email Simulation] Test email prepared for ${recipient}:`);
        return res.json({
          success: true,
          mode: "simulated",
          message: `Test email verified for ${targetRole} (${recipient})`,
          recipient,
          previewHtml: htmlContent
        });
      }
    } catch (err: any) {
      console.error("Test email error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to send test email" });
    }
  });

  // 1. Instant Notification: User -> Admin Email
  app.post("/api/visitors/notify", async (req, res) => {
    try {
      const { visitor, senderEmail, senderName, adminEmail, actionType = "checkin" } = req.body;
      if (!visitor) {
        return res.status(400).json({ success: false, error: "Visitor data is required" });
      }

      // Sender is current user/operator
      const activeSenderEmail = senderEmail || emailSettings.currentUserEmail;
      const activeSenderName = senderName || emailSettings.currentUserName;

      // Recipient is Admin email set in settings
      const targetAdminEmail = adminEmail || emailSettings.adminEmail;

      const isExit = actionType === "checkout" || Boolean(visitor.out_time);

      const actionTitle = isExit 
        ? "ভিজিটর প্রস্থান বিজ্ঞপ্তি / Visitor Exit Alert" 
        : "ভিজিটর আগমন বিজ্ঞপ্তি / New Visitor Arrival Alert";

      const subject = isExit
        ? `[Windy Group] ভিজিটর প্রস্থান: ${visitor.company_name} - ${visitor.visitor_name || 'Visitor'} (By: ${activeSenderName})`
        : `[Windy Group] নতুন ভিজিটর আগমন: ${visitor.company_name} - ${visitor.visitor_name || 'Visitor'} (By: ${activeSenderName})`;

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

          <!-- Routing Banner: From User -> To Admin -->
          <div style="background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; padding: 10px 24px; font-size: 12px; color: #334155; line-height: 1.5;">
            <div><strong>👤 প্রেরক ইউজার (Sent by User):</strong> ${activeSenderName} &lt;<span style="color: #0369a1;">${activeSenderEmail}</span>&gt;</div>
            <div><strong>🎯 প্রাপক এডমিন (Sent to Admin):</strong> <span style="font-weight: bold; color: #1e293b;">${targetAdminEmail}</span></div>
          </div>

          <!-- Alert Badge -->
          <div style="background-color: ${isExit ? '#f8fafc' : '#fef3c7'}; border-bottom: 1px solid ${isExit ? '#e2e8f0' : '#fde68a'}; padding: 10px 24px; font-size: 12px; font-weight: bold; color: ${isExit ? '#475569' : '#92400e'};">
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
              This notification was generated automatically upon visitor entry at the gate by <strong>${activeSenderName}</strong> and routed to Admin.
            </div>
          </div>
        </div>
      `;

      const transporter = getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${activeSenderName} via Windy Gate" <${emailSettings.smtpUser || activeSenderEmail}>`,
          to: targetAdminEmail,
          replyTo: activeSenderEmail,
          subject,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient: targetAdminEmail, sender: activeSenderEmail });
      } else {
        console.log(`[Email Notification] From: ${activeSenderEmail} (${activeSenderName}) -> To: ${targetAdminEmail} for ${visitor.company_name}`);
        return res.json({
          success: true,
          mode: "simulated",
          message: `Instant notification dispatched from User (${activeSenderName} <${activeSenderEmail}>) to Admin (${targetAdminEmail})`,
          recipient: targetAdminEmail,
          sender: activeSenderEmail,
          senderName: activeSenderName,
          previewSubject: subject,
          previewHtml: htmlContent
        });
      }
    } catch (err: any) {
      console.error("Visitor notify error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to dispatch notification" });
    }
  });

  // 2. End-of-Day Consolidated Daily List: Sent to Super Admin
  app.post("/api/visitors/daily-report-email", async (req, res) => {
    try {
      const { 
        date, 
        visitors = [], 
        superAdminEmail, 
        senderEmail, 
        senderName 
      } = req.body;

      const reportDate = date || new Date().toISOString().split('T')[0];
      const targetSuperAdminEmail = superAdminEmail || emailSettings.superAdminEmail;
      const activeSenderEmail = senderEmail || emailSettings.currentUserEmail;
      const activeSenderName = senderName || emailSettings.currentUserName;

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
          <div style="background-color: #0f172a; color: #ffffff; padding: 22px 28px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">WINDY GROUP</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #f59e0b; font-weight: bold; text-transform: uppercase;">
                  SUPER ADMIN DAILY VISITOR CONSOLIDATED REPORT / সুপার এডমিন দিন শেষের ভিজিটর রিপোর্ট
                </p>
              </div>
            </div>
            <div style="margin-top: 14px; font-size: 13px; color: #cbd5e1; border-top: 1px solid #334155; padding-top: 10px;">
              <strong>Report Date:</strong> ${reportDate} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleTimeString()}
            </div>
          </div>

          <!-- Role Banner: Sent by User -> To Super Admin -->
          <div style="background-color: #f8fafc; border-bottom: 1px solid #cbd5e1; padding: 12px 28px; font-size: 12px; color: #1e293b; line-height: 1.5;">
            <div><strong>👑 প্রাপক সুপার এডমিন (Sent to Super Admin):</strong> <span style="font-weight: bold; color: #0284c7;">${targetSuperAdminEmail}</span></div>
            <div><strong>👤 প্রস্তুতকারী ইউজার (Submitted by Operator):</strong> ${activeSenderName} &lt;<span style="color: #64748b;">${activeSenderEmail}</span>&gt;</div>
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
                No visitors registered for date: ${reportDate}.
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
              Super Admin End-of-Day Visitor Audit Log &bull; Windy Group Administration & Security Desk
            </div>
          </div>
        </div>
      `;

      const subject = `[Windy Group] দিন শেষের ভিজিটর রিপোর্ট (Super Admin EOD List) - ${reportDate} - Total: ${totalCount}`;

      const transporter = getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: `"${activeSenderName} (Windy Gate)" <${emailSettings.smtpUser || activeSenderEmail}>`,
          to: targetSuperAdminEmail,
          replyTo: activeSenderEmail,
          subject,
          html: htmlContent,
        });
        return res.json({ success: true, mode: "smtp", messageId: info.messageId, recipient: targetSuperAdminEmail, totalCount, sender: activeSenderEmail });
      } else {
        console.log(`[Daily Report Email] EOD list dispatched to Super Admin (${targetSuperAdminEmail}) by User (${activeSenderEmail})`);
        return res.json({
          success: true,
          mode: "simulated",
          message: `EOD Visitor Report dispatched to Super Admin (${targetSuperAdminEmail}) by User (${activeSenderName} <${activeSenderEmail}>)`,
          recipient: targetSuperAdminEmail,
          sender: activeSenderEmail,
          senderName: activeSenderName,
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
