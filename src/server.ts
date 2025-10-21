import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { webhookRouter } from './routes/webhooks';
import { reminderService } from './services/reminderService';

const app = express();

// Twilio sends application/x-www-form-urlencoded by default
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/webhooks', webhookRouter);

// Manual trigger endpoint for reminders (use Vercel Cron to call this)
app.post('/trigger-reminders', async (_req, res) => {
  try {
    await reminderService.sendDailyReminders();
    res.json({ status: 'Reminders triggered successfully' });
  } catch (err) {
    console.error('Error triggering reminders:', err);
    res.status(500).json({ error: 'Failed to trigger reminders' });
  }
});

app.all('/', async (req, res, next) => {
  try {
    if (req.method === 'POST') {
      console.log('POST request received at root URL');
      console.log('Request data:', req.body);
      // Delegate to webhook handler
      return (webhookRouter as any).handle({ ...req, url: '/whatsapp', method: 'POST' }, res, next);
    }
    return res.json({ status: 'WhatsApp Coach API is running', version: '1.0.0' });
  } catch (err) {
    next(err);
  }
});

app.get('/health', (_req, res) => {
  return res.json({ status: 'healthy' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const port = parseInt(process.env.PORT || '5000', 10);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

// Export for Vercel serverless
export default app;


