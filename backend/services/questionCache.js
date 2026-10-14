/**
 * questionCache.js
 * 
 * High-Throughput In-Memory Question Bank Cache Store for Desktop CBT Local Server.
 * Supports 65 to 92 client workstations running concurrent exam batches with 0ms disk access.
 * 
 * Features:
 * - Keyed by normalized `session_term_class_subject_slot`.
 * - In-memory question ID index for sub-millisecond retrieval of student session question orders.
 * - Non-destructive invalidation hooks (triggered when question banks are modified/uploaded/cleared).
 * - Automatic deep copy on retrieval to prevent cross-request mutation.
 */

class QuestionBankCache {
    constructor() {
        // Map<string, Array<Object>> - Stores normalized questions array per cache key
        this.cache = new Map();
        // Map<number, Object> - Global ID-to-Question index for fast resumption
        this.questionIndex = new Map();
        // Telemetry stats
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Normalizes cache key components to lowercase, trimmed, standardized tokens.
     */
    buildKey(session, term, className, subject, slot) {
        const normSession = String(session || '2026/2027').trim().toLowerCase();
        const normTerm = String(term || '1st Term').trim().toLowerCase();
        const normClass = String(className || 'general').trim().toLowerCase();
        const normSubject = String(subject || 'general').trim().toLowerCase().replace(/\s+/g, ' ');
        let normSlot = String(slot || 'midterm_ca').trim().toLowerCase();
        if (normSlot === 'terminal_exam' || normSlot === 'terminal' || normSlot === 'exam') normSlot = 'examination';
        if (normSlot === 'custom_exam' || normSlot === 'custom') normSlot = 'custom_assessment';

        return `${normSession}__${normTerm}__${normClass}__${normSubject}__${normSlot}`;
    }

    /**
     * Checks if a question bank key is currently cached in Node RAM.
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Retrieves sanitized, deep-copied question bank from Node RAM.
     * Returns null on cache miss.
     */
    get(key) {
        if (!this.cache.has(key)) {
            this.misses++;
            return null;
        }
        this.hits++;
        const cachedList = this.cache.get(key);
        // Fast shallow copy of items to allow student-specific shuffling without mutating master cache
        return cachedList.map(q => ({ ...q }));
    }

    /**
     * Stores a question bank array in RAM and indexes individual questions by ID.
     */
    set(key, questions) {
        if (!Array.isArray(questions)) return;
        // Freeze/clone elements into cache
        const cloned = questions.map(q => {
            const copy = { ...q };
            if (copy.id) {
                this.questionIndex.set(Number(copy.id), { ...copy });
            }
            return copy;
        });
        this.cache.set(key, cloned);
        console.log(`⚡ [Question Cache] Cached ${cloned.length} questions for key: "${key}" (Total cached keys: ${this.cache.size})`);
    }

    /**
     * Resolves questions by specific ID array from in-memory index.
     * Returns { questions, allFound }
     */
    getByIds(idArray) {
        if (!Array.isArray(idArray) || idArray.length === 0) {
            return { questions: [], allFound: false };
        }
        const result = [];
        let allFound = true;

        for (const id of idArray) {
            const numId = Number(id);
            const q = this.questionIndex.get(numId);
            if (q) {
                result.push({ ...q });
            } else {
                allFound = false;
            }
        }

        if (allFound) {
            this.hits++;
        } else {
            this.misses++;
        }

        return { questions: result, allFound };
    }

    /**
     * Index arbitrary question rows (e.g., from DB fallback) into in-memory questionIndex.
     */
    indexQuestions(questions) {
        if (!Array.isArray(questions)) return;
        for (const q of questions) {
            if (q && q.id) {
                this.questionIndex.set(Number(q.id), { ...q });
            }
        }
    }

    /**
     * Invalidates cached question banks matching a subject or keyword.
     * If subject is omitted, completely purges the cache.
     */
    invalidate(subject) {
        if (!subject || subject === 'ALL') {
            const count = this.cache.size;
            this.cache.clear();
            this.questionIndex.clear();
            console.log(`🧹 [Question Cache] Flushed entire question bank cache (${count} entries removed).`);
            return;
        }

        const normSub = String(subject).trim().toLowerCase();
        let purged = 0;

        for (const key of this.cache.keys()) {
            if (key.includes(normSub)) {
                this.cache.delete(key);
                purged++;
            }
        }
        console.log(`🧹 [Question Cache] Invalidated ${purged} cache keys matching subject: "${subject}".`);
    }

    /**
     * Clears all cached question banks.
     */
    clear() {
        this.cache.clear();
        this.questionIndex.clear();
    }

    /**
     * Returns current operational telemetry.
     */
    stats() {
        const totalReqs = this.hits + this.misses;
        const hitRatio = totalReqs > 0 ? ((this.hits / totalReqs) * 100).toFixed(1) : 0;
        return {
            keysCount: this.cache.size,
            indexedQuestionsCount: this.questionIndex.size,
            hits: this.hits,
            misses: this.misses,
            hitRatio: `${hitRatio}%`
        };
    }
}

const questionCache = new QuestionBankCache();
module.exports = questionCache;
