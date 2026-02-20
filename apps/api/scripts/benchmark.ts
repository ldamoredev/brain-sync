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
        "Hoy tuve un día terrible en el trabajo, sentí mucha frustración porque mi jefe me gritó frente a todos. Al salir, sentí un impulso incontrolable y terminé consumiendo para evadirme de esa sensación de humillación.",
        "Después de consumir anoche, hoy me desperté con un sentimiento de culpa horrible. Me arrepiento profundamente de haber cedido al impulso, siento que perdí todo el progreso que había logrado.",
        "He notado que la soledad de los domingos por la tarde es mi mayor disparador. Me invade una tristeza profunda y la necesidad de llenar ese vacío me lleva a querer consumir.",
        "Ayer logré aguantar las ganas de consumir a pesar de sentirme muy ansioso por los problemas económicos. Fui a una reunión de apoyo y eso me contuvo.",
        "Cada vez que consumo me siento peor después. El alivio dura unos minutos, pero el arrepentimiento y la vergüenza duran días. Necesito identificar mejor mis emociones antes de actuar."
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
            question: "¿Cómo me he sentido después de mis últimos consumos?",
            expectedTopic: "regret/guilt"
        },
        {
            question: "¿Qué disparadores de consumo he identificado?",
            expectedTopic: "triggers"
        },
        {
            question: "¿Qué emociones me impulsan a consumir?",
            expectedTopic: "emotions"
        },
        {
            question: "¿Qué actividades o estrategias me han ayudado a evitar el consumo?",
            expectedTopic: "coping"
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
