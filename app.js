(function () {
  'use strict';

  const DATA = window.SCM_DATA;
  const STORAGE_KEY = 'scm-review-progress-v1';
  const THEME_KEY = 'scm-review-theme-v1';
  const LESSON_NAMES = {
    l1: 'محاضرة 1',
    l2: 'محاضرة 2',
    l3: 'محاضرة 3 · Distribution',
    l6: 'محاضرة 6 · Barcode'
  };
  const QUICK_LESSONS = ['l1', 'l1', 'l2', 'l2', 'l2', 'l2', 'l2', 'l3', 'l3', 'l3', 'l6', 'l6'];
  const BANK_LABELS = [
    'محاضرتا 1 و2',
    'محاضرة 3 · Distribution',
    'محاضرة 6 · Barcode'
  ];

  const QUESTIONS = [];
  let visibleNumber = 1;
  DATA.banks.forEach(function (bank, bankIndex) {
    bank.questions.forEach(function (row, questionIndex) {
      QUESTIONS.push({
        id: 'b' + bankIndex + '-q' + (questionIndex + 1),
        number: visibleNumber++,
        bankIndex: bankIndex,
        bankName: bank.name,
        kind: 'core',
        lessonId: bankIndex === 0 ? (questionIndex < 11 ? 'l1' : 'l2') : (bankIndex === 1 ? 'l3' : 'l6'),
        question: row.question,
        options: row.options,
        answer: row.answer
      });
    });
  });
  DATA.quickQuiz.forEach(function (row, index) {
    QUESTIONS.push({
      id: 'quick-q' + (index + 1),
      number: index + 1,
      bankIndex: 'quick',
      bankName: 'اختبر نفسك · الشرح البصري',
      kind: 'quick',
      lessonId: QUICK_LESSONS[index],
      question: row.question,
      options: row.options,
      answer: row.answer
    });
  });

  const CORE_QUESTIONS = QUESTIONS.filter(function (q) { return q.kind === 'core'; });
  const QUESTION_BY_ID = new Map(QUESTIONS.map(function (q) { return [q.id, q]; }));
  let progress = readProgress();
  let currentStudy = null;
  let currentQuiz = null;
  let toastTimer = 0;

  function $(selector, root) { return (root || document).querySelector(selector); }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }
  function button(text, className, handler) {
    const element = make('button', 'button' + (className ? ' ' + className : ''), text);
    element.type = 'button';
    element.addEventListener('click', handler);
    return element;
  }
  function readProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const answers = parsed && parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {};
      const clean = {};
      Object.keys(answers).forEach(function (id) {
        const q = QUESTIONS.find(function (item) { return item.id === id; });
        const value = answers[id];
        if (q && Number.isInteger(value) && value >= 0 && value < q.options.length) clean[id] = value;
      });
      return { answers: clean };
    } catch (error) {
      return { answers: {} };
    }
  }
  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, answers: progress.answers }));
    } catch (error) {
      showToast('تعذر حفظ التقدم على هذا المتصفح. يمكنك تصديره كملف.');
    }
  }
  function saveAnswer(question, optionIndex) {
    progress.answers[question.id] = optionIndex;
    saveProgress();
  }
  function clearAnswer(question) {
    delete progress.answers[question.id];
    saveProgress();
  }
  function answerStatus(question) {
    if (!Object.prototype.hasOwnProperty.call(progress.answers, question.id)) return 'unanswered';
    return progress.answers[question.id] === question.answer ? 'correct' : 'wrong';
  }
  function answerLabel(status) {
    return status === 'correct' ? 'إجابة صحيحة' : (status === 'wrong' ? 'إجابة خاطئة' : 'لم تُحل بعد');
  }
  function selectedIds(value) {
    if (value === 'all') return CORE_QUESTIONS.map(function (q) { return q.id; });
    if (value === 'quick') return QUESTIONS.filter(function (q) { return q.kind === 'quick'; }).map(function (q) { return q.id; });
    if (value === 'wrong') return QUESTIONS.filter(function (q) { return answerStatus(q) === 'wrong'; }).map(function (q) { return q.id; });
    if (value === 'unanswered') return QUESTIONS.filter(function (q) { return answerStatus(q) === 'unanswered'; }).map(function (q) { return q.id; });
    const bankMatch = /^bank-(\d+)$/.exec(value);
    if (bankMatch) return QUESTIONS.filter(function (q) { return q.kind === 'core' && q.bankIndex === Number(bankMatch[1]); }).map(function (q) { return q.id; });
    return [];
  }
  function fromIds(ids) { return ids.map(function (id) { return QUESTION_BY_ID.get(id); }).filter(Boolean); }
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 3400);
  }
  function setView(view) {
    document.querySelectorAll('[data-view-panel]').forEach(function (panel) {
      const active = panel.dataset.viewPanel === view;
      panel.hidden = !active;
      panel.classList.toggle('is-visible', active);
    });
    document.querySelectorAll('.nav-button').forEach(function (navButton) {
      const active = navButton.dataset.view === view;
      navButton.classList.toggle('is-current', active);
      if (active) navButton.setAttribute('aria-current', 'page');
      else navButton.removeAttribute('aria-current');
    });
    if (view === 'dashboard') renderDashboard();
    if (view === 'library') renderLibrary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function progressCounts(questions) {
    return questions.reduce(function (counts, q) {
      counts[answerStatus(q)] += 1;
      return counts;
    }, { correct: 0, wrong: 0, unanswered: 0 });
  }
  function buildProgressTrack(done, total) {
    const track = make('div', 'progress-track');
    const fill = make('span');
    fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    track.appendChild(fill);
    return track;
  }
  function renderDashboard() {
    const root = $('#dashboardRoot');
    root.replaceChildren();
    const counts = progressCounts(CORE_QUESTIONS);
    const done = counts.correct + counts.wrong;
    const metrics = make('div', 'dashboard-grid');
    [
      [String(CORE_QUESTIONS.length), 'سؤال في بنك المراجعة'],
      [String(done), 'سؤال أُجيب عنه'],
      [String(counts.correct), 'إجابة صحيحة'],
      [String(counts.wrong), 'إجابة خاطئة']
    ].forEach(function (item) {
      const metric = make('div', 'metric-card');
      metric.appendChild(make('strong', '', item[0]));
      metric.appendChild(make('span', '', item[1]));
      metrics.appendChild(metric);
    });
    root.appendChild(metrics);

    const totalProgress = make('div', 'card');
    totalProgress.appendChild(make('h3', '', 'تقدم بنك الأسئلة'));
    totalProgress.appendChild(make('p', 'muted', done + ' من ' + CORE_QUESTIONS.length + ' تمت الإجابة عنها · ' + counts.unanswered + ' لم تُحل بعد'));
    totalProgress.appendChild(buildProgressTrack(done, CORE_QUESTIONS.length));
    const actions = make('div', 'dashboard-actions');
    actions.appendChild(button('ابدأ المذاكرة', 'button-primary', function () { setView('study'); $('#startStudy').click(); }));
    actions.appendChild(button('اختبر نفسك', '', function () { setView('quiz'); }));
    actions.appendChild(button('راجع الأخطاء (' + counts.wrong + ')', '', function () {
      startStudy(CORE_QUESTIONS.filter(function (q) { return answerStatus(q) === 'wrong'; }).map(function (q) { return q.id; }), 'الأخطاء المحفوظة');
    }));
    actions.appendChild(button('حل غير المحلول (' + counts.unanswered + ')', '', function () {
      startStudy(CORE_QUESTIONS.filter(function (q) { return answerStatus(q) === 'unanswered'; }).map(function (q) { return q.id; }), 'الأسئلة غير المحلولة');
    }));
    totalProgress.appendChild(actions);
    root.appendChild(totalProgress);

    const bankGrid = make('div', 'bank-grid');
    DATA.banks.forEach(function (bank, bankIndex) {
      const bankQuestions = CORE_QUESTIONS.filter(function (q) { return q.bankIndex === bankIndex; });
      const bankCounts = progressCounts(bankQuestions);
      const answered = bankCounts.correct + bankCounts.wrong;
      const card = make('article', 'bank-card');
      card.appendChild(make('h3', '', BANK_LABELS[bankIndex]));
      card.appendChild(make('p', '', bankQuestions.length + ' سؤال · ' + answered + ' تمت الإجابة عنها · ' + bankCounts.wrong + ' خطأ'));
      card.appendChild(buildProgressTrack(answered, bankQuestions.length));
      card.appendChild(button('ابدأ المجموعة', 'button-primary', function () {
        $('#studySet').value = 'bank-' + bankIndex;
        startStudy(selectedIds('bank-' + bankIndex), BANK_LABELS[bankIndex]);
      }));
      bankGrid.appendChild(card);
    });
    root.appendChild(bankGrid);

    const quickCounts = progressCounts(QUESTIONS.filter(function (q) { return q.kind === 'quick'; }));
    const quickCard = make('div', 'card');
    quickCard.appendChild(make('h3', '', 'اختبر نفسك · من ملف الشرح البصري'));
    quickCard.appendChild(make('p', 'muted', '12 سؤال من نفس نمط بنك الدكتور. اضغط على الإجابة.'));
    quickCard.appendChild(make('p', 'muted', 'هذه الأسئلة كما وردت في قسم «اختبر نفسك» بملف الشرح، وتظهر كمجموعة منفصلة عن بنك الأسئلة.'));
    quickCard.appendChild(make('p', 'muted', (quickCounts.correct + quickCounts.wrong) + ' من 12 أُجيب عنها.'));
    quickCard.appendChild(button('ابدأ الأسئلة القصيرة', '', function () {
      $('#studySet').value = 'quick';
      startStudy(selectedIds('quick'), 'اختبر نفسك · الشرح البصري');
    }));
    root.appendChild(quickCard);

    const note = make('div', 'card notice');
    note.appendChild(make('strong', '', 'مراجعة عدد الأسئلة في المصدر'));
    note.appendChild(make('p', '', 'عنوان ملف البنك يذكر 100 سؤال. عند فحص البيانات المرفوعة، وُجدت 50 + 25 + 25 = 100 سؤالًا صالحًا. هذا يختلف عن رقم 98 المذكور في الطلب؛ احتفظ الموقع بكل أسئلة الملف ولم يضف أسئلة جديدة. راجع README للتفصيل.'));
    root.appendChild(note);
  }

  function lessonTitle(question) { return LESSON_NAMES[question.lessonId] || ''; }
  function appendSourceLink(parent, question) {
    if (!question.lessonId) return;
    const source = button('افتح شرح ' + lessonTitle(question), '', function () { openLesson(question.lessonId); });
    source.classList.add('source-link');
    parent.appendChild(source);
  }
  function openLesson(lessonId) {
    setView('lessons');
    selectLesson(lessonId);
    window.setTimeout(function () {
      const section = $('#' + lessonId);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 30);
  }
  function selectLesson(lessonId) {
    document.querySelectorAll('[data-lesson-select]').forEach(function (tab) {
      const active = tab.dataset.lessonSelect === lessonId;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('.lesson-page').forEach(function (section) {
      section.hidden = section.id !== lessonId;
    });
  }
  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function startStudy(ids, title) {
    if (!ids || !ids.length) {
      showToast('لا توجد أسئلة في هذه المجموعة الآن.');
      return;
    }
    currentStudy = { ids: ids.slice(), title: title || 'المذاكرة', index: 0 };
    setView('study');
    renderStudyQuestion();
  }
  function studyNumber(question, position) {
    return question.kind === 'quick' ? 'سؤال قصير ' + question.number : 'سؤال البنك ' + question.number;
  }
  function makeOptionLabel(question, optionIndex, selectedIndex, disabled, mode, orderIndex) {
    const label = make('label', 'option-label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = mode + '-' + question.id;
    input.value = String(optionIndex);
    input.checked = selectedIndex === optionIndex;
    input.disabled = Boolean(disabled);
    input.setAttribute('aria-label', 'اختيار ' + String.fromCharCode(65 + orderIndex) + ': ' + question.options[optionIndex]);
    label.appendChild(input);
    label.appendChild(make('span', '', String.fromCharCode(65 + orderIndex) + ') ' + question.options[optionIndex]));
    if (selectedIndex === optionIndex) label.classList.add('is-picked');
    if (disabled && optionIndex === question.answer) label.classList.add('is-correct');
    if (disabled && selectedIndex === optionIndex && selectedIndex !== question.answer) label.classList.add('is-wrong');
    return { label: label, input: input };
  }
  function appendStudyFeedback(card, question, selectedIndex) {
    const correct = selectedIndex === question.answer;
    const feedback = make('div', 'feedback ' + (correct ? 'is-correct' : 'is-wrong'));
    feedback.setAttribute('role', 'status');
    feedback.appendChild(make('strong', '', correct ? 'إجابة صحيحة' : 'إجابة غير صحيحة'));
    feedback.appendChild(make('p', '', 'الإجابة الصحيحة: ' + String.fromCharCode(65 + question.answer) + ') ' + question.options[question.answer]));
    appendSourceLink(feedback, question);
    card.appendChild(feedback);
  }
  function renderStudyQuestion() {
    if (!currentStudy) return;
    const root = $('#studyRoot');
    root.replaceChildren();
    if (currentStudy.index >= currentStudy.ids.length) { renderStudySummary(); return; }
    const question = QUESTION_BY_ID.get(currentStudy.ids[currentStudy.index]);
    if (!question) return;
    const selectedIndex = progress.answers[question.id];
    const card = make('article', 'card question-card');
    const top = make('div', 'question-top');
    top.appendChild(make('span', '', currentStudy.title));
    top.appendChild(make('span', '', (currentStudy.index + 1) + ' / ' + currentStudy.ids.length));
    card.appendChild(top);
    card.appendChild(buildProgressTrack(currentStudy.ids.filter(function (id) { return QUESTION_BY_ID.has(id) && answerStatus(QUESTION_BY_ID.get(id)) !== 'unanswered'; }).length, currentStudy.ids.length));
    const label = make('div', 'muted', studyNumber(question, currentStudy.index) + ' · ' + question.bankName);
    card.appendChild(label);
    card.appendChild(make('h3', 'question-text', question.question));
    const fieldset = document.createElement('fieldset');
    const legend = make('legend', 'visually-hidden', 'اختر إجابة واحدة');
    fieldset.appendChild(legend);
    const options = make('div', 'option-list');
    question.options.forEach(function (option, optionIndex) {
      const optionView = makeOptionLabel(question, optionIndex, selectedIndex, selectedIndex !== undefined, 'study', optionIndex);
      optionView.input.addEventListener('change', function () {
        saveAnswer(question, optionIndex);
        renderStudyQuestion();
      });
      options.appendChild(optionView.label);
    });
    fieldset.appendChild(options);
    card.appendChild(fieldset);
    if (selectedIndex !== undefined) {
      appendStudyFeedback(card, question, selectedIndex);
      card.appendChild(button('أعد المحاولة', '', function () { clearAnswer(question); renderStudyQuestion(); }));
    }
    const navigation = make('div', 'question-nav');
    const group = make('div', 'nav-group');
    const previous = button('السابق', '', function () { currentStudy.index -= 1; renderStudyQuestion(); });
    previous.disabled = currentStudy.index === 0;
    group.appendChild(previous);
    group.appendChild(button(currentStudy.index === currentStudy.ids.length - 1 ? 'إنهاء المجموعة' : 'التالي', 'button-primary', function () {
      currentStudy.index += 1;
      renderStudyQuestion();
    }));
    navigation.appendChild(group);
    navigation.appendChild(button('القائمة الرئيسية', '', function () { setView('dashboard'); }));
    card.appendChild(navigation);
    const jump = make('div', 'answer-grid');
    currentStudy.ids.forEach(function (id, index) {
      const item = QUESTION_BY_ID.get(id);
      if (!item) return;
      const jumpButton = make('button', '', item.kind === 'quick' ? item.number : item.number);
      jumpButton.type = 'button';
      jumpButton.title = studyNumber(item, index);
      jumpButton.setAttribute('aria-label', 'انتقل إلى ' + studyNumber(item, index));
      jumpButton.setAttribute('aria-current', index === currentStudy.index ? 'step' : 'false');
      const status = answerStatus(item);
      if (status === 'correct') jumpButton.classList.add('is-correct');
      if (status === 'wrong') jumpButton.classList.add('is-wrong');
      jumpButton.addEventListener('click', function () { currentStudy.index = index; renderStudyQuestion(); });
      jump.appendChild(jumpButton);
    });
    card.appendChild(jump);
    root.appendChild(card);
  }
  function renderStudySummary() {
    const root = $('#studyRoot');
    root.replaceChildren();
    const questions = fromIds(currentStudy.ids);
    const counts = progressCounts(questions);
    const card = make('section', 'card quiz-result');
    card.appendChild(make('p', 'eyebrow', 'انتهت المجموعة'));
    card.appendChild(make('h3', '', currentStudy.title));
    card.appendChild(make('span', 'score-number', counts.correct + ' / ' + questions.length));
    card.appendChild(make('p', 'muted', counts.wrong + ' إجابة خاطئة · ' + counts.unanswered + ' لم تُحل'));
    const actions = make('div', 'dashboard-actions');
    if (counts.wrong) actions.appendChild(button('راجع الأخطاء (' + counts.wrong + ')', 'button-primary', function () {
      startStudy(questions.filter(function (q) { return answerStatus(q) === 'wrong'; }).map(function (q) { return q.id; }), 'مراجعة الأخطاء');
    }));
    if (counts.unanswered) actions.appendChild(button('حل غير المحلول (' + counts.unanswered + ')', '', function () {
      startStudy(questions.filter(function (q) { return answerStatus(q) === 'unanswered'; }).map(function (q) { return q.id; }), 'الأسئلة غير المحلولة');
    }));
    actions.appendChild(button('ابدأ المجموعة من جديد', '', function () { startStudy(currentStudy.ids, currentStudy.title); }));
    actions.appendChild(button('الرئيسية', '', function () { setView('dashboard'); }));
    card.appendChild(actions);
    root.appendChild(card);
  }

  function startQuiz(event) {
    if (event) event.preventDefault();
    const setName = $('#quizSet').value;
    const questions = fromIds(selectedIds(setName));
    if (!questions.length) { showToast('لا توجد أسئلة في هذه المجموعة الآن.'); return; }
    const randomizeQuestions = $('#shuffleQuestions').checked;
    const randomizeOptions = $('#shuffleOptions').checked;
    const list = randomizeQuestions ? shuffle(questions) : questions.slice();
    const timerMinutes = Number($('#timerMinutes').value) || 0;
    currentQuiz = {
      title: setName === 'quick' ? 'اختبر نفسك · الشرح البصري' : (setName === 'all' ? 'كل أسئلة البنك' : (setName.startsWith('bank-') ? BANK_LABELS[Number(setName.slice(5))] : (setName === 'wrong' ? 'الأخطاء المحفوظة' : 'الأسئلة غير المحلولة'))),
      items: list.map(function (question) {
        return { question: question, optionOrder: randomizeOptions ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3] };
      }),
      responses: {},
      deadline: timerMinutes ? Date.now() + timerMinutes * 60 * 1000 : null,
      interval: null,
      finished: false
    };
    $('#quizSetup').hidden = true;
    renderQuiz();
    if (currentQuiz.deadline) {
      currentQuiz.interval = window.setInterval(updateTimer, 1000);
      updateTimer();
    }
  }
  function updateTimer() {
    if (!currentQuiz || !currentQuiz.deadline || currentQuiz.finished) return;
    const remaining = Math.max(0, Math.ceil((currentQuiz.deadline - Date.now()) / 1000));
    const timer = $('#quizTimer');
    if (timer) {
      const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
      const seconds = String(remaining % 60).padStart(2, '0');
      timer.textContent = minutes + ':' + seconds;
      timer.classList.toggle('is-low', remaining <= 60);
      timer.setAttribute('aria-label', 'الوقت المتبقي ' + minutes + ' دقيقة و' + seconds + ' ثانية');
    }
    if (remaining <= 0) finishQuiz(true);
  }
  function renderQuiz() {
    const root = $('#quizRoot');
    root.replaceChildren();
    if (!currentQuiz) return;
    const top = make('div', 'card question-top');
    top.appendChild(make('strong', '', currentQuiz.title + ' · ' + currentQuiz.items.length + ' سؤال'));
    top.appendChild(make('span', '', 'أُجيب عن ' + Object.keys(currentQuiz.responses).length + ' / ' + currentQuiz.items.length));
    if (currentQuiz.deadline) {
      const timer = make('span', 'timer', '');
      timer.id = 'quizTimer';
      timer.setAttribute('role', 'timer');
      timer.setAttribute('aria-live', 'off');
      top.appendChild(timer);
    }
    root.appendChild(top);
    const jump = make('div', 'card');
    jump.appendChild(make('h3', '', 'انتقل إلى سؤال'));
    const jumpGrid = make('div', 'answer-grid');
    currentQuiz.items.forEach(function (item, index) {
      const q = item.question;
      const jumpButton = make('button', '', q.kind === 'quick' ? q.number : q.number);
      jumpButton.type = 'button';
      jumpButton.setAttribute('aria-label', 'انتقل إلى سؤال ' + (index + 1));
      jumpButton.addEventListener('click', function () {
        const target = $('#quiz-item-' + index);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      jumpGrid.appendChild(jumpButton);
    });
    jump.appendChild(jumpGrid);
    root.appendChild(jump);

    currentQuiz.items.forEach(function (item, index) {
      const question = item.question;
      const card = make('article', 'quiz-question');
      card.id = 'quiz-item-' + index;
      const header = make('div', 'question-top');
      header.appendChild(make('strong', '', 'سؤال ' + (index + 1) + ' / ' + currentQuiz.items.length));
      header.appendChild(make('span', '', question.bankName));
      card.appendChild(header);
      card.appendChild(make('h3', 'question-text', question.question));
      const fieldset = document.createElement('fieldset');
      const legend = make('legend', 'visually-hidden', 'اختر إجابة للسؤال ' + (index + 1));
      fieldset.appendChild(legend);
      const options = make('div', 'option-list');
      item.optionOrder.forEach(function (originalIndex, displayIndex) {
        const optionView = makeOptionLabel(question, originalIndex, currentQuiz.responses[question.id], false, 'quiz', displayIndex);
        optionView.input.checked = currentQuiz.responses[question.id] === originalIndex;
        optionView.input.addEventListener('change', function () {
          currentQuiz.responses[question.id] = originalIndex;
          const count = Object.keys(currentQuiz.responses).length;
          const topSummary = $('#quizRoot .question-top');
          if (topSummary) {
            const spans = topSummary.querySelectorAll('span');
            if (spans.length) spans[0].textContent = 'أُجيب عن ' + count + ' / ' + currentQuiz.items.length;
          }
          jumpButtonFor(question.id);
        });
        options.appendChild(optionView.label);
      });
      fieldset.appendChild(options);
      card.appendChild(fieldset);
      root.appendChild(card);
    });
    const submit = make('div', 'card dashboard-actions');
    submit.appendChild(button('إنهاء وتصحيح الاختبار', 'button-primary', function () { finishQuiz(false); }));
    submit.appendChild(button('إلغاء الاختبار', '', function () {
      if (currentQuiz && currentQuiz.interval) window.clearInterval(currentQuiz.interval);
      currentQuiz = null;
      $('#quizSetup').hidden = false;
      root.replaceChildren();
    }));
    root.appendChild(submit);
  }
  function jumpButtonFor(questionId) {
    if (!currentQuiz) return;
    const index = currentQuiz.items.findIndex(function (item) { return item.question.id === questionId; });
    const buttons = $('#quizRoot .answer-grid');
    if (buttons && buttons.children[index]) buttons.children[index].classList.add('is-picked');
  }
  function finishQuiz(timedOut) {
    if (!currentQuiz || currentQuiz.finished) return;
    currentQuiz.finished = true;
    if (currentQuiz.interval) window.clearInterval(currentQuiz.interval);
    currentQuiz.items.forEach(function (item) {
      const selected = currentQuiz.responses[item.question.id];
      if (selected !== undefined) saveAnswer(item.question, selected);
    });
    renderQuizResult(timedOut);
  }
  function makeReviewRow(question, selectedIndex, optionOrder) {
    const row = make('article', 'review-row');
    row.appendChild(make('h4', '', question.question));
    const order = optionOrder || [0, 1, 2, 3];
    const selectedPosition = selectedIndex === undefined ? -1 : order.indexOf(selectedIndex);
    const correctPosition = order.indexOf(question.answer);
    row.appendChild(make('p', '', selectedIndex === undefined ? 'لم تُحل في هذا الاختبار.' : 'إجابتك: ' + String.fromCharCode(65 + selectedPosition) + ') ' + question.options[selectedIndex]));
    row.appendChild(make('p', '', 'الإجابة الصحيحة: ' + String.fromCharCode(65 + correctPosition) + ') ' + question.options[question.answer]));
    appendSourceLink(row, question);
    return row;
  }
  function renderQuizResult(timedOut) {
    const root = $('#quizRoot');
    root.replaceChildren();
    const items = currentQuiz.items;
    const answered = items.filter(function (item) { return currentQuiz.responses[item.question.id] !== undefined; });
    const correct = answered.filter(function (item) { return currentQuiz.responses[item.question.id] === item.question.answer; });
    const wrong = answered.filter(function (item) { return currentQuiz.responses[item.question.id] !== item.question.answer; });
    const unanswered = items.filter(function (item) { return currentQuiz.responses[item.question.id] === undefined; });
    const score = make('section', 'card quiz-result');
    score.appendChild(make('p', 'eyebrow', timedOut ? 'انتهى الوقت' : 'نتيجة الاختبار'));
    score.appendChild(make('h3', '', currentQuiz.title));
    score.appendChild(make('span', 'score-number', correct.length + ' / ' + items.length));
    score.appendChild(make('p', 'muted', 'إجابات صحيحة: ' + correct.length + ' · خاطئة: ' + wrong.length + ' · غير محلولة: ' + unanswered.length));
    root.appendChild(score);

    const review = make('section', 'card');
    review.appendChild(make('h3', '', 'مراجعة الإجابات الخاطئة وغير المحلولة'));
    if (!wrong.length && !unanswered.length) {
      review.appendChild(make('p', 'muted', 'كل إجاباتك في هذا الاختبار صحيحة.'));
    } else {
      wrong.concat(unanswered).forEach(function (item) {
        review.appendChild(makeReviewRow(item.question, currentQuiz.responses[item.question.id], item.optionOrder));
      });
    }
    root.appendChild(review);
    const actions = make('div', 'card dashboard-actions');
    if (wrong.length) actions.appendChild(button('ذاكر الأخطاء', 'button-primary', function () {
      startStudy(wrong.map(function (item) { return item.question.id; }), 'أخطاء الاختبار');
    }));
    if (unanswered.length) actions.appendChild(button('حل غير المحلول', '', function () {
      startStudy(unanswered.map(function (item) { return item.question.id; }), 'غير محلول من الاختبار');
    }));
    actions.appendChild(button('اختبار جديد', '', function () {
      currentQuiz = null;
      $('#quizSetup').hidden = false;
      $('#quizRoot').replaceChildren();
    }));
    actions.appendChild(button('الرئيسية', '', function () { setView('dashboard'); }));
    root.appendChild(actions);
  }

  function renderLibrary() {
    const root = $('#libraryRoot');
    if (!root) return;
    root.replaceChildren();
    const query = ($('#questionSearch').value || '').trim().toLocaleLowerCase();
    const bank = $('#bankFilter').value;
    const filterStatus = $('#statusFilter').value;
    const filtered = QUESTIONS.filter(function (q) {
      const groupMatches = bank === 'all' || (bank === 'quick' ? q.kind === 'quick' : q.kind === 'core' && q.bankIndex === Number(bank.slice(5)));
      const statusMatches = filterStatus === 'all' || answerStatus(q) === filterStatus;
      const searchable = (q.question + ' ' + q.options.join(' ') + ' ' + q.bankName).toLocaleLowerCase();
      return groupMatches && statusMatches && (!query || searchable.includes(query));
    });
    $('#searchCount').textContent = 'النتائج: ' + filtered.length + ' من ' + QUESTIONS.length + ' سؤالًا معروضًا في المجموعات.';
    if (!filtered.length) {
      root.appendChild(make('div', 'empty-state', 'لا توجد أسئلة تطابق البحث والمرشحات الحالية.'));
      return;
    }
    filtered.forEach(function (question) {
      const item = make('article', 'question-item');
      const textBlock = make('div');
      textBlock.appendChild(make('p', '', question.question));
      const number = question.kind === 'quick' ? 'اختبر نفسك · ' + question.number : 'سؤال البنك ' + question.number;
      textBlock.appendChild(make('small', '', number + ' · ' + question.bankName + ' · ' + answerLabel(answerStatus(question))));
      item.appendChild(textBlock);
      item.appendChild(button('افتح للمذاكرة', '', function () { startStudy([question.id], number); }));
      root.appendChild(item);
    });
  }

  function exportProgress() {
    const payload = {
      app: 'scm-review',
      version: 1,
      exportedAt: new Date().toISOString(),
      answers: progress.answers
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scm-review-progress.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('تم تنزيل ملف التقدم.');
  }
  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || parsed.app !== 'scm-review' || parsed.version !== 1 || !parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)) {
          throw new Error('invalid format');
        }
        const imported = {};
        Object.keys(parsed.answers).forEach(function (id) {
          const q = QUESTION_BY_ID.get(id);
          const value = parsed.answers[id];
          if (!q || !Number.isInteger(value) || value < 0 || value >= q.options.length) throw new Error('invalid answer');
          imported[id] = value;
        });
        progress.answers = imported;
        saveProgress();
        renderDashboard();
        renderLibrary();
        showToast('تم استيراد التقدم.');
      } catch (error) {
        showToast('ملف التقدم غير صالح أو لا ينتمي إلى هذا الموقع.');
      }
    };
    reader.onerror = function () { showToast('تعذرت قراءة الملف.'); };
    reader.readAsText(file);
  }
  function setInitialTheme() {
    let theme = 'light';
    try { theme = localStorage.getItem(THEME_KEY) || 'light'; } catch (error) { /* local storage may be unavailable */ }
    applyTheme(theme === 'dark' ? 'dark' : 'light');
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark';
    $('#themeToggle').setAttribute('aria-pressed', dark ? 'true' : 'false');
    $('#themeToggle').setAttribute('aria-label', dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي');
    $('#themeIcon').textContent = dark ? '☀' : '☾';
    $('.theme-label').textContent = dark ? 'الوضع النهاري' : 'الوضع الليلي';
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* theme still applies for this page view */ }
  }

  document.querySelectorAll('.nav-button').forEach(function (navButton) {
    navButton.addEventListener('click', function () { setView(navButton.dataset.view); });
  });
  document.querySelectorAll('[data-lesson-select]').forEach(function (tab) {
    tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    tab.addEventListener('click', function () { selectLesson(tab.dataset.lessonSelect); });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const tabs = Array.from(document.querySelectorAll('[data-lesson-select]'));
      const index = tabs.indexOf(tab);
      const nextIndex = (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      selectLesson(tabs[nextIndex].dataset.lessonSelect);
    });
  });
  $('#startStudy').addEventListener('click', function () {
    startStudy(selectedIds($('#studySet').value), $('#studySet').selectedOptions[0].textContent);
  });
  $('#quizSetup').addEventListener('submit', startQuiz);
  ['questionSearch', 'bankFilter', 'statusFilter'].forEach(function (id) {
    $('#' + id).addEventListener(id === 'questionSearch' ? 'input' : 'change', renderLibrary);
  });
  document.addEventListener('click', function (event) {
    const open = event.target.closest('[data-open-lesson]');
    if (open) openLesson(open.dataset.openLesson);
  });
  $('#themeToggle').addEventListener('click', function () {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  $('#exportProgress').addEventListener('click', exportProgress);
  $('#importProgress').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) importProgress(file);
    event.target.value = '';
  });
  $('#resetProgress').addEventListener('click', function () {
    if (!window.confirm('هل تريد مسح كل الإجابات المحفوظة على هذا المتصفح؟')) return;
    progress.answers = {};
    saveProgress();
    renderDashboard();
    renderLibrary();
    showToast('تم مسح التقدم المحفوظ.');
  });

  setInitialTheme();
  selectLesson('l1');
  renderDashboard();
})();

