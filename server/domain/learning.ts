/**
 * The learning band — rulebook §8.7: practical content for new arrivals.
 *
 * Three short modules, each a handful of multiple-choice questions, each worth a
 * mission reward once passed. The rulebook calls this "the most on-brand content
 * Paylez has", and the constraint that shapes this file is the one that makes it
 * worth anything: **the answers have to be right.** Somebody who has just moved
 * to Kraków and is told the wrong office for their PESEL has been harmed by the
 * product, not helped by it. So every question here is deliberately
 * conservative — a fact that is stable, widely documented and true for the
 * ordinary case — and none of them is advice about a specific situation. A rule
 * with exceptions is asked about in the form that has none, or not at all.
 *
 * **The server grades.** The questions are served without their answers, a
 * submission is marked here, and only the outcome is stored
 * (`learning_progress`: attempts, best score, when it was first passed). The
 * correct option *is* returned after a submission — this is teaching, not an
 * exam, and "you got question 3 wrong" with no correction teaches nothing — so
 * passing on a second try is expected and intended. What a client cannot do is
 * mark the module passed itself.
 *
 * **Passing means every question right.** A module is three to five facts
 * somebody needs; four out of five is not having learned where to apply.
 *
 * The content is English only for now, like the rest of the mission catalogue's
 * copy (see the report on `domain/missions.ts`); the questions are data here so
 * a translation is an addition to this file, not a change to how it works.
 */
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { now, type Iso } from './time.ts';

export interface LearningQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index into `options`. Never serialised before a submission. */
  answer: number;
}

export interface LearningModule {
  /** The module's own id; the mission id is `learning.<id>`. */
  id: string;
  /** The rulebook's number for it, §8.7. */
  number: number;
  title: string;
  description: string;
  questions: LearningQuestion[];
}

/**
 * The three modules of §8.7, in the rulebook's order and at its question counts
 * (4, 3 and 5).
 *
 * Sources, so the next person to touch a fact can check it rather than trust
 * it: PESEL — the Ministry of Digital Affairs' gov.pl service page "Uzyskaj
 * numer PESEL" (issued by a municipal office, free of charge, 11 digits);
 * umowa zlecenie — the Civil Code arts. 734–751 (a contract of mandate, outside
 * the Labour Code) and the minimum hourly rate that has applied to it since
 * 1 January 2017; the pharmacy phrases are ordinary dictionary Polish.
 */
export const MODULES: readonly LearningModule[] = [
  {
    id: 'pesel',
    number: 66,
    title: 'How to register for a PESEL',
    description: 'Four questions on the number almost every Polish office will ask you for.',
    questions: [
      {
        id: 'pesel.what',
        prompt: 'What is a PESEL?',
        options: [
          'An 11-digit national identification number',
          'A residence card for foreigners',
          'A tax return form',
          'A Polish bank account number',
        ],
        answer: 0,
      },
      {
        id: 'pesel.where',
        prompt: 'Where do you apply for a PESEL number?',
        options: [
          'At a police station',
          'At a municipal office (urząd gminy or urząd miasta)',
          'At a tax office (urząd skarbowy)',
          'At a post office',
        ],
        answer: 1,
      },
      {
        id: 'pesel.bring',
        prompt: 'What do you need to bring to apply?',
        options: [
          'A Polish driving licence',
          'A letter from your landlord',
          'A valid identity document, such as your passport',
          'Nothing at all',
        ],
        answer: 2,
      },
      {
        id: 'pesel.fee',
        prompt: 'How much does it cost to get a PESEL number?',
        options: ['It is free', '50 zł', '100 zł', '17 zł stamp duty'],
        answer: 0,
      },
    ],
  },
  {
    id: 'umowa_zlecenie',
    number: 67,
    title: 'What your umowa zlecenie means',
    description: 'Three questions on the most common contract offered to new arrivals.',
    questions: [
      {
        id: 'zlecenie.what',
        prompt: 'What kind of contract is an umowa zlecenie?',
        options: [
          'A permanent employment contract under the Labour Code',
          'A civil-law contract of mandate, not an employment contract',
          'A tenancy agreement',
          'A work permit',
        ],
        answer: 1,
      },
      {
        id: 'zlecenie.leave',
        prompt: 'Does the Labour Code give you paid annual leave on an umowa zlecenie?',
        options: [
          'Yes, 20 or 26 days a year',
          'Yes, but only after a year',
          'No — the Labour Code’s paid leave does not apply to it',
        ],
        answer: 2,
      },
      {
        id: 'zlecenie.minimum',
        prompt: 'Is there a legal minimum hourly rate for work on an umowa zlecenie?',
        options: [
          'Yes — a minimum hourly rate set by law applies',
          'No — any rate may be agreed',
          'Only for work done at weekends',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'pharmacy_polish',
    number: 68,
    title: 'Polish you need at the pharmacy',
    description: 'Five words and phrases for the counter.',
    questions: [
      {
        id: 'pharmacy.apteka',
        prompt: 'What does “apteka” mean?',
        options: ['Pharmacy', 'Hospital', 'Doctor’s surgery', 'Shop'],
        answer: 0,
      },
      {
        id: 'pharmacy.recepta',
        prompt: 'What is a “recepta”?',
        options: ['A receipt', 'A prescription', 'A recipe', 'An appointment'],
        answer: 1,
      },
      {
        id: 'pharmacy.bez_recepty',
        prompt: 'A medicine sold “bez recepty” is…',
        options: [
          'Out of stock',
          'Only for children',
          'Available without a prescription',
          'Free of charge',
        ],
        answer: 2,
      },
      {
        id: 'pharmacy.glowa',
        prompt: 'How do you say “I have a headache”?',
        options: ['Boli mnie głowa', 'Boli mnie brzuch', 'Mam gorączkę', 'Jestem zmęczony'],
        answer: 0,
      },
      {
        id: 'pharmacy.ile',
        prompt: 'What does “Ile to kosztuje?” mean?',
        options: ['Where is it?', 'How much does it cost?', 'Do you have it?', 'Is it strong?'],
        answer: 1,
      },
    ],
  },
];

/** A module by its id, or by its mission id (`learning.<id>`). 404 otherwise. */
export function moduleFor(id: string): LearningModule {
  const bare = id.startsWith('learning.') ? id.slice('learning.'.length) : id;
  const found = MODULES.find((module) => module.id === bare);
  if (!found) throw new DomainError('not_found', 'learning module not found');
  return found;
}

export interface Progress {
  attempts: number;
  bestCorrect: number;
  completedAt: Iso | null;
}

/** Every module's progress for one person, keyed by module id. */
export async function progressFor(db: Db, userId: string): Promise<Map<string, Progress>> {
  const rows = await db.all<{
    module_id: string;
    attempts: number;
    best_correct: number;
    completed_at: string | null;
  }>(
    `SELECT module_id, attempts, best_correct, completed_at FROM learning_progress WHERE user_id = $u`,
    { u: userId },
  );
  return new Map(
    rows.map((row) => [
      row.module_id,
      { attempts: row.attempts, bestCorrect: row.best_correct, completedAt: row.completed_at },
    ]),
  );
}

/** A module as a client may see it before answering: no `answer` anywhere. */
export function publicModule(module: LearningModule) {
  return {
    id: module.id,
    missionId: `learning.${module.id}`,
    number: module.number,
    title: module.title,
    description: module.description,
    questions: module.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: question.options,
    })),
  };
}

export interface Graded {
  moduleId: string;
  correct: number;
  total: number;
  /** Whether this submission passed — every question right. */
  passed: boolean;
  /** Whether the module has *ever* been passed, this submission included. */
  completed: boolean;
  results: Array<{ questionId: string; chosen: number | null; correct: boolean; answer: number }>;
}

/**
 * Mark one submission and record the outcome.
 *
 * `answers` is one option index per question, in the module's order; a missing
 * or out-of-range entry is simply wrong rather than a 400, because a person who
 * skipped a question has answered it wrongly and deserves to be told which one
 * rather than to have the whole form refused.
 *
 * The upsert keeps the **best** score and the **first** pass: a worse second
 * attempt must not un-complete a module whose mission is waiting to be claimed.
 * `learning_progress.best_correct` is qualified in the `CASE` because Postgres
 * refuses the bare column name inside `ON CONFLICT … DO UPDATE` as ambiguous.
 */
export async function grade(
  db: Db,
  input: { userId: string; moduleId: string; answers: unknown[]; at?: Iso },
): Promise<Graded> {
  const module = moduleFor(input.moduleId);
  const at = input.at ?? now();

  const results = module.questions.map((question, index) => {
    const raw = input.answers[index];
    const chosen = typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
    return { questionId: question.id, chosen, correct: chosen === question.answer, answer: question.answer };
  });
  const correct = results.filter((result) => result.correct).length;
  const passed = correct === module.questions.length;

  await db.run(
    `INSERT INTO learning_progress (user_id, module_id, attempts, best_correct, completed_at, updated_at)
     VALUES ($u, $m, 1, $c, $done, $t)
       ON CONFLICT (user_id, module_id) DO UPDATE
         SET attempts = learning_progress.attempts + 1,
             best_correct = (CASE WHEN learning_progress.best_correct > $c
                                  THEN learning_progress.best_correct ELSE $c END),
             completed_at = COALESCE(learning_progress.completed_at, $done),
             updated_at = $t`,
    { u: input.userId, m: module.id, c: correct, done: passed ? at : null, t: at },
  );

  const stored = (await progressFor(db, input.userId)).get(module.id);
  return {
    moduleId: module.id,
    correct,
    total: module.questions.length,
    passed,
    completed: Boolean(stored?.completedAt),
    results,
  };
}
