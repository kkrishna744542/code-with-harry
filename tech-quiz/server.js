import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(path.join(__dirname, 'db', 'quiz.db'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  correct_choice_index INTEGER NOT NULL,
  explanation TEXT,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL,
  choice_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE (question_id, choice_index),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  user_name TEXT,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  selected_index INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
`);

function seedDatabase() {
  const quizCount = db.prepare('SELECT COUNT(*) as count FROM quizzes').get().count;
  if (quizCount > 0) {
    return;
  }

  const insertQuiz = db.prepare('INSERT INTO quizzes (title, description) VALUES (?, ?)');
  const insertQuestion = db.prepare('INSERT INTO questions (quiz_id, text, correct_choice_index, explanation) VALUES (?, ?, ?, ?)');
  const insertChoice = db.prepare('INSERT INTO choices (question_id, choice_index, text) VALUES (?, ?, ?)');

  const seedData = [
    {
      title: 'Tech Quiz',
      description: 'General technology quiz covering Web, JavaScript, CSS, Git, and Computer Science basics.',
      questions: [
        {
          text: 'Which HTML tag is used to include JavaScript code?',
          choices: ['<js>', '<javascript>', '<script>', '<code>'],
          correct: 2,
          explanation: 'The <script> tag is used to embed JavaScript code in HTML.'
        },
        {
          text: 'Which HTTP method is idempotent?',
          choices: ['POST', 'PUT', 'PATCH', 'CONNECT'],
          correct: 1,
          explanation: 'PUT is idempotent; multiple identical requests have the same effect.'
        },
        {
          text: 'In CSS, which property is used to change text color?',
          choices: ['font-color', 'color', 'text-color', 'foreground'],
          correct: 1,
          explanation: 'The color property sets the text color.'
        },
        {
          text: 'Which of the following is NOT a JavaScript primitive type?',
          choices: ['string', 'number', 'object', 'undefined'],
          correct: 2,
          explanation: 'object is not a primitive; primitives include string, number, boolean, null, undefined, symbol, bigint.'
        },
        {
          text: 'What does CSS stand for?',
          choices: ['Cascading Style Sheets', 'Computer Styled Sections', 'Creative Style System', 'Cascading Simple Sheets'],
          correct: 0,
          explanation: 'CSS stands for Cascading Style Sheets.'
        },
        {
          text: 'Which command creates a new Git branch and switches to it?',
          choices: ['git checkout -b <name>', 'git branch <name> && git switch', 'git new <name>', 'git commit -b <name>'],
          correct: 0,
          explanation: 'git checkout -b <name> both creates and switches to the new branch (or use git switch -c <name>).'
        },
        {
          text: 'Which array method returns a new array with elements that pass a test?',
          choices: ['map()', 'filter()', 'reduce()', 'forEach()'],
          correct: 1,
          explanation: 'filter() returns a new array with elements that pass the predicate.'
        },
        {
          text: 'Which protocol is used to secure HTTP?',
          choices: ['FTP', 'SSH', 'TLS', 'SFTP'],
          correct: 2,
          explanation: 'HTTPS uses TLS to secure communications.'
        },
        {
          text: 'What is the time complexity of binary search (average case) on a sorted array?',
          choices: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
          correct: 1,
          explanation: 'Binary search runs in logarithmic time, O(log n).'
        },
        {
          text: 'Which HTTP status code indicates a resource was not found?',
          choices: ['200', '301', '404', '500'],
          correct: 2,
          explanation: '404 Not Found indicates the resource is unavailable.'
        }
      ]
    }
  ];

  const transaction = db.transaction(() => {
    for (const quiz of seedData) {
      const result = insertQuiz.run(quiz.title, quiz.description);
      const quizId = result.lastInsertRowid;
      for (const q of quiz.questions) {
        const qResult = insertQuestion.run(quizId, q.text, q.correct, q.explanation || null);
        const questionId = qResult.lastInsertRowid;
        q.choices.forEach((choiceText, idx) => {
          insertChoice.run(questionId, idx, choiceText);
        });
      }
    }
  });

  transaction();
}

seedDatabase();

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/quizzes', (req, res) => {
  const quizzes = db.prepare(`
    SELECT q.id, q.title, q.description, COUNT(qq.id) AS numQuestions
    FROM quizzes q
    LEFT JOIN questions qq ON qq.quiz_id = q.id
    GROUP BY q.id
    ORDER BY q.id ASC
  `).all();
  res.json(quizzes);
});

app.get('/api/quizzes/:quizId', (req, res) => {
  const quizId = Number(req.params.quizId);
  const quiz = db.prepare('SELECT id, title, description FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
  res.json(quiz);
});

app.get('/api/quizzes/:quizId/questions', (req, res) => {
  const quizId = Number(req.params.quizId);
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const questions = db.prepare('SELECT id, text FROM questions WHERE quiz_id = ? ORDER BY id ASC').all(quizId);
  const choiceStmt = db.prepare('SELECT choice_index as idx, text FROM choices WHERE question_id = ? ORDER BY choice_index ASC');
  const payload = questions.map((q) => ({
    id: q.id,
    text: q.text,
    choices: choiceStmt.all(q.id).map((c) => ({ index: c.idx, text: c.text }))
  }));
  res.json(payload);
});

app.post('/api/quizzes/:quizId/submit', (req, res) => {
  const quizId = Number(req.params.quizId);
  const { answers, userName } = req.body || {};

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'answers must be a non-empty array' });
  }

  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const getQuestion = db.prepare('SELECT id, correct_choice_index, text FROM questions WHERE id = ? AND quiz_id = ?');
  const getChoices = db.prepare('SELECT choice_index as idx, text FROM choices WHERE question_id = ? ORDER BY choice_index ASC');

  let score = 0;
  const details = [];
  for (const ans of answers) {
    const questionId = Number(ans.questionId);
    const selectedIndex = Number(ans.choiceIndex);
    if (Number.isNaN(questionId) || Number.isNaN(selectedIndex)) {
      return res.status(400).json({ error: 'answers contain invalid values' });
    }
    const q = getQuestion.get(questionId, quizId);
    if (!q) {
      return res.status(400).json({ error: `Question ${questionId} not found in quiz ${quizId}` });
    }
    const correct = q.correct_choice_index === selectedIndex;
    if (correct) score += 1;
    const choices = getChoices.all(questionId);
    details.push({
      questionId,
      questionText: q.text,
      selectedIndex,
      correctIndex: q.correct_choice_index,
      choices,
      isCorrect: correct
    });
  }

  const totalQuestions = db.prepare('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?').get(quizId).c;

  const nowIso = new Date().toISOString();
  const insertAttempt = db.prepare('INSERT INTO attempts (quiz_id, user_name, score, total, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertAttemptAnswer = db.prepare('INSERT INTO attempt_answers (attempt_id, question_id, selected_index, is_correct) VALUES (?, ?, ?, ?)');

  const tx = db.transaction(() => {
    const attemptRes = insertAttempt.run(quizId, userName || null, score, totalQuestions, nowIso);
    const attemptId = attemptRes.lastInsertRowid;
    for (const d of details) {
      insertAttemptAnswer.run(attemptId, d.questionId, d.selectedIndex, d.isCorrect ? 1 : 0);
    }
    return attemptId;
  });

  const attemptId = tx();

  res.json({
    attemptId,
    quizId,
    score,
    total: totalQuestions,
    percentage: Math.round((score / totalQuestions) * 100),
    details
  });
});

app.get('/api/attempts', (req, res) => {
  const quizId = req.query.quizId ? Number(req.query.quizId) : null;
  const rows = quizId
    ? db.prepare(`
        SELECT a.id, a.quiz_id as quizId, q.title as quizTitle, a.user_name as userName, a.score, a.total, a.created_at as createdAt
        FROM attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        WHERE a.quiz_id = ?
        ORDER BY a.id DESC
        LIMIT 50
      `).all(quizId)
    : db.prepare(`
        SELECT a.id, a.quiz_id as quizId, q.title as quizTitle, a.user_name as userName, a.score, a.total, a.created_at as createdAt
        FROM attempts a
        JOIN quizzes q ON q.id = a.quiz_id
        ORDER BY a.id DESC
        LIMIT 50
      `).all();
  res.json(rows);
});

app.get('/api/attempts/:attemptId', (req, res) => {
  const attemptId = Number(req.params.attemptId);
  const attempt = db.prepare(`
    SELECT a.id, a.quiz_id as quizId, q.title as quizTitle, a.user_name as userName, a.score, a.total, a.created_at as createdAt
    FROM attempts a
    JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ?
  `).get(attemptId);
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

  const answers = db.prepare(`
    SELECT aa.question_id as questionId, aa.selected_index as selectedIndex, aa.is_correct as isCorrect,
           qu.text as questionText, qu.correct_choice_index as correctIndex
    FROM attempt_answers aa
    JOIN questions qu ON qu.id = aa.question_id
    WHERE aa.attempt_id = ?
    ORDER BY aa.id ASC
  `).all(attemptId);

  const choiceStmt = db.prepare('SELECT choice_index as idx, text FROM choices WHERE question_id = ? ORDER BY choice_index ASC');
  const details = answers.map((a) => ({
    ...a,
    isCorrect: a.isCorrect === 1,
    choices: choiceStmt.all(a.questionId)
  }));

  res.json({ ...attempt, details });
});

app.post('/api/admin/questions', (req, res) => {
  const { quizId, text, choices, correctIndex, explanation } = req.body || {};
  if (!quizId || !text || !Array.isArray(choices) || choices.length < 2 || typeof correctIndex !== 'number') {
    return res.status(400).json({ error: 'quizId, text, choices[>=2], and correctIndex are required' });
  }
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

  const insertQuestion = db.prepare('INSERT INTO questions (quiz_id, text, correct_choice_index, explanation) VALUES (?, ?, ?, ?)');
  const insertChoice = db.prepare('INSERT INTO choices (question_id, choice_index, text) VALUES (?, ?, ?)');

  const tx = db.transaction(() => {
    const qRes = insertQuestion.run(quizId, text, correctIndex, explanation || null);
    const questionId = qRes.lastInsertRowid;
    choices.forEach((c, idx) => insertChoice.run(questionId, idx, c));
    return questionId;
  });

  const questionId = tx();
  res.status(201).json({ questionId });
});

app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tech Quiz server listening on http://localhost:${PORT}`);
});