const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
	quizId: null,
	quiz: null,
	questions: [],
};

async function fetchJSON(url, options) {
	const res = await fetch(url, options);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

function showSection(id) {
	$('#quiz-list-section').classList.toggle('hidden', id !== 'list');
	$('#quiz-section').classList.toggle('hidden', id !== 'quiz');
	$('#result-section').classList.toggle('hidden', id !== 'result');
}

function renderQuizList(quizzes) {
	const list = $('#quiz-list');
	list.innerHTML = '';
	quizzes.forEach((q) => {
		const card = document.createElement('div');
		card.className = 'card';
		card.innerHTML = `
			<h3>${q.title}</h3>
			<p class="muted">${q.description}</p>
			<div class="controls">
				<span class="tag">${q.numQuestions} questions</span>
				<button data-quiz-id="${q.id}">Start</button>
			</div>
		`;
		card.querySelector('button').addEventListener('click', () => startQuiz(q.id));
		list.appendChild(card);
	});
}

function renderQuestions(quiz, questions) {
	$('#quiz-title').textContent = quiz.title;
	$('#quiz-description').textContent = quiz.description;
	const container = $('#question-container');
	container.innerHTML = '';
	questions.forEach((q, idx) => {
		const qDiv = document.createElement('div');
		qDiv.className = 'question';
		qDiv.innerHTML = `
			<div class="q-text"><strong>Q${idx + 1}.</strong> ${q.text}</div>
			<div class="choices">
				${q.choices
					.map(
						(c) => `
						<label class="choice">
							<input type="radio" name="q-${q.id}" value="${c.index}" />
							<span>${c.text}</span>
						</label>`
					)
					.join('')}
			</div>
		`;
		container.appendChild(qDiv);
	});
}

async function startQuiz(quizId) {
	state.quizId = quizId;
	const [quiz, questions] = await Promise.all([
		fetchJSON(`/api/quizzes/${quizId}`),
		fetchJSON(`/api/quizzes/${quizId}/questions`),
	]);
	state.quiz = quiz;
	state.questions = questions;
	renderQuestions(quiz, questions);
	showSection('quiz');
}

function collectAnswers() {
	const answers = [];
	for (const q of state.questions) {
		const picked = $(`input[name="q-${q.id}"]:checked`);
		if (!picked) return null; // require all questions answered
		answers.push({ questionId: q.id, choiceIndex: Number(picked.value) });
	}
	return answers;
}

async function submitQuiz() {
	if (!state.quizId) return;
	const userName = $('#user-name').value.trim() || null;
	const answers = collectAnswers();
	if (!answers) {
		alert('Please answer all questions before submitting.');
		return;
	}
	const result = await fetchJSON(`/api/quizzes/${state.quizId}/submit`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ userName, answers }),
	});
	renderResult(result);
	showSection('result');
}

function renderResult(result) {
	const { score, total, percentage, details } = result;
	$('#result-summary').innerHTML = `
		<h3>Score: ${score}/${total} (${percentage}%)</h3>
	`;
	const container = $('#result-details');
	container.innerHTML = '';
	details.forEach((d, idx) => {
		const isCorrect = d.isCorrect;
		const div = document.createElement('div');
		div.className = 'question';
		div.innerHTML = `
			<div><strong>Q${idx + 1}.</strong> ${d.questionText} ${isCorrect ? '<span class="result-correct">✔</span>' : '<span class="result-wrong">✖</span>'}</div>
			<div class="choices">
				${d.choices
					.map((c) => {
						const marker = c.idx === d.correctIndex ? ' (correct)' : c.idx === d.selectedIndex ? ' (your answer)' : '';
						const cls = c.idx === d.correctIndex ? 'result-correct' : c.idx === d.selectedIndex && !isCorrect ? 'result-wrong' : '';
						return `<div class="choice ${cls}"><span>${c.idx}. ${c.text}${marker}</span></div>`;
					})
					.join('')}
			</div>
		`;
		container.appendChild(div);
	});
}

function resetToHome() {
	state.quizId = null;
	state.quiz = null;
	state.questions = [];
	$('#user-name').value = '';
	showSection('list');
}

async function init() {
	try {
		const quizzes = await fetchJSON('/api/quizzes');
		renderQuizList(quizzes);
		showSection('list');
		$('#submit-quiz').addEventListener('click', () => {
			submitQuiz().catch((e) => alert('Submit failed'));
		});
		$('#back-home').addEventListener('click', resetToHome);
		$('#new-quiz').addEventListener('click', resetToHome);
	} catch (e) {
		console.error(e);
		alert('Failed to load quizzes');
	}
}

init();