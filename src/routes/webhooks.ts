import { Router, Request, Response } from 'express';
import { twilioService } from '../services/twilio';
import { openAIService } from '../services/openai';
import { db } from '../services/db';
import { generateWeeklyReport } from '../services/weeklyReport';

export const webhookRouter = Router();

export const handleWhatsAppWebhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    console.log('--- Request received at WhatsApp webhook ---');
    const messageData = twilioService.parseIncomingMessage(req.body as Record<string, string>);
    console.log('Parsed message data:', messageData);
    if (!messageData.from || !messageData.body) {
      console.log('Invalid message data');
      return res.status(400).json({ error: 'Invalid message data' });
    }

    const phone = messageData.from;
    const messageBody = messageData.body;
    console.log(`Received message from ${phone}: ${messageBody}`);

    let user = await db.getUserByPhone(phone);
    if (!user) {
      console.log(`User not found. Creating new user for phone: ${phone}`);
      const name = (messageData.profile_name || '').trim();
      user = await db.createUser(phone, name ? name : null);
      console.log('New user created:', user);
    } else {
      console.log('User found:', user);
    }

    await db.logMessage(user.id, 'inbound', messageBody);
    console.log('Inbound message logged in DB');

    // Check for weekly report command
    if (/^weekly report$/i.test(messageBody.trim())) {
      console.log('Weekly report command detected');
      const report = await generateWeeklyReport(user.id);
      await twilioService.sendWhatsAppMessage(phone, report);
      await db.logMessage(user.id, 'outbound', report);
      console.log('Weekly report sent via WhatsApp');
      return res.json({ status: 'Weekly report sent' });
    }

    // 1. Try to detect if this is a goal-setting message
    // Accepts both single-line and multi-line, e.g.:
    // Goal: ... | Reason: ... | Timeline: ...
    // or
    // Goal: ...\nReason: ...\nTimeline: ...
    const goalPattern = /Goal\s*:\s*(.+?)(?:\s*\||\n|$)\s*Reason\s*:\s*(.+?)(?:\s*\||\n|$)\s*Timeline\s*:\s*(.+)/is;
    const goalMatch = messageBody.match(goalPattern);

    let responseMessage: string;

    if (goalMatch) {
      // Extract fields
      const main_goal = goalMatch[1].trim();
      const reason = goalMatch[2].trim();
      const timeline = goalMatch[3].trim();
      console.log('Goal detected:', { main_goal, reason, timeline });
      try {
        // Set main goal in DB
        const goal = await db.setMainGoal(user.id, main_goal, reason || null, timeline || null);
        console.log('Goal saved to DB:', goal);
        // Generate breakdowns with LLM
        console.log('Calling OpenAI to generate breakdowns...');
        const breakdowns = await openAIService.generateGoalBreakdowns(main_goal, timeline || null);
        console.log('OpenAI breakdowns response:', breakdowns);
        // Store breakdowns in DB
        if (breakdowns.length > 0) {
          const breakdownsWithGoalId = breakdowns.map(b => ({ ...b, goal_id: goal.id }));
          await db.addGoalBreakdowns(goal.id, breakdownsWithGoalId);
          console.log(`Breakdowns saved in DB for goal ${goal.id}`);
        }
        responseMessage = `Your main goal has been set!\nGoal: ${main_goal}\nReason: ${reason}\nTimeline: ${timeline}\nMilestones have been generated. You can now send your daily check-ins!`;
      } catch (err) {
        console.error('Error saving goal from WhatsApp:', err);
        responseMessage = 'Sorry, there was a problem saving your goal. Please try again.';
      }
    } else {
      // 2. Try to parse as check-in
      console.log('No goal detected. Trying to parse as check-in...');
      let checkin = openAIService.parseMorningCheckin(messageBody);
      if (!checkin) {
        console.log('Falling back to flexible check-in parser...');
        checkin = await openAIService.parseMorningCheckinFlexible(messageBody);
      }
      console.log('Check-in parsed:', JSON.stringify(checkin, null, 2));

      if (checkin) {
        const today = new Date().toISOString().slice(0, 10);
        await db.createDailyLog(user.id, today, checkin);
        console.log('Daily check-in saved in DB');

        // Fetch recent check-ins for trend analysis
        const recentCheckIns = await db.getRecentCheckIns(user.id, 4);
        console.log('Recent check-ins fetched:', recentCheckIns.length);

        // Fetch all active goals and their breakdowns
        const activeGoals = await db.getActiveGoals(user.id);
        console.log('Active goals fetched:', activeGoals);

        let goalContext = '';
        if (activeGoals.length > 0) {
          goalContext = 'Goals:\n';
          for (let i = 0; i < activeGoals.length; i++) {
            const goal = activeGoals[i];
            const breakdowns = await db.getGoalBreakdowns(goal.id);
            const relevant = breakdowns.filter(b =>
              today >= b.start_date && today <= b.end_date
            );
            const milestone = relevant.length > 0
              ? ` (current milestone: ${relevant.map(b => b.description).join('; ')})`
              : '';
            goalContext += `${i + 1}. ${goal.main_goal}${goal.timeline ? ' by ' + goal.timeline : ''}${milestone}\n`;
          }
        }

        console.log('Calling OpenAI to generate daily plan with trend analysis...');
        const dailyPlan = await openAIService.generateDailyPlan(
          checkin,
          user.name || undefined,
          goalContext || undefined,
          recentCheckIns
        );
        console.log('OpenAI daily plan response:', dailyPlan);

        responseMessage = `Here's your personalized daily plan based on your check-in and recent patterns:\n\n${dailyPlan}`;
      } else {
        // 3. Fallback: general response
        console.log('Falling back to general OpenAI response...');
        // Fetch all active goals and their breakdowns
        const activeGoals = await db.getActiveGoals(user.id);
        console.log('Active goals fetched:', activeGoals);
        responseMessage = await openAIService.generateGeneralResponse(messageBody, user.name || undefined, activeGoals);
        console.log('OpenAI general response:', responseMessage);
      }
    }

    console.log('Sending WhatsApp response via Twilio...');
    const messageSid = await twilioService.sendWhatsAppMessage(phone, responseMessage);
    if (messageSid) {
      await db.logMessage(user.id, 'outbound', responseMessage);
      console.log(`Response sent successfully: ${messageSid}`);
    } else {
      console.log('Failed to send response');
    }

    console.log('--- Webhook flow complete ---');
    return res.json({ status: 'success', message_sid: messageSid });
  } catch (err) {
    console.error('Error processing webhook:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Set main goal and generate breakdowns
webhookRouter.post('/set-goal', async (req, res) => {
  console.log('--- /set-goal API called ---');
  try {
    const { phone, main_goal, reason, timeline } = req.body;
    if (!phone || !main_goal) {
      return res.status(400).json({ error: 'phone and main_goal are required' });
    }

    // Find or create user
    let user = await db.getUserByPhone(phone);
    if (!user) {
      user = await db.createUser(phone, null);
    }

    // Set main goal in DB
    const goal = await db.setMainGoal(user.id, main_goal, reason || null, timeline || null);

    // Generate breakdowns with LLM
    const breakdowns = await openAIService.generateGoalBreakdowns(main_goal, timeline || null);

    // Store breakdowns in DB
    if (breakdowns.length > 0) {
      const breakdownsWithGoalId = breakdowns.map(b => ({ ...b, goal_id: goal.id }));
      await db.addGoalBreakdowns(goal.id, breakdownsWithGoalId);
    }

    return res.json({
      status: 'success',
      goal,
      breakdowns,
    });
  } catch (err) {
    console.error('Error in /set-goal:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

webhookRouter.post('/whatsapp', handleWhatsAppWebhook);

webhookRouter.get('/whatsapp', (_req: Request, res: Response) => {
  return res.json({ status: 'WhatsApp webhook endpoint is active' });
});
