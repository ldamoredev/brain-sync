import { Core } from '../src/infrastructure/Core';
import { Chat } from '../src/application/useCases/chat/Chat';
import { IndexNote } from '../src/application/useCases/IndexNote';
import { db } from '../src/infrastructure/db';
import {
    notes,
    emotionsLog,
    triggers,
    behaviorOutcomes,
    dailySummaries,
    routines,
    relationships
} from '../src/infrastructure/db/schema';

async function seedData(core: Core) {
    console.log("🧹 Cleaning database before benchmark...");
    await db.delete(relationships);
    await db.delete(emotionsLog);
    await db.delete(triggers);
    await db.delete(behaviorOutcomes);
    await db.delete(notes);
    await db.delete(dailySummaries);
    await db.delete(routines);

    console.log("🌱 Seeding Spanish notes for benchmark...");
    const indexNote = core.getUseCase(IndexNote);

    const entries = [
        "Hoy me sentí muy ansioso porque tuve una discusión fuerte con mi jefe por el retraso en el proyecto.",
        "Para calmar mi ansiedad después de la reunión, salí a caminar por el parque durante 30 minutos y me ayudó mucho.",
        "He notado que cuando tomo café por la tarde, me cuesta mucho dormir y me siento más irritable.",
        "Anoche dormí solo 4 horas. Hoy me siento agotado y con poca paciencia.",
        "Escribir mis pensamientos en este diario me hace sentir más tranquilo y en control."
    ];

    for (const entry of entries) {
        await indexNote.execute(entry);
        console.log(`  ✅ Indexed: "${entry}"`);
    }
}

async function runBenchmark() {
    console.log("🚀 Starting Phase 5 Benchmark...");
    const core = new Core();
    
    await seedData(core);

    const chatService = core.getUseCase(Chat);

    const testCases = [
        {
            question: "¿Cómo me he sentido últimamente?",
            expectedTopic: "emotions"
        },
        {
            question: "¿Qué disparadores de ansiedad he tenido?",
            expectedTopic: "triggers"
        },
        {
            question: "¿Qué actividades me han ayudado a reducir mi ansiedad?",
            expectedTopic: "mitigation"
        },
        {
            question: "¿Qué impacto tiene el café en mi bienestar según mis notas?",
            expectedTopic: "substances"
        }
    ];

    for (const test of testCases) {
        console.log(`\n-----------------------------------`);
        console.log(`❓ Question: ${test.question}`);
        
        try {
            const result = await chatService.execute(test.question);
            console.log(`🤖 Answer: ${result.answer}`);
            
            if (result.metrics) {
                console.log(`📊 Metrics:`);
                console.log(`   - Faithfulness: ${result.metrics.faithfulness}`);
                console.log(`   - Answer Relevance: ${result.metrics.answerRelevance}`);
            } else {
                console.log(`   - Faithfulness (Corrected): ${result.isFaithful}`);
            }
        } catch (e) {
            console.error(`❌ Error testing "${test.question}":`, e);
        }
    }
}

runBenchmark().catch(console.error);
