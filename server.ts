import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from 'resend';

// Lazy initialize Resend to avoid crashing if API key is missing at startup
let resendClient: Resend | null = null;

function getResend() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      // In a real app, we'd log this or handle it, but we'll throw to inform developers in console
      console.warn("RE-SEND API: RESEND_API_KEY is missing. Emails will not be sent.");
      return null;
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending email reports
  app.post("/api/send-report", async (req, res) => {
    const { to, subject, html, resendApiKey } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing required fields: to, subject, html" });
    }

    // Use user-provided API key or fallback to environment variable
    const activeKey = resendApiKey || process.env.RESEND_API_KEY;

    if (!activeKey) {
      return res.status(400).json({ 
        error: "Resend API Key is missing. Please provide one in Settings or contact the administrator." 
      });
    }

    const resend = new Resend(activeKey);

    try {
      const { data, error } = await resend.emails.send({
        from: 'GCash Toolkit <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html,
      });

      if (error) {
        console.error("Resend API Error:", error);
        return res.status(400).json({ error: error.message });
      }

      console.log(`Email successfully sent to ${to}:`, data?.id);
      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      console.error("Failed to send email:", error);
      res.status(500).json({ error: "Failed to send email report." });
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
    const distPath = path.join(process.cwd(), 'dist');
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
