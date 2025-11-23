class GuardManager {
    constructor() {
        this.eventCounters = {
            guard1: 0,
            guard2: 0,
            guard3: 0,
            guard4: 0
        };

        this.eventAssignments = {
            ban: 'guard1',
            channel: 'guard2',
            role: 'guard3',
            spam: 'guard4'
        };
    }

    assignEventToGuard(eventType) {
        const guardName = this.eventAssignments[eventType];

        if (guardName) {
            this.eventCounters[guardName]++;
            return guardName;
        }

        const minGuard = Object.entries(this.eventCounters)
            .reduce((min, [guard, count]) =>
                count < min.count ? { guard, count } : min
                , { guard: 'guard1', count: this.eventCounters.guard1 });

        this.eventCounters[minGuard.guard]++;
        return minGuard.guard;
    }

    getEventStats() {
        return {
            ...this.eventCounters,
            total: Object.values(this.eventCounters).reduce((a, b) => a + b, 0)
        };
    }

    resetCounters() {
        this.eventCounters = {
            guard1: 0,
            guard2: 0,
            guard3: 0,
            guard4: 0
        };
    }
}

module.exports = GuardManager;
