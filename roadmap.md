# Roadmap: Brain-Sync Evolution (Behavioral Intelligence & Recovery)

## 1. Vision

Transform `brain-sync` from a passive knowledge assistant into a proactive **Behavioral Intelligence System**. 
The goal is to help the user manage addiction recovery, emotional health, and daily routines through structured analysis, 
pattern recognition, and agentic intervention.

---

## 2. Technical Pillars

### Phase 1: Structured Entity Extraction (The "Foundation") [COMPLETED]

* **Goal**: Reduce hallucinations by moving from raw text to structured data.
* **Features**:
* **Emotional Tagging**: Automatically detect and log emotions (e.g., Anxiety, Guilt, Calm).
* **Trigger Mapping**: Identify events that lead to specific behaviors (e.g., "Conflict at work" -> "Urge to gamble").
* **Quantitative Tracking**: Log gains, losses, and time spent on specific activities.


* **Implementation**:
* Update `ChatService` to use **Function Calling** or **JSON Schema** extraction.
* New Database Tables: `emotions_log`, `triggers`, `behavior_outcomes`.



### Phase 2: Agentic Routines (The "Action") [COMPLETED]

* **Goal**: Move from "Chat" to "Action".
* **Features**:
* **The Daily Auditor**: An agent that runs every night to summarize the day and assess risk levels.
* **Dynamic Routine Generator**: A specialized agent that creates a tailored schedule for the next day based 
* on the user's current emotional state and past successes.
* **Routine Tracking**: Interactive checkboxes to mark activities as completed.


* **Implementation**:
* Integrate **LangChain Agents** with specialized tools (e.g., `createCalendarEntry`, `sendHighRiskAlert`).
* **Chain-of-Thought (CoT)** prompting for routine reasoning.



### Phase 3: Multimodality & Accessibility [PARTIALLY COMPLETED]

* **Goal**: Capture data when the user cannot or will not type.
* **Features**:
* **Voice Journaling**: Transcription of daily feelings using **Local Whisper** (Privacy-focused). [COMPLETED]
* **Sentiment Analysis of Audio**: Detecting stress levels through vocal tone.
* **Image Analysis**: Log photos of food, environments, or expressions to provide extra context. [PENDING]


* **Implementation**:
* Ollama integration with **Llava** for image description.
* **Whisper.cpp** or **Faster-Whisper** (running locally) for STT (Speech-to-Text).



### Phase 4: GraphRAG (The "Pattern Recognition") [COMPLETED]

* **Goal**: Discover non-obvious relationships in behavior.
* **Features**:
* **Semantic Graph**: Connect disparate notes (e.g., Connecting a note from 3 months ago about
* "Rainy Weather" to a recurring pattern of "Loneliness").
* **Discovery**: Visualize the network of triggers and emotional states.


* **Implementation**:
* Migrate or augment PostgreSQL with a Graph schema (using `pgvector` + Graph-like joins or Neo4j).



### Phase 5: Evaluation & Observability (The "Hardening")

* **Goal**: Ensure the system is medically/emotionally safe and accurate.
* **Features**:
* **Fact-Checking Layer**: The system must cite specific past notes for every suggestion made.
* **RAGas Implementation**: Quantitative measurement of "Faithfulness" and "Answer Relevancy."


* **Implementation**:
* Self-correction loops where a second LLM instance reviews the generated plan before display.

---

## 3. Core Features for Recovery & Growth

1. **Risk Detector**: Real-time analysis of journaling to identify "Relapse Warning Signs."
2. **Dopamine-Friendly Scheduling**: Suggesting activities that provide natural dopamine when the user is vulnerable.
3. **Accountability Mirror**: Weekly AI-generated reports on emotional trends and financial impact.

---

## 4. Current Stack & Tools

* **LLM**: Ollama (`phi3`, `llama3`, `llava`)
* **Orchestration**: LangChain / LangGraph
* **Database**: PostgreSQL + `pgvector`
* **Frontend**: Next.js 16 (App Router)
* **Backend**: Node.js (Express) + Clean Architecture

---

### **How to use this with your Code Agent:**

*"Based on the ROADMAP.md, let's start with **Phase 1**. We need to modify the `ChatController` and `ChatService` so that every time I save a journal entry, the AI extracts 'Emotional State', 'Risk Level', and 'Primary Trigger' into a structured JSON format to be saved in the database."*

**Would you like me to generate the SQL schema for these new behavioral tables so your code agent can run the migrations?**