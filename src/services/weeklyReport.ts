import { db } from './db';
import { openAIService } from './openai';
import { subDays, format } from 'date-fns';

export async function generateWeeklyReport(userId: number): Promise<string> {
  // 1. Get date range for the past 14 days (for comparison)
  const today = new Date();
  const startOfThisWeek = subDays(today, 6); // 7 days including today
  const startOfLastWeek = subDays(today, 13);

  // 2. Fetch daily logs for the past 14 days (14 days so we can compare weeks)
  const dailyLogs = await db.getDailyLogsInRange(
    userId,
    format(startOfLastWeek, 'yyyy-MM-dd'),
    format(today, 'yyyy-MM-dd')
  );

  // 3. Fetch active goals
  const activeGoals = await db.getActiveGoals(userId);

  // 4. Fetch breakdowns for each active goal
  const goalBreakdowns: Record<number, any[]> = {};
  for (const goal of activeGoals) {
    goalBreakdowns[goal.id] = await db.getGoalBreakdowns(goal.id);
  }

  // Split logs into this week and last week
  const todayStr = format(today, 'yyyy-MM-dd');
  const thisWeekStartStr = format(startOfThisWeek, 'yyyy-MM-dd');
  const lastWeekStartStr = format(startOfLastWeek, 'yyyy-MM-dd');

  const logsThisWeek = dailyLogs.filter(
    log => log.date >= thisWeekStartStr && log.date <= todayStr
  );
  const logsLastWeek = dailyLogs.filter(
    log => log.date >= lastWeekStartStr && log.date < thisWeekStartStr
  );

  // Count check-ins for this week and last week
  function countCheckins(logs: any[]) {
    let count = 0;
    for (const log of logs) {
      if (log.checkin_json) count++;
    }
    return count;
  }

  const checkinsThisWeek = countCheckins(logsThisWeek);
  const checkinsLastWeek = countCheckins(logsLastWeek);

  // Completeness rate (out of 7 possible logs: 7 days)
  const completenessRate = Math.round((checkinsThisWeek / 7) * 100);

  // Longest streak of consecutive days with any check-in
  function longestStreak(logs: any[], weekStart: Date, weekEnd: Date) {
    let streak = 0, maxStreak = 0;
    for (let i = 0; i < 7; i++) {
      const date = format(subDays(weekEnd, 6 - i), 'yyyy-MM-dd');
      const log = logs.find(l => l.date === date);
      if (log && log.checkin_json) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 0;
      }
    }
    return maxStreak;
  }
  const streak = longestStreak(logsThisWeek, startOfThisWeek, today);

  // Prepare summary object for OpenAI
  const summaryData = {
    checkinsThisWeek,
    checkinsLastWeek,
    completenessRate,
    streak,
    logsThisWeek,
    logsLastWeek,
    activeGoals,
    goalBreakdowns,
  };

  // Pass summaryData to OpenAI for report generation
  return await openAIService.generateWeeklyReport(summaryData);
}