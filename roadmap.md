# Roadmap: Evolución de Brain-Sync (Inteligencia de Comportamiento)

## FASE 1: LangGraph - "Agentes a prueba de balas"

**Duración:** 2-3 semanas
**Objetivo:** Transformar tus agentes de simples "demos" a herramientas de salud mental confiables.

### Semana 1: Fundamentos

* **Día 1-2: Conceptos Core**
* Gestión de estado con grafos de estado (StateGraph).
* Nodos, aristas (edges) y enrutamiento condicional.
* Puntos de control (Checkpointing) y persistencia.
* Comprensión del modelo de ejecución.


* **Día 3-4: Implementación Básica**
* Configurar LangGraph en tu proyecto.
* Convertir un flujo simple (ej. creación de notas).
* Añadir puntos de control utilizando PostgreSQL.
* Probar la funcionalidad de pausar/reanudar.


* **Día 5-7: Tu Primer Agente en Producción**
* Reconstruir tu "Auditor Diario" en LangGraph.
* Añadir un manejo de errores adecuado y lógica de reintentos.
* Implementar logging y observabilidad.


* **Entregables Semana 1:**
* Auditor Diario v2.0 funcionando con LangGraph.
* Puntos de control configurados en base de datos.
* Capacidad de recuperación ante fallos de ejecución.



### Semana 2: Patrones Avanzados

* **Día 8-10: Colaboración Multi-Agente**
* Construir el "Generador de Rutinas" con múltiples agentes especializados: Agente Analizador (evalúa el día de ayer), Agente Programador (crea bloques de tiempo), Agente Validador (verifica la viabilidad) y Agente Formateador (salida limpia).


* **Día 11-12: Human-in-the-Loop (Intervención Humana)**
* Añadir pasos de aprobación antes de acciones críticas.
* Implementar bucles de feedback ("el agente sugiere, el usuario aprueba").


* **Día 13-14: Agente Conversacional Complejo**
* Actualizar tu interfaz de chat para usar LangGraph.
* Manejar conversaciones multi-turno con uso de herramientas.
* Implementar memoria a través de los turnos de conversación.


* **Entregables Semana 2:** Generador de rutinas multi-agente y flujo de aprobación humana integrado.

### Semana 3: Hardening para Producción (Robustez)

* **Día 15-17: Manejo de Errores y Observabilidad**
* Implementar estrategias de reintento avanzadas.
* Configurar trazabilidad (tracing) y un dashboard para visualizar las ejecuciones de los agentes.


* **Día 18-19: Testing y Evaluación**
* Escribir pruebas unitarias para cada nodo y pruebas de integración para los grafos completos.
* Medir la confiabilidad del agente (tasa de éxito).


* **Día 20-21: Optimización**
* Identificar cuellos de botella y paralelizar nodos independientes.
* Optimizar llamadas al LLM para reducir tokens y añadir caché.


* **Criterios de Éxito:** ✅ El Auditor Diario se ejecuta confiablemente cada noche (99% de éxito). ✅ Capacidad de pausar/reanudar flujos. ✅ Aprobación humana antes de acciones de alto riesgo. ✅ Trazabilidad completa. ✅ Recuperación automática de fallos.

## FASE 2: RAG en Producción - "Obteniendo el Contexto Correcto"

**Duración:** 2-3 semanas
**Objetivo:** Precisión de recuperación (retrieval) superior al 85%, calidad medible.

### Semana 1: Recuperación Avanzada

* **Día 1-3: Implementación de Búsqueda Híbrida**
* Añadir búsqueda de texto completo (Full-Text Search) a tu tabla de notas en Postgres.
* Combinar la búsqueda semántica (vectores) con la búsqueda por palabras clave usando fusión de rangos recíprocos (RRF).


* **Día 4-5: Re-ranking**
* Implementar una etapa de re-clasificación usando un modelo externo (ej. Cohere) o un cross-encoder local para afinar los resultados obtenidos.


* **Día 6-7: Transformación de Consultas (Queries)**
* Detectar la complejidad de la pregunta del usuario.
* Descomponer preguntas complejas en sub-preguntas.
* Generar respuestas hipotéticas (HyDE) para mejorar la búsqueda de preguntas vagas.


* **Entregables Semana 1:** Búsqueda híbrida funcionando, re-ranker integrado, transformación de queries activa y mejora medible en recuperación.

### Semana 2: Chunking Inteligente y Contexto

* **Día 8-10: Recuperación por Ventana de Oraciones (Sentence-Window Retrieval)**
* *El problema:* Dividir notas por caracteres rompe el contexto causal (ej. el desencadenante de una recaída queda en un chunk y la emoción en otro).
* *Solución:* Buscar en fragmentos muy pequeños (oraciones sueltas) pero devolverle al LLM el fragmento expandido con el contexto que lo rodea.


* **Día 11-12: Embeddings Contextuales (Método de Anthropic)**
* *El problema:* Los fragmentos aislados pierden su significado original.
* *Solución:* Usar un LLM para generar un breve contexto de 1-2 oraciones que sitúe el fragmento antes de convertirlo en vector (embedding).


* **Día 13-14: Mejoras en la Integración GraphRAG**
* Expandir tu sistema de grafos actual. Encontrar cadenas causales (ej: "Discusión" -> CAUSA -> "Ansiedad" -> DESENCADENA -> "Deseo de apostar").


* **Entregables Semana 2:** Sentence-window retrieval implementado, embeddings contextuales activos y contexto de GraphRAG altamente mejorado.

### Semana 3: Evaluación y Optimización

* **Día 15-17: Construir Suite de Evaluación**
* Crear un "Golden Dataset" (un conjunto de pruebas perfecto con preguntas, respuestas esperadas y notas relevantes).
* Computar métricas: Hit Rate, MRR, Fidelidad (Faithfulness) y Relevancia de Respuesta.


* **Día 18-19: Benchmarking y Optimización**
* Ejecutar pruebas base vs. híbrida vs. re-ranking.
* Optimizar tamaños de chunks basados en métricas duras.


* **Día 20-21: Despliegue en Producción**
* Configurar dashboards de monitoreo, alertas por degradación de calidad y framework de testing A/B.


* **Criterios de Éxito:** ✅ Hit rate mejorado del ~60% a más del 85%. ✅ Manejo fluido de preguntas complejas multi-parte. ✅ Métricas de calidad rastreadas automáticamente.

## FASE 3: Fine-tuning (Ajuste Fino) - "Tu IA Personal"

**Duración:** 2-4 semanas
**Objetivo:** Modelos que entiendan TU vocabulario emocional y tus patrones específicos.

### Semana 1: Preparación de Datos y Setup

* **Día 1-3: Creación del Dataset**
* Extraer tus notas mejor etiquetadas de la base de datos (con emociones, triggers y niveles de riesgo).
* Formatear la información para entrenamiento por instrucciones (Instruction Tuning).
* Dividir el dataset en Entrenamiento (80%), Validación (10%) y Prueba (10%).


* **Día 4-5: Configurar Entorno de Entrenamiento**
* Instalar frameworks de ajuste fino (como Axolotl o Unsloth).
* Configurar hiperparámetros y adaptadores LoRA.


* **Día 6-7: Evaluación Base**
* Probar el modelo base (ej. Phi-3) *antes* del ajuste fino para tener una métrica de comparación.


* **Entregables Semana 1:** Más de 500 ejemplos etiquetados y exportados, entorno de entrenamiento listo, métricas base registradas.

### Semana 2: Entrenamiento e Iteración

* **Día 8-10: Primera Ejecución de Entrenamiento**
* Monitorear la pérdida de entrenamiento y validación (cuidando de no caer en overfitting/sobreajuste).


* **Día 11-12: Evaluar Modelo Ajustado**
* Cargar el adaptador entrenado y correr el set de pruebas.
* *Objetivo:* Alcanzar un 85%+ de precisión en detección de emociones y riesgos.


* **Día 13-14: Iteración y Optimización**
* Añadir casos límite (Spanglish, emociones mixtas, momentos de crisis) si los resultados no son óptimos. Ajustar hiperparámetros.


* **Entregables Semana 2:** Primer modelo ajustado entrenado, evaluación documentada y áreas de mejora identificadas.

### Semana 3: Despliegue y Producción

* **Día 15-16: Integración con Ollama**
* Crear un `Modelfile` para tu modelo ajustado y cargarlo en Ollama.


* **Día 17-18: Integración con Brain-Sync**
* Actualizar tu proveedor de LLM para que las tareas de análisis emocional usen el nuevo modelo, manteniendo el modelo base para chat general.


* **Día 19-20: Pruebas A/B**
* Comparar la latencia, precisión y fidelidad del modelo base vs. el ajustado en tiempo real.


* **Día 21: Despliegue en Producción**
* Cambiar a producción usando el modelo ajustado como predeterminado para análisis.


* **Semana 4 (Opcional):** Entrenar modelos adicionales (Ej: Evaluador de riesgos puro o un modelo 100% bilingüe).
* **Criterios de Éxito:** ✅ Mejora del 25%+ en tareas específicas. ✅ Precisión de detección de emociones > 85%. ✅ Modelo corriendo localmente en Ollama.

## FASE 4: Prompt Engineering y Optimización - "Excelencia Automatizada"

**Duración:** 2 semanas
**Objetivo:** Mejora sistemática y confiabilidad absoluta de los prompts.

### Semana 1: Implementación de DSPy

* **Día 1-3: Fundamentos de DSPy**
* Integrar DSPy para abstraer los prompts en firmas (Signatures) y módulos.


* **Día 4-6: Compilar y Optimizar**
* Usar un optimizador (Teleprompter) para que el sistema encuentre las mejores instrucciones posibles basándose en ejemplos de entrenamiento y una métrica de éxito.


* **Día 7: Integración con Brain-Sync**
* Conectar el programa compilado de DSPy (Python) con tu backend en Node/Express.


* **Entregables Semana 1:** DSPy configurado, extracción de emociones optimizada automáticamente y métricas mejoradas.

### Semana 2: Generación Estructurada y Producción

* **Día 8-10: Orientación para Salida Estructurada**
* Garantizar estructuras rígidas para análisis complejos (ej. forzar al LLM a elegir opciones específicas de un array, generar arrays de longitud definida).


* **Día 11-12: Modo JSON (Adiós Errores de Parseo)**
* Implementar generación estricta forzando el formato JSON desde Ollama y validando en tiempo de ejecución con esquemas de Zod en el backend.


* **Día 13-14: Pipeline de Producción**
* Unir la recuperación optimizada con la generación estructurada.


* **Criterios de Éxito:** ✅ Cero errores de parseo JSON. ✅ Prompts optimizados automáticamente por máquina. ✅ Mejora del 15-25% en precisión sin tocar código manual.

## FASE 5: Ecosistema MCP - "Conectando con el Mundo Real" (Telegram & Calendar)

**Duración:** 2 semanas
**Objetivo:** Sacar a la IA del navegador usando el Model Context Protocol. Permitir que el sistema lea tu agenda, planifique tu recuperación y se comunique proactivamente contigo en tiempo real.

### Semana 1: El Canal de Comunicación (Telegram Bot & Tools)

* **Creación de un microservicio MCP aislado para Telegram.**
* **Soporte multimodal:** Recepción de notas de voz vía Telegram y transcripción local con contenedores de `faster-whisper-server`.
* **Exposición de la herramienta `send_telegram_alert`:** Para que el "Auditor Diario" pueda enviar alertas proactivas ante patrones de alto riesgo emocional.

### Semana 2: El Motor de Acción (Google Calendar MCP Server)

* **Creación de un microservicio MCP para Google Calendar.**
* **Exposición de Recurso (`calendar://today/freebusy`):** Permite al Agente leer a qué hora trabajas para no interrumpir.
* **Exposición de Herramienta (`schedule_recovery_block`):** Permite al Agente Generador de Rutinas insertar bloques dinámicos (ej. meditación o caminata) en tus huecos libres cuando detecta un "trigger".

---

## 3. Arquitectura del Monorepo (Estructura de Directorios)

Para mantener la separación de responsabilidades (Clean Architecture), el ecosistema MCP vive completamente separado de la API principal, interactuando como subprocesos (stdio):

```plaintext
brain-sync/
├── apps/
│   ├── web/                    # Frontend UI (Next.js 16)
│   ├── api/                    # Backend Core (Express + LangGraph + Ollama API)
│   │   └── src/infrastructure/mcp/ # Clientes que ejecutan los servidores MCP
│   │
│   └── mcp-servers/            # 🚀 El hogar de las integraciones aisladas
│       ├── telegram/           # Microservicio MCP de Telegram (Bot + Alertas)
│       └── calendar/           # Microservicio MCP de Google Calendar
│
├── packages/
│   ├── types/                  # Zod schemas y tipos compartidos
│   └── db/                     # Drizzle ORM y Postgres + pgvector
│
├── docker-compose.yml          # Postgres, Ollama, Whisper-Server
└── turbo.json                  # Orquestador del monorepo
```

---

## 4. Cronograma y Métricas de Éxito

| Fase | Semanas | Resultado Clave |
| --- | --- | --- |
| **LangGraph** | 2-3 | Agentes autónomos robustos (99% uptime). |
| **RAG en Producción** | 2-3 | Precisión de recuperación del contexto del 85%+. |
| **Fine-tuning** | 2-4 | Detección de emociones ultra-precisa con tu vocabulario. |
| **Optimización de Prompts** | 2 | Cero fallos de parseo JSON. |
| **Ecosistema MCP** | 2 | Integración fluida con la vida diaria (Telegram/Calendar). |
| **TOTAL** | **10-14 semanas** | **Sistema de IA de nivel Enterprise** |

---

## 🎯 Checklist de Éxito para Entrevistas (Perfil Senior):

* [ ] La arquitectura MCP permite escalar integraciones sin tocar el Core de la API.
* [ ] La aplicación es 100% privada y autoalojada (Self-hosted RAG).
* [ ] El uso de LangGraph demuestra comprensión profunda de flujos de IA con estado (Stateful AI).
* [ ] La solución aplica tecnología de frontera a un problema humano real, demostrando mentalidad de producto (Product Mindset).
