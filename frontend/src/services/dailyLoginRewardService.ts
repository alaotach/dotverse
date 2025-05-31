export interface DailyCheckInReward {
  day: number;
  coins: number;
  claimed: boolean;
  date?: string;
}

export interface DailyCheckInData {
  currentStreak: number;
  lastCheckIn: string | null;
  rewards: DailyCheckInReward[];
  totalCheckIns: number;
}

class DailyCheckInService {
  private storageKey = 'daily_checkin_data';

  private getDefaultRewards(): DailyCheckInReward[] {
    return [
      { day: 1, coins: 100, claimed: false },
      { day: 2, coins: 150, claimed: false },
      { day: 3, coins: 200, claimed: false },
      { day: 4, coins: 250, claimed: false },
      { day: 5, coins: 300, claimed: false },
      { day: 6, coins: 400, claimed: false },
      { day: 7, coins: 500, claimed: false },
    ];
  }

  private getCheckInData(): DailyCheckInData {
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      currentStreak: 0,
      lastCheckIn: null,
      rewards: this.getDefaultRewards(),
      totalCheckIns: 0
    };
  }

  private saveCheckInData(data: DailyCheckInData): void {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  private isToday(dateString: string): boolean {
    const today = new Date().toDateString();
    const date = new Date(dateString).toDateString();
    return today === date;
  }

  private isYesterday(dateString: string): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = new Date(dateString).toDateString();
    return yesterday.toDateString() === date;
  }

  canCheckInToday(): boolean {
    const data = this.getCheckInData();
    if (!data.lastCheckIn) return true;
    return !this.isToday(data.lastCheckIn);
  }

  getCurrentStreak(): number {
    return this.getCheckInData().currentStreak;
  }

  getRewards(): DailyCheckInReward[] {
    return this.getCheckInData().rewards;
  }

  getTotalCheckIns(): number {
    return this.getCheckInData().totalCheckIns;
  }

  checkIn(): { success: boolean; reward: number; newStreak: number } {
    if (!this.canCheckInToday()) {
      return { success: false, reward: 0, newStreak: 0 };
    }

    const data = this.getCheckInData();
    const today = new Date().toISOString();
    let newStreak = 1;
    if (data.lastCheckIn && this.isYesterday(data.lastCheckIn)) {
      newStreak = data.currentStreak + 1;
    }
    if (newStreak > 7) {
      newStreak = 1;
      data.rewards = this.getDefaultRewards();
    }
    const currentDayReward = data.rewards.find(r => r.day === newStreak);
    const rewardAmount = currentDayReward?.coins || 10;
    if (currentDayReward) {
      currentDayReward.claimed = true;
      currentDayReward.date = today;
    }

    data.currentStreak = newStreak;
    data.lastCheckIn = today;
    data.totalCheckIns += 1;

    this.saveCheckInData(data);

    return {
      success: true,
      reward: rewardAmount,
      newStreak
    };
  }

  getNextReward(): number {
    const data = this.getCheckInData();
    const nextDay = data.currentStreak + 1;
    if (nextDay > 7) return this.getDefaultRewards()[0].coins;
    
    const nextReward = data.rewards.find(r => r.day === nextDay);
    return nextReward?.coins || 10;
  }

  resetStreak(): void {
    const data = this.getCheckInData();
    data.currentStreak = 0;
    data.lastCheckIn = null;
    data.rewards = this.getDefaultRewards();
    this.saveCheckInData(data);
  }
}

export const dailyCheckInService = new DailyCheckInService();