import { Core } from '../src/infrastructure/Core';
import { IndexNote } from '../src/application/useCases/IndexNote';
import { db } from '../src/infrastructure/db';
import {
    notes,
    emotionsLog,
    triggers,
    behaviorOutcomes,
    dailySummaries,
    routines,
    relationships,
    agentCheckpoints,
    agentExecutionLogs,
    agentMetrics
} from '../src/infrastructure/db/schema';

/**
 * Script para configurar datos de demostración en español
 * Crea un escenario completo para probar auditorías diarias y generación de rutinas
 */

async function cleanDatabase() {
    console.log('🧹 Limpiando base de datos...');
    
    // Clean agent tables
    await db.delete(agentMetrics);
    await db.delete(agentExecutionLogs);
    await db.delete(agentCheckpoints);
    
    // Clean domain tables
    await db.delete(relationships);
    await db.delete(emotionsLog);
    await db.delete(triggers);
    await db.delete(behaviorOutcomes);
    await db.delete(routines);
    await db.delete(dailySummaries);
    await db.delete(notes);
    
    console.log('✅ Base de datos limpiada');
}

async function seedNotes(core: Core) {
    console.log('\n📝 Creando notas de ejemplo...');
    const indexNote = core.getUseCase(IndexNote);

    // Scenario: 7 days of recovery journey with ups and downs
    const notesData = [
        // Day 1 - Monday (7 days ago) - Difficult start
        {
            date: getDateDaysAgo(7),
            entries: [
                'Hoy fue un día muy difícil en el trabajo. Mi jefe me criticó frente a todo el equipo y sentí una humillación terrible. La ansiedad me invadió y tuve ganas de consumir para olvidar.',
                'Después del trabajo fui directo a casa y me encerré. La soledad me está matando pero no quiero ver a nadie. Siento que todos me juzgan.',
                'Logré resistir las ganas de consumir llamando a mi padrino. Hablamos por una hora y me ayudó a calmarme. Pequeña victoria.'
            ]
        },
        // Day 2 - Tuesday (6 days ago) - Relapse
        {
            date: getDateDaysAgo(6),
            entries: [
                'No aguanté. Anoche después de la llamada con mi padrino me sentí bien, pero hoy en la mañana la ansiedad volvió peor. Consumí.',
                'Me siento horrible. Todo el progreso que había logrado se fue al carajo. La culpa es insoportable. No puedo ni mirarme al espejo.',
                'Llamé a mi terapeuta de emergencia. Me recordó que una recaída no es el fin, es parte del proceso. Pero no puedo dejar de sentirme un fracaso.'
            ]
        },
        // Day 3 - Wednesday (5 days ago) - Recovery attempt
        {
            date: getDateDaysAgo(5),
            entries: [
                'Hoy me levanté decidido a retomar. Fui a la reunión de las 7am. Compartir mi recaída fue difícil pero liberador.',
                'Identifiqué que mi disparador principal es el estrés laboral combinado con la soledad. Necesito trabajar en ambos.',
                'Hice ejercicio por primera vez en semanas. Una caminata de 30 minutos. Me ayudó a despejar la mente.'
            ]
        },
        // Day 4 - Thursday (4 days ago) - Building momentum
        {
            date: getDateDaysAgo(4),
            entries: [
                'Segundo día limpio. La ansiedad sigue ahí pero más manejable. Estoy usando las técnicas de respiración que aprendí.',
                'Hablé con mi hermana por teléfono. Le conté sobre mi recaída. Su apoyo incondicional me dio fuerzas.',
                'Noté que las tardes son mi momento más vulnerable. Entre las 6 y 9pm la soledad se intensifica. Necesito un plan para esas horas.'
            ]
        },
        // Day 5 - Friday (3 days ago) - Strong day
        {
            date: getDateDaysAgo(3),
            entries: [
                'Tercer día limpio. Me siento más fuerte. Hoy tuve un día pesado en el trabajo pero logré manejarlo sin pensar en consumir.',
                'Fui al gimnasio después del trabajo en lugar de irme directo a casa. Esa rutina me está ayudando mucho.',
                'Cené con un amigo de la reunión. Hablar con alguien que entiende lo que paso hace toda la diferencia.'
            ]
        },
        // Day 6 - Saturday (2 days ago) - Weekend challenge
        {
            date: getDateDaysAgo(2),
            entries: [
                'Los fines de semana son los más difíciles. Demasiado tiempo libre y la mente empieza a divagar.',
                'Fui a dos reuniones hoy. Una en la mañana y otra en la tarde. Me ayudó a mantenerme ocupado y conectado.',
                'Por la noche sentí ganas de consumir. En lugar de eso, llamé a tres personas de mi lista de contactos hasta que alguien contestó. Funcionó.'
            ]
        },
        // Day 7 - Sunday (yesterday) - Reflection
        {
            date: getDateDaysAgo(1),
            entries: [
                'Domingo por la tarde, mi momento más vulnerable. La nostalgia y la soledad me golpean fuerte. Pero esta vez estoy preparado.',
                'Hice una lista de todas las cosas que he logrado esta semana: 5 días limpio después de la recaída, ejercicio regular, conexión con mi red de apoyo.',
                'Me doy cuenta de que la recuperación no es lineal. Habrá caídas, pero lo importante es levantarse. Hoy me siento esperanzado.'
            ]
        },
        // Day 8 - Today - Ready for routine
        {
            date: getDateDaysAgo(0),
            entries: [
                'Hoy es un nuevo día. Desperté con energía y determinación. Voy a seguir construyendo sobre el progreso de esta semana.',
                'Identifiqué mis principales disparadores: estrés laboral, soledad en las tardes, domingos por la tarde. Ahora necesito estrategias específicas para cada uno.',
                'Estoy listo para crear una rutina estructurada que me ayude a mantenerme en el camino. Necesito llenar esas horas vulnerables con actividades positivas.'
            ]
        }
    ];

    for (const day of notesData) {
        console.log(`\n  📅 Creando notas para ${day.date}...`);
        for (const entry of day.entries) {
            await indexNote.execute(entry);
            console.log(`    ✅ "${entry.substring(0, 60)}..."`);
        }
    }

    console.log(`\n✅ ${notesData.reduce((sum, day) => sum + day.entries.length, 0)} notas creadas`);
}

async function seedDailySummaries() {
    console.log('\n📊 Creando resúmenes diarios de ejemplo...');

    const summaries = [
        {
            date: getDateDaysAgo(7),
            summary: 'Día difícil con alto estrés laboral. Experimentó humillación en el trabajo que generó ansiedad intensa. Logró resistir el impulso de consumir mediante apoyo de su padrino.',
            riskLevel: 7,
            keyInsights: [
                'Estrés laboral identificado como disparador principal',
                'Red de apoyo (padrino) fue efectiva para prevenir consumo',
                'Aislamiento social como mecanismo de defensa'
            ]
        },
        {
            date: getDateDaysAgo(6),
            summary: 'Recaída después de un día de ansiedad persistente. Sentimientos intensos de culpa y fracaso. Buscó apoyo terapéutico de emergencia.',
            riskLevel: 9,
            keyInsights: [
                'Recaída ocurrió en la mañana siguiente a un episodio de ansiedad',
                'Culpa y vergüenza post-recaída muy intensas',
                'Respuesta positiva: buscó ayuda profesional inmediatamente'
            ]
        },
        {
            date: getDateDaysAgo(5),
            summary: 'Día de recuperación activa. Asistió a reunión de apoyo y compartió su recaída. Identificó disparadores clave y comenzó actividad física.',
            riskLevel: 6,
            keyInsights: [
                'Compartir la recaída en grupo fue liberador',
                'Identificación clara de disparadores: estrés laboral + soledad',
                'Ejercicio físico como nueva herramienta de afrontamiento'
            ]
        },
        {
            date: getDateDaysAgo(4),
            summary: 'Segundo día limpio con ansiedad manejable. Fortaleció red de apoyo familiar. Identificó horario vulnerable (6-9pm).',
            riskLevel: 5,
            keyInsights: [
                'Técnicas de respiración están siendo efectivas',
                'Apoyo familiar (hermana) es un recurso valioso',
                'Tardes (6-9pm) identificadas como período de alto riesgo'
            ]
        },
        {
            date: getDateDaysAgo(3),
            summary: 'Tercer día limpio con fortaleza creciente. Manejó estrés laboral sin pensar en consumir. Estableció rutina de ejercicio post-trabajo.',
            riskLevel: 4,
            keyInsights: [
                'Capacidad de manejo de estrés laboral mejorada',
                'Rutina de gimnasio post-trabajo previene aislamiento',
                'Conexión con pares en recuperación es terapéutica'
            ]
        },
        {
            date: getDateDaysAgo(2),
            summary: 'Desafío de fin de semana manejado exitosamente. Asistió a múltiples reuniones. Utilizó red de apoyo telefónico en momento de crisis.',
            riskLevel: 6,
            keyInsights: [
                'Fines de semana identificados como período de alto riesgo',
                'Múltiples reuniones como estrategia preventiva efectiva',
                'Lista de contactos de emergencia funcionó cuando fue necesaria'
            ]
        },
        {
            date: getDateDaysAgo(1),
            summary: 'Domingo por la tarde navegado con preparación. Reflexión positiva sobre progreso semanal. Aceptación de que la recuperación no es lineal.',
            riskLevel: 5,
            keyInsights: [
                'Domingo por la tarde es momento de máxima vulnerabilidad',
                'Preparación anticipada ayudó a manejar momento difícil',
                'Perspectiva de recuperación más realista y compasiva'
            ]
        }
    ];

    for (const summary of summaries) {
        await db.insert(dailySummaries).values({
            date: summary.date,
            summary: summary.summary,
            riskLevel: summary.riskLevel,
            keyInsights: summary.keyInsights
        });
        console.log(`  ✅ Resumen creado para ${summary.date} (Riesgo: ${summary.riskLevel}/10)`);
    }

    console.log(`✅ ${summaries.length} resúmenes diarios creados`);
}

async function seedRoutines() {
    console.log('\n🗓️  Creando rutinas de ejemplo...');

    const routineData = [  // Changed from 'routines' to 'routineData'
        {
            targetDate: getDateDaysAgo(6),
            activities: [
                {
                    time: '07:00',
                    activity: 'Reunión de recuperación matutina',
                    expectedBenefit: 'Comenzar el día con apoyo y motivación',
                    completed: true
                },
                {
                    time: '12:00',
                    activity: 'Almuerzo saludable y caminata de 15 minutos',
                    expectedBenefit: 'Mantener energía y despejar la mente',
                    completed: true
                },
                {
                    time: '18:00',
                    activity: 'Gimnasio o ejercicio en casa (30 min)',
                    expectedBenefit: 'Reducir ansiedad y evitar aislamiento',
                    completed: false
                },
                {
                    time: '20:00',
                    activity: 'Llamada con padrino o amigo de recuperación',
                    expectedBenefit: 'Conexión social en hora vulnerable',
                    completed: true
                },
                {
                    time: '22:00',
                    activity: 'Meditación y preparación para dormir',
                    expectedBenefit: 'Calmar la mente y mejorar calidad de sueño',
                    completed: true
                }
            ]
        },
        {
            targetDate: getDateDaysAgo(3),
            activities: [
                {
                    time: '06:30',
                    activity: 'Rutina matutina: ducha, desayuno, meditación',
                    expectedBenefit: 'Establecer estructura desde el inicio del día',
                    completed: true
                },
                {
                    time: '12:30',
                    activity: 'Almuerzo fuera de la oficina',
                    expectedBenefit: 'Desconectar del estrés laboral',
                    completed: true
                },
                {
                    time: '17:30',
                    activity: 'Gimnasio inmediatamente después del trabajo',
                    expectedBenefit: 'Prevenir aislamiento y reducir ansiedad',
                    completed: true
                },
                {
                    time: '19:30',
                    activity: 'Cena con amigo de recuperación',
                    expectedBenefit: 'Apoyo mutuo y conexión social',
                    completed: true
                },
                {
                    time: '21:30',
                    activity: 'Lectura o actividad relajante',
                    expectedBenefit: 'Ocupar la mente antes de dormir',
                    completed: true
                }
            ]
        },
        {
            targetDate: getDateDaysAgo(1),
            activities: [
                {
                    time: '09:00',
                    activity: 'Reunión de recuperación dominical',
                    expectedBenefit: 'Comenzar el fin de semana con apoyo',
                    completed: true
                },
                {
                    time: '11:00',
                    activity: 'Actividad al aire libre (parque, caminata)',
                    expectedBenefit: 'Ejercicio y conexión con la naturaleza',
                    completed: true
                },
                {
                    time: '14:00',
                    activity: 'Almuerzo con familia o amigos',
                    expectedBenefit: 'Fortalecer vínculos y evitar soledad',
                    completed: false
                },
                {
                    time: '17:00',
                    activity: 'Segunda reunión o actividad grupal',
                    expectedBenefit: 'Navegar hora vulnerable con apoyo',
                    completed: true
                },
                {
                    time: '20:00',
                    activity: 'Reflexión semanal y planificación',
                    expectedBenefit: 'Cerrar la semana con perspectiva positiva',
                    completed: true
                }
            ]
        }
    ];

    for (const routine of routineData) {  // Changed here too
        await db.insert(routines).values({  // Now 'routines' refers to the table
            targetDate: routine.targetDate,
            activities: routine.activities
        });
        const completedCount = routine.activities.filter((a: any) => a.completed).length;
        console.log(`  ✅ Rutina creada para ${routine.targetDate} (${completedCount}/${routine.activities.length} completadas)`);
    }

    console.log(`✅ ${routineData.length} rutinas creadas`);  // Changed here too
}

function getDateDaysAgo(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
}

async function printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE DATOS CREADOS');
    console.log('='.repeat(60));

    const notesCount = await db.select().from(notes);
    const summariesCount = await db.select().from(dailySummaries);
    const routinesCount = await db.select().from(routines);

    console.log(`\n📝 Notas: ${notesCount.length}`);
    console.log(`📊 Resúmenes diarios: ${summariesCount.length}`);
    console.log(`🗓️  Rutinas: ${routinesCount.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ DATOS DE DEMOSTRACIÓN LISTOS');
    console.log('='.repeat(60));

    console.log('\n🚀 Próximos pasos:');
    console.log('   1. Ejecutar auditoría diaria para hoy:');
    console.log('      POST http://localhost:6060/agents/daily-audit');
    console.log('      Body: { "date": "' + getDateDaysAgo(0) + '" }');
    console.log('\n   2. Generar rutina para mañana:');
    console.log('      POST http://localhost:6060/agents/generate-routine');
    console.log('      Body: { "date": "' + getDateDaysAgo(-1) + '" }');
    console.log('\n   3. Ver estado de ejecución:');
    console.log('      GET http://localhost:6060/agents/status/:threadId');
    console.log('\n   4. Ver métricas de agentes:');
    console.log('      GET http://localhost:6060/agents/metrics');
    console.log('');
}

async function main() {
    console.log('🎬 Iniciando configuración de datos de demostración...\n');
    
    const core = new Core();
    
    try {
        await cleanDatabase();
        await seedNotes(core);
        await seedDailySummaries();
        await seedRoutines();
        await printSummary();
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error durante la configuración:', error);
        process.exit(1);
    }
}

main();
