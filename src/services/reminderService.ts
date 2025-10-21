import { db } from './db';
import { twilioService } from './twilio';

export class ReminderService {
  async sendDailyReminders(): Promise<void> {
    try {
      console.log('Starting daily reminder check...');

      const users = await db.getAllUsers();
      console.log(`Found ${users.length} users to check`);

      const today = new Date().toISOString().slice(0, 10);
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toISOString().slice(0, 10);

      for (const user of users) {
        try {
          const todayCheckin = await db.getDailyLog(user.id, today);
          const yesterdayCheckin = await db.getDailyLog(user.id, yesterday);

          if (!todayCheckin && !yesterdayCheckin) {
            await this.sendReminderMessage(user.phone, user.name || undefined, user.id);
          }
        } catch (err) {
          console.error(`Error sending reminder for user ${user.id}:`, err);
        }
      }

      console.log('Daily reminder check completed');
    } catch (err) {
      console.error('Error in sendDailyReminders:', err);
    }
  }

  private async sendReminderMessage(phone: string, name: string | undefined, userId: number): Promise<void> {
    const friendlyName = name || 'there';
    const message = `Hi ${friendlyName}! 👋\n\nIt's been a while since your last check-in. How are you doing today? I'm here to help you stay on track with your goals!\n\nJust send me a message about how you're feeling and what you'd like to accomplish today. 😊`;

    const sid = await twilioService.sendWhatsAppMessage(phone, message);
    if (sid) {
      await db.logMessage(userId, 'outbound', message);
    }
  }
}

export const reminderService = new ReminderService();


