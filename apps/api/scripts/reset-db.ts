import 'dotenv/config';
import { db } from '../src/infrastructure/db';
import { notes, emotionsLog, triggers, behaviorOutcomes, dailySummaries, routines, relationships } from '../src/infrastructure/db/schema';

async function reset() {
    console.log('🗑️  Cleaning database...');
    
    try {
        // Delete in order to respect foreign key constraints
        await db.delete(relationships);
        await db.delete(emotionsLog);
        await db.delete(triggers);
        await db.delete(behaviorOutcomes);
        await db.delete(notes);
        await db.delete(dailySummaries);
        await db.delete(routines);
        
        console.log('✅ Database cleaned successfully.');
    } catch (error) {
        console.error('❌ Error cleaning database:', error);
    }
    process.exit(0);
}

reset();
