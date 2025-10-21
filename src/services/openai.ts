import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

export type DailyCheckin = {
  // Previous day activities and routine
  previous_day_activities?: string;
  previous_day_routine?: string;
  previous_day_highlights?: string;
  previous_day_challenges?: string;
  
  // Current state
  current_mood?: string;
  current_energy_level?: string;
  current_motivation?: string;
  
  // Sleep and wellness (optional)
  sleep_hours?: number;
  sleep_quality?: string;
  
  // Today's plans and intentions
  today_plans?: string;
  today_priorities?: string[];
  today_goals?: string[];
  
  // General notes and reflections
  notes?: string;
  reflections?: string;
  concerns?: string;
};

export type MorningCheckin = DailyCheckin; // Keep backward compatibility

export type GoalBreakdownInput = {
  type: 'weekly' | 'monthly';
  start_date: string;
  end_date: string;
  description: string;
};

export class OpenAIService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY must be set in environment variables');
    this.client = new OpenAI({ apiKey });
  }

  parseMorningCheckin(message: string): MorningCheckin | null {
    try {
      // Try the old strict format first for backward compatibility
      const pattern = /Sleep\s+(\d+(?:\.\d+)?)h?\s*\|\s*Mood\s+(\d+)\s*\|\s*Energy\s+(\d+)\s*\|\s*Notes:\s*(.+)/i;
      const match = message.match(pattern);
      if (match) {
        const sleep = parseFloat(match[1]);
        const mood = parseInt(match[2], 10);
        const energy = parseInt(match[3], 10);
        const notes = match[4].trim();
        return { 
          sleep_hours: sleep, 
          current_mood: mood.toString(), 
          current_energy_level: energy.toString(), 
          notes 
        };
      }
      return null;
    } catch (err) {
      console.error('Error parsing morning check-in:', err);
      return null;
    }
  }

  // Helper function to detect if a message is likely a daily check-in
  private isLikelyCheckin(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Check for daily check-in keywords and patterns
    const checkinKeywords = [
      'yesterday', 'today', 'morning', 'check-in', 'checkin', 'routine', 'activities',
      'sleep', 'mood', 'energy', 'plan', 'goals', 'priorities', 'reflection',
      'did', 'accomplished', 'completed', 'worked on', 'focused on'
    ];
    
    const hasCheckinKeywords = checkinKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Check for time-related patterns
    const timePatterns = [
      /\b(yesterday|today|this morning|last night)\b/i,
      /\b(slept|woke up|got up)\b/i,
      /\b(plan|plans|going to|want to|need to)\b/i,
      /\b(did|accomplished|completed|worked on)\b/i
    ];
    
    const hasTimePatterns = timePatterns.some(pattern => pattern.test(message));
    
    // Check for reflection patterns
    const reflectionPatterns = [
      /\b(feeling|felt|was|were)\b/i,
      /\b(good|bad|great|tired|energetic|motivated)\b/i,
      /\b(challenge|difficult|easy|struggled|succeeded)\b/i
    ];
    
    const hasReflectionPatterns = reflectionPatterns.some(pattern => pattern.test(message));
    
    // It's likely a check-in if it has check-in keywords OR time patterns OR reflection patterns
    return hasCheckinKeywords || hasTimePatterns || hasReflectionPatterns;
  }

  async parseMorningCheckinFlexible(message: string): Promise<MorningCheckin | null> {
    // First try strict format via regex
    const strict = this.parseMorningCheckin(message);
    if (strict) return strict;

    // Quick check: if message doesn't look like a check-in, return null immediately
    if (!this.isLikelyCheckin(message)) {
      return null;
    }

    try {
      const systemPrompt = `You are a helpful assistant that extracts structured information from natural language daily check-ins and reflections.

Extract information from the user's message and return ONLY a JSON object with these optional fields:
- previous_day_activities: What they did yesterday
- previous_day_routine: Their routine or schedule from yesterday
- previous_day_highlights: Positive things that happened yesterday
- previous_day_challenges: Difficulties or challenges from yesterday
- current_mood: How they're feeling today (descriptive, not numeric)
- current_energy_level: Their energy level today (descriptive, not numeric)
- current_motivation: Their motivation level today
- sleep_hours: Hours of sleep (number only if mentioned)
- sleep_quality: Quality of sleep (descriptive)
- today_plans: What they plan to do today
- today_priorities: Array of priority items for today
- notes: General notes or thoughts
- reflections: Personal reflections or insights
- concerns: Any concerns or worries

Only include fields that are clearly mentioned or can be reasonably inferred. If a field isn't mentioned, don't include it in the JSON. Return null if the message doesn't contain any check-in information.`;

      const userPrompt = `Extract check-in information from this message: ${message}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0,
      });

      const raw = response.choices[0]?.message?.content?.trim() || '';
      if (!raw || raw.toLowerCase() === 'null') return null;

      // Attempt to isolate JSON in case the model adds formatting
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : raw;

      const data = JSON.parse(jsonString) as Partial<DailyCheckin>;

      if (data == null) return null;

      // Validate that we have at least some meaningful content
      const hasContent = Object.values(data).some(value => 
        value && (typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : true)
      );

      if (!hasContent) return null;

      return data as DailyCheckin;
    } catch (err) {
      console.error('LLM parsing error for daily check-in:', err);
      return null;
    }
  }

  async generateDailyPlan(
    checkin: DailyCheckin,
    userName?: string,
    goalContext?: string,
    recentCheckIns?: any[]
  ): Promise<string> {
    try {
      // Analyze recent trends if available
      let trendInsight = '';
      if (recentCheckIns && recentCheckIns.length > 0) {
        const recentData = recentCheckIns
          .filter(log => log.checkin_json)
          .map(log => ({
            date: log.date,
            data: log.checkin_json as DailyCheckin
          }))
          .slice(0, 3); // Last 3 days max

        if (recentData.length > 0) {
          trendInsight = '\n\nRecent patterns (last few days):\n';
          recentData.forEach(({ date, data }) => {
            trendInsight += `${date}: `;
            const parts = [];
            if (data.sleep_hours) parts.push(`Sleep: ${data.sleep_hours}h`);
            if (data.current_mood) parts.push(`Mood: ${data.current_mood}`);
            if (data.current_energy_level) parts.push(`Energy: ${data.current_energy_level}`);
            if (data.today_plans) parts.push(`Plans: ${data.today_plans.substring(0, 50)}...`);
            trendInsight += parts.join(', ') + '\n';
          });
        }
      }

      const systemPrompt = `You are a supportive, insightful life coach and behavior change specialist. Your role is to help users create actionable daily plans based on their check-ins, previous day activities, and long-term goals.

Key principles:
- Be encouraging but realistic and direct
- Provide specific, actionable advice
- Consider their previous day activities and current state
- Connect their daily activities to their long-term goals
- Identify patterns and suggest improvements
- Flag concerning patterns (poor sleep, low energy, missed goals)
- Suggest course corrections based on trends
- Keep responses comprehensive but concise
- End with motivation and encouragement

Format your response as a personalized daily plan with:
1. Previous Day Reflection (brief analysis of what they shared)
2. Today's Focus Areas (3-4 specific priorities based on their plans and goals)
3. Behavior Insights (patterns you notice and recommendations)
4. Goal Alignment (how today connects to their long-term goals)
5. Motivational Closing

If you notice concerning patterns or they mention challenges, address them prominently with supportive solutions.`;

      // Build comprehensive user prompt with all available information
      let userPrompt = `Based on this daily check-in, create a personalized plan:\n\n`;

      // Previous day information
      if (checkin.previous_day_activities) {
        userPrompt += `Previous day activities: ${checkin.previous_day_activities}\n`;
      }
      if (checkin.previous_day_routine) {
        userPrompt += `Previous day routine: ${checkin.previous_day_routine}\n`;
      }
      if (checkin.previous_day_highlights) {
        userPrompt += `Previous day highlights: ${checkin.previous_day_highlights}\n`;
      }
      if (checkin.previous_day_challenges) {
        userPrompt += `Previous day challenges: ${checkin.previous_day_challenges}\n`;
      }

      // Current state
      if (checkin.current_mood) {
        userPrompt += `Current mood: ${checkin.current_mood}\n`;
      }
      if (checkin.current_energy_level) {
        userPrompt += `Current energy: ${checkin.current_energy_level}\n`;
      }
      if (checkin.current_motivation) {
        userPrompt += `Current motivation: ${checkin.current_motivation}\n`;
      }

      // Sleep information
      if (checkin.sleep_hours) {
        userPrompt += `Sleep: ${checkin.sleep_hours} hours`;
        if (checkin.sleep_quality) {
          userPrompt += ` (${checkin.sleep_quality})`;
        }
        userPrompt += '\n';
      }

      // Today's plans
      if (checkin.today_plans) {
        userPrompt += `Today's plans: ${checkin.today_plans}\n`;
      }
      if (checkin.today_priorities && checkin.today_priorities.length > 0) {
        userPrompt += `Today's priorities: ${checkin.today_priorities.join(', ')}\n`;
      }
      if (checkin.today_goals && checkin.today_goals.length > 0) {
        userPrompt += `Today's goals: ${checkin.today_goals.join(', ')}\n`;
      }

      // Notes and reflections
      if (checkin.notes) {
        userPrompt += `Notes: ${checkin.notes}\n`;
      }
      if (checkin.reflections) {
        userPrompt += `Reflections: ${checkin.reflections}\n`;
      }
      if (checkin.concerns) {
        userPrompt += `Concerns: ${checkin.concerns}\n`;
      }

      userPrompt += `\n${trendInsight || '(No recent check-in history available)'}\n`;

      if (userName) {
        userPrompt += `\nUser's name: ${userName}`;
      }
      if (goalContext) {
        userPrompt += `\n\nLong-term goal context:\n${goalContext}`;
      }

      userPrompt += `\n\nPlease provide a comprehensive daily plan that connects their previous day activities to today's goals and their long-term objectives.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content?.trim() || 'Unable to generate a plan right now.';
    } catch (err) {
      console.error('Error generating daily plan:', err);
      return "I'm having trouble generating your daily plan right now. Please try again later.";
    }
  }

  async generateGeneralResponse(message: string, userName?: string, activeGoals?: any[]): Promise<string> {
    try {
      const systemPrompt = `You are a supportive, insightful life coach and behavior change specialist who helps users with daily wellness, goal achievement, and personal development.

Your role is to:
- Provide helpful, encouraging advice for general questions
- Help users with motivation, productivity, wellness, and behavior change
- Be conversational and supportive while staying focused on actionable advice
- Help users understand how to track their daily activities and progress
- Guide users on setting and achieving their goals
- Provide insights on building better habits and routines
- Keep responses concise but meaningful and actionable

You are a comprehensive life coach who can help with various topics including:
- Daily planning and productivity
- Habit formation and behavior change
- Goal setting and achievement
- Wellness and self-care
- Motivation and mindset
- Time management and routines

If someone asks about daily check-ins, explain that they can share their previous day activities, current state, and today's plans in natural language.
If someone asks about goal setting tell them the format for setting a goal is: "Goal: <goal> | Reason: <reason> | Timeline: <timeline>". just the format, no explanation.
User's active goals are ${activeGoals ? activeGoals.map(g => g.main_goal).join(', ') : 'none'}.`;

      const userPrompt = `User message: ${message}

${userName ? `User's name: ${userName}` : ''}

Respond as their supportive life coach and behavior change specialist. Provide helpful advice or answer their question. If they're asking about daily check-ins, explain that they can share their previous day activities, current mood/energy, and today's plans in natural language.`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o', // Use GPT-4o
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content?.trim() || 'I\'m here to help! How can I support you today?';
    } catch (err) {
      console.error('Error generating general response:', err);
      return "I'm here to help! How can I support you today?";
    }
  }

  async generateGoalBreakdowns(
    mainGoal: string,
    timeline: string | null
  ): Promise<GoalBreakdownInput[]> {
    try {
      const systemPrompt = `You are a helpful coach assistant. Given a user's main goal and timeline, break it down into a concise series of 6-8 key weekly or monthly milestones.
Return ONLY a JSON array. Each item should have:
- type ('weekly' or 'monthly'),
- start_date (YYYY-MM-DD),
- end_date (YYYY-MM-DD),
- description (short, actionable milestone).
NO explanation, NO prose, NO markdown. If you do not return a valid JSON array, your answer will be discarded.`;

      const userPrompt = `Main goal: ${mainGoal}
Timeline: ${timeline || 'unspecified'}

Generate a breakdown into weekly and monthly milestones.`;

      let response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.5,
      });

      let raw = response.choices[0]?.message?.content?.trim() || '';
      let jsonMatch = raw.match(/\[[\s\S]*\]/);
      let jsonString = jsonMatch ? jsonMatch[0] : raw;

      try {
        const breakdowns = JSON.parse(jsonString) as GoalBreakdownInput[];
        return breakdowns;
      } catch (err) {
        // Retry with a stricter prompt if parsing fails
        const retryPrompt = `Your previous response was not valid JSON. Please return ONLY a JSON array as described, with no explanation or extra text.`;
        response = await this.client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            { role: 'user', content: retryPrompt },
          ],
          max_tokens: 800,
          temperature: 0.3,
        });
        raw = response.choices[0]?.message?.content?.trim() || '';
        jsonMatch = raw.match(/\[[\s\S]*\]/);
        jsonString = jsonMatch ? jsonMatch[0] : raw;
        try {
          const breakdowns = JSON.parse(jsonString) as GoalBreakdownInput[];
          return breakdowns;
        } catch (err2) {
          console.error('Error generating goal breakdowns (retry):', err2, 'Raw:', raw);
          return [];
        }
      }
    } catch (err) {
      console.error('Error generating goal breakdowns:', err);
      return [];
    }
  }

  async generateWeeklyReport(summaryData: {
    checkinsThisWeek: number;
    checkinsLastWeek: number;
    completenessRate: number;
    streak: number;
    logsThisWeek: any[];
    logsLastWeek: any[];
    activeGoals: any[];
    goalBreakdowns: Record<number, any[]>;
  }): Promise<string> {
    const { checkinsThisWeek, checkinsLastWeek, completenessRate, streak, logsThisWeek, activeGoals, goalBreakdowns } = summaryData;

    const systemPrompt = `
You are a world-class motivational coach. Given a user's weekly check-in data and goals, generate a concise, supportive, and zero-shame weekly report for WhatsApp.

Available data sources:
- Daily check-ins (with mood, energy, sleep, notes).
- Daily logs (one check-in JSON per day).
- Active goals and their weekly/monthly milestones.

Only use what is provided; do not invent unavailable metrics like protein, caffeine, workouts, etc.

The report must follow this structure exactly (in this order):

1) TL;DR (2–3 bullets max)
   - One-line headline about the week.
   - Biggest win.
   - Biggest drag.
   - One priority for next week.

2) Scores & Streaks
   - Logging completeness for the past 7 days (out of 7).
   - Longest streak of consecutive days with check-ins this week.
   - If available in logs, include average Mood, Energy, and short summary of Sleep or Notes in this format:
     "Sleep: _h avg | Mood: _ | Energy: _ | Notes: _"
   - If values are missing, gracefully omit.

3) This Week vs Last Week
   - Compare total check-ins (out of 7 possible logs) for this week vs last week.
   - Add a short encouraging remark if the user improved or stayed consistent.

4) Top 3 Insights
   - Concise points linking check-in consistency and behavior to their goals/milestones.
   - Example: "You logged 5 days this week → better alignment with your marathon prep."
   - Keep them evidence-based and motivational.

5) Next Week Playbook (3 bullets)
   - Do More: [encouraging nudge based on check-ins/goals].
   - Do Less: [behavior to reduce, e.g. missed weekend logs].
   - Try: [one simple micro-experiment or focus item for next week].

Tone guidelines:
- Always be supportive, motivating, and zero-shame.
- Keep it crisp, WhatsApp-friendly, and action-oriented.
`;

    const userPrompt = `
User's active goals and milestones:
${activeGoals.map((goal, i) => {
  const breakdowns = goalBreakdowns[goal.id] || [];
  return `${i + 1}. ${goal.main_goal}${goal.timeline ? ` (by ${goal.timeline})` : ''}\n   Milestones: ${breakdowns.map(b => b.description).join('; ')}`;
}).join('\n')}

Check-in stats:
- check-ins this week: ${checkinsThisWeek} out of 7 (${completenessRate}%)
- Longest streak: ${streak} days
- Last week check-ins: ${checkinsLastWeek} out of 7

Raw logs (this week):
${logsThisWeek.map(l => 
  `Date: ${l.date}, Check-in: ${l.checkin_json ? JSON.stringify(l.checkin_json) : 'no'}`
).join('\n')}
`;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.1,
      });

      return response.choices[0]?.message?.content?.trim() || 'Sorry, could not generate report.';
    } catch (err) {
      console.error('Error generating weekly report:', err);
      return 'Sorry, there was a problem generating your weekly report.';
    }
  }
}

export const openAIService = new OpenAIService();


