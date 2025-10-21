import dotenv from 'dotenv';
dotenv.config();

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type UserRecord = {
  id: number;
  phone: string;
  name: string | null;
  timezone: string;
  created_at: string;
};

export type MessageRecord = {
  id: number;
  user_id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  timestamp: string;
};

export type DailyLogRecord = {
  id: number;
  user_id: number;
  date: string;
  checkin_json: unknown | null;
  created_at: string;
  updated_at: string;
};

export type GoalRecord = {
  id: number;
  user_id: number;
  main_goal: string;
  reason: string | null;
  timeline: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

export type GoalBreakdownRecord = {
  id: number;
  goal_id: number;
  type: 'weekly' | 'monthly';
  start_date: string;
  end_date: string;
  description: string;
  created_at: string;
};

export class DatabaseService {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in environment variables');
    this.client = createClient(url, key);
  }

  async getAllUsers(): Promise<UserRecord[]> {
    try {
      const res = await this.client.from('users').select('*');
      return (res.data as unknown as UserRecord[]) || [];
    } catch (err) {
      console.error('Error getting all users:', err);
      return [];
    }
  }

  private normalizePhone(input: string): string {
    let clean = input.replace('whatsapp:', '').replace(/\s+/g, '').trim();
    if (!clean.startsWith('+')) clean = `+${clean}`;
    return clean;
  }

  async createUser(phone: string, name?: string | null, userTimezone: string = 'UTC'): Promise<UserRecord> {
    try {
      const normalized = this.normalizePhone(phone);
      const existing = await this.client.from('users').select('*').eq('phone', normalized).maybeSingle();
      if (existing.data) return existing.data as unknown as UserRecord;

      const userData = {
        phone: normalized,
        name: name ?? null,
        timezone: userTimezone,
        created_at: new Date().toISOString(),
      };
      const insert = await this.client.from('users').insert(userData).select('*').single();
      return insert.data as unknown as UserRecord;
    } catch (err) {
      console.error('Error creating user:', err);
      throw err;
    }
  }

  async getUserByPhone(phone: string): Promise<UserRecord | null> {
    try {
      const normalized = this.normalizePhone(phone);
      const res = await this.client.from('users').select('*').eq('phone', normalized).maybeSingle();
      return (res.data as unknown as UserRecord) || null;
    } catch (err) {
      console.error('Error getting user:', err);
      return null;
    }
  }

  async logMessage(userId: number, direction: 'inbound' | 'outbound', body: string): Promise<MessageRecord> {
    try {
      const messageData = {
        user_id: userId,
        direction,
        body,
        timestamp: new Date().toISOString(),
      };
      const res = await this.client.from('messages').insert(messageData).select('*').single();
      return res.data as unknown as MessageRecord;
    } catch (err) {
      console.error('Error logging message:', err);
      throw err;
    }
  }

  async createDailyLog(
    userId: number,
    date: string,
    checkin_json?: unknown | null
  ): Promise<DailyLogRecord> {
    try {
      const existing = await this.client
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();

      const logData = {
        user_id: userId,
        date,
        checkin_json: checkin_json ?? null,
        updated_at: new Date().toISOString(),
      };

      if (existing.data) {
        const updated = await this.client
          .from('daily_logs')
          .update(logData)
          .eq('id', (existing.data as any).id)
          .select('*')
          .single();
        return updated.data as unknown as DailyLogRecord;
      } else {
        const toInsert = { ...logData, created_at: new Date().toISOString() };
        const inserted = await this.client.from('daily_logs').insert(toInsert).select('*').single();
        return inserted.data as unknown as DailyLogRecord;
      }
    } catch (err) {
      console.error('Error creating daily log:', err);
      throw err;
    }
  }

  async getDailyLog(userId: number, date: string): Promise<DailyLogRecord | null> {
    try {
      const res = await this.client
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();
      return (res.data as unknown as DailyLogRecord) || null;
    } catch (err) {
      console.error('Error getting daily log:', err);
      return null;
    }
  }

  async getDailyLogsInRange(userId: number, startDate: string, endDate: string): Promise<DailyLogRecord[]> {
    try {
      const res = await this.client
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      return (res.data as unknown as DailyLogRecord[]) || [];
    } catch (err) {
      console.error('Error getting daily logs in range:', err);
      return [];
    }
  }

  async getRecentCheckIns(userId: number, days: number = 4): Promise<DailyLogRecord[]> {
    try {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - days);
      
      console.log(`Fetching recent check-ins for user ${userId} from ${startDate.toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}`);
      
      const res = await this.client
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString().slice(0, 10))
        .lt('date', today.toISOString().slice(0, 10))
        .order('date', { ascending: false });
      
      console.log(`Found ${res.data?.length || 0} recent check-ins:`, res.data);
      return (res.data as unknown as DailyLogRecord[]) || [];
    } catch (err) {
      console.error('Error getting recent check-ins:', err);
      return [];
    }
  }

  // GOALS
  async setMainGoal(userId: number, main_goal: string, reason: string | null, timeline: string | null): Promise<GoalRecord> {
    try {
      // No longer deactivate other goals
      const insert = await this.client.from('goals').insert({
        user_id: userId,
        main_goal,
        reason,
        timeline,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('*').single();

      if (insert.error) {
        console.error('Supabase insert error:', insert.error);
        throw insert.error;
      }
      if (!insert.data) {
        throw new Error('Failed to insert goal, no data returned');
      }
      return insert.data as unknown as GoalRecord;
    } catch (err) {
      console.error('Error setting main goal:', err);
      throw err;
    }
  }

  async getActiveGoals(userId: number): Promise<GoalRecord[]> {
    try {
      const res = await this.client.from('goals').select('*').eq('user_id', userId).eq('is_active', true);
      return (res.data as unknown as GoalRecord[]) || [];
    } catch (err) {
      console.error('Error getting active goals:', err);
      return [];
    }
  }

  async addGoalBreakdowns(goalId: number, breakdowns: Array<Omit<GoalBreakdownRecord, 'id' | 'created_at'>>): Promise<GoalBreakdownRecord[]> {
    try {
      const toInsert = breakdowns.map(b => ({ ...b, created_at: new Date().toISOString() }));
      const res = await this.client.from('goal_breakdowns').insert(toInsert).select('*');
      return res.data as GoalBreakdownRecord[];
    } catch (err) {
      console.error('Error adding goal breakdowns:', err);
      throw err;
    }
  }

  async getGoalBreakdowns(goalId: number): Promise<GoalBreakdownRecord[]> {
    try {
      const res = await this.client.from('goal_breakdowns').select('*').eq('goal_id', goalId);
      return res.data as GoalBreakdownRecord[];
    } catch (err) {
      console.error('Error getting goal breakdowns:', err);
      return [];
    }
  }
}

export const db = new DatabaseService();