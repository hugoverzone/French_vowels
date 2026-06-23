import { decodeQrStringToList, extractTokenFromUrl } from './URL_functions.js';

const CSV_PATHS = [
  new URL('./phonetic_data/lexique_phonetique_connected.csv', import.meta.url).href,
  new URL('./phonetic_data/lexique_phonetique.csv', import.meta.url).href,
  new URL('../phonetic_data/lexique_phonetique_connected.csv', import.meta.url).href,
  new URL('../phonetic_data/lexique_phonetique.csv', import.meta.url).href
];
const TRIANGLE_VOWELS_PATHS = [new URL('./JSON', import.meta.url).href];
const VOWEL_SOUNDS = ['o', 'oe', 'è', 'eu', 'au', 'é', 'ou', 'u', 'i', 'a', 'an', 'on', 'in'];
const TIMINGS = {
  incorrectFlashMs: 1000,
  correctAdvanceMs: 100,
  finalAdvanceMs: 2600
};
const COMPLETION_RING_ANIMATION_MS = 460;
const COMPLETION_TRANSFER_DELAY_MS = 520;
const COMPLETION_FIREWORK_DURATION_MS = 8000;
const COMPLETION_FIREWORK_COUNT = 12;
const COMPLETION_FIREWORK_SPARKS = 14;

const elements = {
  exercisePanel: document.getElementById('exercise-panel'),
  exerciseWord: document.getElementById('exercise-word'),
  exercisePhonetic: document.getElementById('exercise-phonetic'),
  exerciseSoundProgress: document.getElementById('exercise-sound-progress'),
  exerciseSoundProgressValue: document.getElementById('exercise-sound-progress-value'),
  exerciseWordProgress: document.getElementById('exercise-word-progress'),
  exerciseWordProgressValue: document.getElementById('exercise-word-progress-value'),
  exerciseFeedback: document.getElementById('exercise-feedback'),
  exerciseSpeak: document.getElementById('exercise-speak'),
  exerciseReplay: document.getElementById('exercise-replay'),
  exerciseProgressGrid: document.querySelector('.exercise-progress-grid'),
  vowelButtons: [...document.querySelectorAll('.vowel')]
};

let lexiquePromise = null;
let vowelMapPromise = null;
let completionAdvanceTimer = null;
let completionFlashTimer = null;
let completionWordProgressTimer = null;
let completionFireworkTimer = null;
let completionFireworkLayer = null;
let progressRingAnimationTimers = new WeakMap();

const exerciseState = {
  items: [],
  index: 0,
  correct: 0,
  locked: false
};

function play(sound) {
  const audioPath = '../assets/audio/vowels_fonetix_without_example/';
  const audio = new Audio(audioPath + sound + '.mp3');
  audio.play();
}

function setExercisePhoneticText(message) {
  if (elements.exercisePhonetic) {
    elements.exercisePhonetic.textContent = message;
  }
}

function setPrimaryActionButton(mode = 'speak') {
  if (!elements.exerciseSpeak) {
    return;
  }

  const isReplayMode = mode === 'replay';

  elements.exerciseSpeak.innerHTML = isReplayMode ? 'Rejouer' : '<span>Écouter<br>le mot</span>';
  elements.exerciseSpeak.setAttribute('aria-label', isReplayMode ? 'Rejouer l’exercice' : 'Écouter le mot');
}

function clearCompletionFireworks() {
  if (completionFireworkTimer) {
    window.clearTimeout(completionFireworkTimer);
    completionFireworkTimer = null;
  }

  if (completionFireworkLayer) {
    completionFireworkLayer.remove();
    completionFireworkLayer = null;
  }
}

function launchCompletionFireworks() {
  clearCompletionFireworks();

  const layer = document.createElement('div');
  layer.className = 'completion-fireworks';
  layer.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < COMPLETION_FIREWORK_COUNT; index += 1) {
    const firework = document.createElement('div');
    firework.className = 'completion-firework';

    const x = 8 + Math.random() * 84;
    const y = 10 + Math.random() * 70;
    const hue = Math.floor(Math.random() * 360);
    const delay = Math.random() * 650;

    firework.style.setProperty('--firework-x', `${x}vw`);
    firework.style.setProperty('--firework-y', `${y}vh`);
    firework.style.setProperty('--firework-hue', `${hue}`);
    firework.style.setProperty('--firework-delay', `${delay}ms`);

    for (let sparkIndex = 0; sparkIndex < COMPLETION_FIREWORK_SPARKS; sparkIndex += 1) {
      const spark = document.createElement('span');
      spark.className = 'completion-firework__spark';

      const angle = (360 / COMPLETION_FIREWORK_SPARKS) * sparkIndex + Math.random() * 16;
      const distance = 140 + Math.random() * 180;
      const sparkDelay = delay + Math.random() * 120;

      spark.style.setProperty('--spark-angle', `${angle}deg`);
      spark.style.setProperty('--spark-distance', `${distance}`);
      spark.style.setProperty('--spark-delay', `${sparkDelay}ms`);
      spark.style.setProperty('--spark-hue', `${(hue + sparkIndex * 9) % 360}`);
      spark.style.setProperty('--spark-size', `${9 + Math.random() * 8}px`);

      firework.appendChild(spark);
    }

    layer.appendChild(firework);
  }

  document.body.appendChild(layer);
  completionFireworkLayer = layer;

  completionFireworkTimer = window.setTimeout(() => {
    clearCompletionFireworks();
  }, COMPLETION_FIREWORK_DURATION_MS);
}

function handlePrimaryActionButtonClick() {
  if (exerciseState.index >= exerciseState.items.length) {
    window.location.reload();
    return;
  }

  speakCurrentWord();
}

window.play = play;

elements.vowelButtons.forEach((button, index) => {
  button.dataset.sound = VOWEL_SOUNDS[index] || '';
});

function splitSegments(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseCsvRow(line) {
  const columns = line.split(',').map((value) => value.trim());
  const [
    word = '',
    phonetic = '',
    pronunciation = '',
    partOfSpeech = '',
    segmentation = '',
    wordSegments = '',
    simplifiedSegments = '',
    phoneticSegments = ''
  ] = columns;

  return {
    word,
    phonetic,
    pronunciation,
    partOfSpeech,
    segmentation: /^true$/i.test(segmentation),
    wordSegments: splitSegments(wordSegments),
    simplifiedSegments: splitSegments(simplifiedSegments),
    phoneticSegments: splitSegments(phoneticSegments)
  };
}

async function fetchTextFromCandidates(paths, resourceLabel) {
  let lastError = null;

  for (const path of paths) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }

  const details = lastError ? ` (${lastError.message})` : '';
  throw new Error(`Impossible de charger ${resourceLabel}${details}`);
}

async function fetchJsonFromCandidates(paths, resourceLabel) {
  const text = await fetchTextFromCandidates(paths, resourceLabel);
  return JSON.parse(text);
}

async function loadTriangleVowelMap() {
  if (!vowelMapPromise) {
    vowelMapPromise = fetchJsonFromCandidates(TRIANGLE_VOWELS_PATHS, 'la table phonétique').then((data) => {
      const phoneticToSound = new Map();
      const allowedSounds = new Set(VOWEL_SOUNDS);

      (data.vowels || []).forEach((entry) => {
        if (!allowedSounds.has(entry.french)) {
          return;
        }

        (entry.phonetic || []).forEach((token) => {
          phoneticToSound.set(token, entry.french);
        });
      });

      return phoneticToSound;
    });
  }

  return vowelMapPromise;
}

async function loadLexiqueRows() {
  if (!lexiquePromise) {
    lexiquePromise = fetchTextFromCandidates(CSV_PATHS, 'le CSV lexique_phonetique_connected.csv').then((text) => {
      const rowToEntry = new Map();
      const wordToRow = new Map();
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

      lines.forEach((line, index) => {
        const entry = parseCsvRow(line);
        const rowNumber = index + 1;
        rowToEntry.set(rowNumber, entry);

        if (!wordToRow.has(entry.word)) {
          wordToRow.set(entry.word, rowNumber);
        }
      });

      return { rowToEntry, wordToRow };
    });
  }

  return lexiquePromise;
}

function inferSoundsFromPhonetic(phoneticCode, phoneticToSound) {
  if (!phoneticCode || !phoneticToSound) {
    return [];
  }

  return [...phoneticCode]
    .map((token) => phoneticToSound.get(token) || phoneticToSound.get(token.toUpperCase()) || phoneticToSound.get(token.toLowerCase()))
    .filter(Boolean);
}

function lookupSegmentSound(segment, phoneticToSound) {
  if (!segment || !phoneticToSound) {
    return '';
  }

  const candidates = [segment, segment.toLowerCase(), segment.toUpperCase()];

  for (const candidate of candidates) {
    const sound = phoneticToSound.get(candidate);
    if (sound) {
      return sound;
    }
  }

  return '';
}

function buildTargetSegments(entry, phoneticToSound) {
  let useConnectedSegmentation = entry.segmentation && entry.wordSegments.length > 0 && entry.simplifiedSegments.length > 0;
  const displaySegments = useConnectedSegmentation ? entry.wordSegments : [...entry.word];
  const targetSounds = [];
  const targetSegmentIndexes = [];

  if (useConnectedSegmentation) {
    const segmentCount = Math.min(entry.wordSegments.length, entry.simplifiedSegments.length);

    for (let index = 0; index < segmentCount; index += 1) {
      const sound = lookupSegmentSound(entry.simplifiedSegments[index], phoneticToSound);
      if (!sound) {
        continue;
      }

      targetSounds.push(sound);
      targetSegmentIndexes.push(index);
    }

    if (!targetSounds.length) {
      useConnectedSegmentation = false;
    }
  } else {
    const inferredSounds = inferSoundsFromPhonetic(entry.phonetic, phoneticToSound);

    inferredSounds.forEach((sound, index) => {
      targetSounds.push(sound);

      if (!displaySegments.length) {
        targetSegmentIndexes.push(0);
        return;
      }

      const ratio = (index + 1) / Math.max(1, inferredSounds.length);
      const targetIndex = Math.min(displaySegments.length - 1, Math.max(0, Math.ceil(ratio * displaySegments.length) - 1));
      targetSegmentIndexes.push(targetIndex);
    });
  }

  if (!useConnectedSegmentation && !targetSounds.length) {
    const inferredSounds = inferSoundsFromPhonetic(entry.phonetic, phoneticToSound);

    inferredSounds.forEach((sound, index) => {
      targetSounds.push(sound);

      if (!displaySegments.length) {
        targetSegmentIndexes.push(0);
        return;
      }

      const ratio = (index + 1) / Math.max(1, inferredSounds.length);
      const targetIndex = Math.min(displaySegments.length - 1, Math.max(0, Math.ceil(ratio * displaySegments.length) - 1));
      targetSegmentIndexes.push(targetIndex);
    });
  }

  return {
    displaySegments,
    targetSounds,
    targetSegmentIndexes,
    useConnectedSegmentation
  };
}

function getCurrentItem() {
  return exerciseState.items[exerciseState.index];
}

function getCurrentTargetSound(item) {
  return item?.targetSounds?.[item.soundIndex] || '';
}

function setProgressRing(elementsSet, value, total, animate = false) {
  const safeTotal = Math.max(0, total);
  const safeValue = Math.max(0, Math.min(value, safeTotal));
  const progress = safeTotal > 0 ? safeValue / safeTotal : 0;
  const displayText = safeTotal > 0 ? `${safeValue} / ${safeTotal}` : '0 / 0';

  if (elementsSet.ring) {
    const previousTimer = progressRingAnimationTimers.get(elementsSet.ring);

    if (previousTimer) {
      window.clearTimeout(previousTimer);
      progressRingAnimationTimers.delete(elementsSet.ring);
    }

    elementsSet.ring.classList.toggle('is-animating', Boolean(animate));
    elementsSet.ring.style.setProperty('--progress', String(progress));
    elementsSet.ring.setAttribute('aria-valuenow', String(safeValue));
    elementsSet.ring.setAttribute('aria-valuemax', String(safeTotal));
    elementsSet.ring.setAttribute('aria-valuetext', displayText);

    if (animate) {
      const timerId = window.setTimeout(() => {
        elementsSet.ring.classList.remove('is-animating');
        progressRingAnimationTimers.delete(elementsSet.ring);
      }, COMPLETION_RING_ANIMATION_MS);

      progressRingAnimationTimers.set(elementsSet.ring, timerId);
    }
  }

  if (elementsSet.value) {
    elementsSet.value.textContent = displayText;
  }
}

function clearCompletionTimers() {
  if (completionAdvanceTimer) {
    window.clearTimeout(completionAdvanceTimer);
    completionAdvanceTimer = null;
  }

  if (completionFlashTimer) {
    window.clearTimeout(completionFlashTimer);
    completionFlashTimer = null;
  }

  if (completionWordProgressTimer) {
    window.clearTimeout(completionWordProgressTimer);
    completionWordProgressTimer = null;
  }

  elements.exerciseProgressGrid?.classList.remove('is-transferring');
}

function getCompletedSegmentCount(item) {
  if (!item || !item.displaySegments.length) {
    return 0;
  }

  if (item.useConnectedSegmentation) {
    if (item.soundIndex <= 0) {
      return 0;
    }

    if (item.soundIndex >= item.targetSegmentIndexes.length) {
      return item.displaySegments.length;
    }

    const lastCompletedIndex = item.targetSegmentIndexes[item.soundIndex - 1];
    return typeof lastCompletedIndex === 'number' ? Math.min(item.displaySegments.length, lastCompletedIndex + 1) : 0;
  }

  if (!item.targetSounds.length) {
    return 0;
  }

  return Math.min(item.displaySegments.length, Math.floor((item.soundIndex / item.targetSounds.length) * item.displaySegments.length));
}

function getActiveSegmentRange(item) {
  if (!item || !item.displaySegments.length) {
    return [0, 0];
  }

  if (item.useConnectedSegmentation) {
    const activeIndex = item.targetSegmentIndexes[item.soundIndex];
    if (typeof activeIndex === 'number') {
      return [activeIndex, activeIndex];
    }

    return [item.displaySegments.length - 1, item.displaySegments.length - 1];
  }

  if (!item.targetSounds.length) {
    return [0, 0];
  }

  const start = Math.min(item.displaySegments.length - 1, Math.floor((item.soundIndex / item.targetSounds.length) * item.displaySegments.length));
  const span = Math.max(1, Math.ceil(item.displaySegments.length / item.targetSounds.length));
  return [start, Math.min(item.displaySegments.length - 1, start + span - 1)];
}

function renderWordDisplay(item) {
  const segments = item?.displaySegments || [];
  const completedSegmentCount = getCompletedSegmentCount(item);
  const [flashStart, flashEnd] = item?.flashRange || [-1, -1];
  const [missedStart, missedEnd] = item?.missedRange || [-1, -1];
  const newlyCompletedIndex = item?.justCompletedIndex ?? -1;

  elements.exerciseWord.replaceChildren();

  if (!segments.length) {
    elements.exerciseWord.textContent = item?.word || '';
    elements.exerciseWord.dataset.state = item ? 'plain' : '';
    return;
  }

  segments.forEach((segment, index) => {
    const span = document.createElement('span');
    span.className = 'exercise-word-segment';
    span.textContent = segment;
    span.style.setProperty('--segment-index', index);

    if (index < completedSegmentCount) {
      span.classList.add('is-complete');
      if (index === newlyCompletedIndex) {
        span.classList.add('is-newly-complete');
      }
    } else if (item && index >= flashStart && index <= flashEnd) {
      span.classList.add('is-error');
    } else if (item && index >= missedStart && index <= missedEnd) {
      span.classList.add('is-muted');
    } else {
      span.classList.add('is-pending');
    }

    elements.exerciseWord.appendChild(span);
  });

  if (item) {
    item.justCompletedIndex = null;
  }

  elements.exerciseWord.dataset.state = completedSegmentCount >= segments.length ? 'complete' : 'active';
}

function updateExerciseProgress(item, options = {}) {
  const { animateSound = false, animateWords = false } = options;
  const totalWords = exerciseState.items.length;
  const completedWords = Math.min(
    totalWords,
    exerciseState.index + (item && item.targetSounds.length > 0 && item.soundIndex >= item.targetSounds.length ? 1 : 0)
  );
  const soundTotal = item ? item.targetSounds.length : 0;
  const soundProgress = item ? Math.min(item.soundIndex, soundTotal) : 0;

  setProgressRing({
    ring: elements.exerciseSoundProgress,
    value: elements.exerciseSoundProgressValue
  }, soundProgress, soundTotal, animateSound);

  setProgressRing({
    ring: elements.exerciseWordProgress,
    value: elements.exerciseWordProgressValue
  }, completedWords, totalWords, animateWords);
}

function stageCompletionProgress(item) {
  const totalWords = exerciseState.items.length;
  const soundTotal = item ? item.targetSounds.length : 0;
  const soundProgress = item ? Math.min(item.soundIndex, soundTotal) : 0;
  const completedWords = Math.min(totalWords, exerciseState.index + 1);

  setProgressRing({
    ring: elements.exerciseSoundProgress,
    value: elements.exerciseSoundProgressValue
  }, soundProgress, soundTotal, true);

  elements.exerciseProgressGrid?.classList.add('is-transferring');

  completionWordProgressTimer = window.setTimeout(() => {
    elements.exerciseProgressGrid?.classList.remove('is-transferring');

    setProgressRing({
      ring: elements.exerciseWordProgress,
      value: elements.exerciseWordProgressValue
    }, completedWords, totalWords, true);

    completionWordProgressTimer = null;
  }, COMPLETION_TRANSFER_DELAY_MS);
}

function setExerciseFeedback(message, tone = '') {
  elements.exerciseFeedback.textContent = message;
  elements.exerciseFeedback.classList.remove('correct', 'incorrect');

  if (tone) {
    elements.exerciseFeedback.classList.add(tone);
  }
}

function speakCurrentWord() {
  const item = getCurrentItem();
  const word = item?.word || elements.exerciseWord.textContent.trim();

  if (!word || word === 'Aucun exercice chargé.' || word === 'En attente du jeton...') {
    setExerciseFeedback('Aucun mot à lire pour le moment.', 'incorrect');
    return;
  }

  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    setExerciseFeedback('La synthèse vocale n’est pas prise en charge dans ce navigateur.', 'incorrect');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'fr-FR';
  window.speechSynthesis.speak(utterance);
}

function renderExerciseItem(preserveFeedback = false) {
  const item = getCurrentItem();

  // Ensure any previous completion styling is cleared
  elements.exerciseWord.classList.remove('exercise-completion');

  setPrimaryActionButton('speak');
  elements.exerciseReplay.classList.add('hidden');

  if (!item) {
    elements.exerciseWord.textContent = 'Aucun exercice chargé.';
    elements.exerciseWord.dataset.state = '';
    setExercisePhoneticText('Ouvrez une URL contenant T=... pour commencer.');
    if (!preserveFeedback) {
      setExerciseFeedback('', '');
    }
    return;
  }

  renderWordDisplay(item);
  setExercisePhoneticText(item.phonetic);
  updateExerciseProgress(item);

  if (!item.targetSounds.length) {
    if (!preserveFeedback) {
      setExerciseFeedback('', '');
    }
    exerciseState.locked = true;
    completionAdvanceTimer = window.setTimeout(() => {
      if (exerciseState.locked) {
        advanceExercise();
      }
    }, TIMINGS.correctAdvanceMs);
    return;
  }

  if (item.soundIndex >= item.targetSounds.length) {
    return;
  }

  if (!preserveFeedback) {
    setExerciseFeedback('', '');
  }
}

function finishExercise() {
  clearCompletionTimers();
  launchCompletionFireworks();
  // Show completion message in the main word box
  elements.exerciseWord.textContent = 'Félicitations !';
  elements.exerciseWord.classList.add('exercise-completion');
  elements.exerciseWord.dataset.state = 'complete';
  setExercisePhoneticText('Toutes les lignes demandées ont été affichées.');
  updateExerciseProgress(null);
  setPrimaryActionButton('replay');
  elements.exerciseReplay.classList.add('hidden');
}

function advanceExercise() {
  clearCompletionTimers();
  exerciseState.index += 1;
  exerciseState.locked = false;

  if (exerciseState.index >= exerciseState.items.length) {
    finishExercise();
    return;
  }

  renderExerciseItem();
}

function buildExerciseItem(entry, row, phoneticToSound) {
  const targetSegments = buildTargetSegments(entry, phoneticToSound);

  return {
    row,
    word: entry.word,
    phonetic: entry.phonetic,
    pronunciation: entry.pronunciation,
    partOfSpeech: entry.partOfSpeech,
    segmentation: entry.segmentation,
    displaySegments: targetSegments.displaySegments,
    targetSounds: targetSegments.targetSounds,
    targetSegmentIndexes: targetSegments.targetSegmentIndexes,
    useConnectedSegmentation: targetSegments.useConnectedSegmentation,
    soundIndex: 0,
    flashRange: null,
    missedRange: null,
    justCompletedIndex: null
  };
}

function shuffleExerciseItems(items) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }
  return shuffledItems;
}

function handleVowelSelection(sound) {
  const item = getCurrentItem();
  const currentTargetSound = getCurrentTargetSound(item);

  if (!item || exerciseState.locked) {
    return;
  }

  if (!currentTargetSound) {
    setExerciseFeedback('Cette ligne n’a pas de son cible. Utilisez Mot suivant pour continuer.', 'incorrect');
    return;
  }

  if (sound === currentTargetSound) {
    exerciseState.correct += 1;
    item.soundIndex += 1;
    item.justCompletedIndex = item.soundIndex - 1;
    exerciseState.locked = true;
    clearCompletionTimers();
    delete item.flashRange;
    delete item.missedRange;
    renderWordDisplay(item);

    if (item.soundIndex >= item.targetSounds.length) {
      stageCompletionProgress(item);
      completionAdvanceTimer = window.setTimeout(() => {
        if (exerciseState.locked) {
          advanceExercise();
        }
      }, TIMINGS.finalAdvanceMs + COMPLETION_TRANSFER_DELAY_MS);
      return;
    }

    updateExerciseProgress(item, {
      animateSound: true,
      animateWords: false
    });

    completionAdvanceTimer = window.setTimeout(() => {
      if (!exerciseState.locked) {
        return;
      }

      exerciseState.locked = false;
      renderExerciseItem();
    }, TIMINGS.correctAdvanceMs);
    return;
  }

  clearCompletionTimers();
  const [flashStart, flashEnd] = getActiveSegmentRange(item);
  item.flashRange = [flashStart, flashEnd];
  delete item.missedRange;
  renderWordDisplay(item);

  completionFlashTimer = window.setTimeout(() => {
    delete item.flashRange;
    item.missedRange = [flashStart, flashEnd];
    renderWordDisplay(item);
    completionFlashTimer = null;
  }, TIMINGS.incorrectFlashMs);
}

async function initExercise() {
  const payload = extractTokenFromUrl(window.location.href);

  if (!payload) {
    elements.exercisePanel.classList.add('hidden');
    return;
  }

  try {
    const rows = decodeQrStringToList(payload);
    let rowToEntry;
    let phoneticToSound;

    try {
      ({ rowToEntry } = await loadLexiqueRows());
    } catch (error) {
      throw new Error(`Le CSV n'a pas pu être chargé: ${error.message}`);
    }

    try {
      phoneticToSound = await loadTriangleVowelMap();
    } catch (error) {
      throw new Error(`La table phonétique n'a pas pu être chargée: ${error.message}`);
    }

    exerciseState.items = rows
      .map((row) => {
        const entry = rowToEntry.get(row);
        if (!entry) {
          return null;
        }

        return buildExerciseItem(entry, row, phoneticToSound);
      })
      .filter(Boolean);

    exerciseState.items = shuffleExerciseItems(exerciseState.items);

    if (!exerciseState.items.length) {
      elements.exerciseWord.textContent = 'Aucune ligne correspondante trouvée.';
      elements.exerciseWord.dataset.state = '';
      setExercisePhoneticText('Vérifiez le jeton dans l’URL.');
      updateExerciseProgress(null);
      setExerciseFeedback('Le jeton fourni ne correspond à aucune entrée du CSV.', 'incorrect');
      return;
    }

    renderExerciseItem();
    elements.exerciseSpeak.addEventListener('click', handlePrimaryActionButtonClick);
    elements.exerciseReplay.addEventListener('click', () => window.location.reload());
    elements.vowelButtons.forEach((button) => {
      button.addEventListener('click', () => handleVowelSelection(button.dataset.sound || ''));
    });
  } catch (error) {
    elements.exerciseWord.textContent = 'Impossible de démarrer l’exercice.';
    elements.exerciseWord.dataset.state = '';
    setExercisePhoneticText(error.message || 'Le chargement des données a échoué.');
    updateExerciseProgress(null);
    setExerciseFeedback(error.message || 'Le chargement des données a échoué.', 'incorrect');
  }
}

initExercise();
