import express, { Request, Response } from 'express';
import { webhookRouter } from '@/routes/webhooks';
import { reminderService } from '@/services/reminderService';

const app = express();

// Twilio sends application/x-www-form-urlencoded by default
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/webhooks', webhookRouter);

// Manual trigger endpoint for reminders (use Vercel Cron to call this)
app.post('/trigger-reminders', async (_req: Request, res: Response) => {
  try {
    await reminderService.sendDailyReminders();
    res.json({ status: 'Reminders triggered successfully' });
  } catch (err) {
    console.error('Error triggering reminders:', err);
    res.status(500).json({ error: 'Failed to trigger reminders' });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'healthy' });
});

app.all('/', async (req: Request, res: Response) => {
  try {
    if (req.method === 'POST') {
      console.log('POST request received at root URL');
      console.log('Request data:', req.body);
      // Delegate to webhook handler
      req.url = '/webhooks/whatsapp';
      return webhookRouter(req, res, () => {});
    }
    return res.json({ status: 'WhatsApp Coach API is running', version: '1.0.0' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
