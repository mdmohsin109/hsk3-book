/* HSK 3 · 标准教程 — book reader
 *
 * Data (data.js):
 *   DICT  surface -> [{pinyin, meaning, pos}]            (word lookup)
 *   BOOK  {book, lessons[20], culture[2]}
 *         lesson.texts[i].audio / lesson.audio_exercise  (derived mp3 paths)
 *
 * A token is [surface, clickable, pinyin, is_lesson_new_word].
 */
(function () {
  'use strict';

  var HOVER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var SPEEDS = [0.75, 1, 1.25];
  var PREFS = 'hsk3.book.prefs.v1';

  var LESSONS = BOOK.lessons;
  var CULTURE = BOOK.culture;

  /* ------------------------------------------------------------- state */

  var state = { pinyin: false, english: false, mark: true, size: 19, theme: 'light' };
  try {
    var saved = JSON.parse(localStorage.getItem(PREFS) || '{}');
    for (var k in saved) { if (k in state) state[k] = saved[k]; }
  } catch (e) { /* ignore corrupt prefs */ }

  function savePrefs() {
    try { localStorage.setItem(PREFS, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  var BODY = null;        // .section-body of the current view
  var CURRENT = null;     // the <audio> that is currently playing

  /* ----------------------------------------------------------- helpers */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '--:--';
    var m = Math.floor(s / 60), x = Math.floor(s % 60);
    return m + ':' + (x < 10 ? '0' : '') + x;
  }

  function tokenNode(tok) {
    var surface = tok[0], click = tok[1], py = tok[2], isNew = tok[3];
    var cls = click ? (isNew ? 'w is-new' : 'w') : 'plain';
    var node;
    if (py && state.pinyin) {
      node = h('ruby', cls);
      node.appendChild(document.createTextNode(surface));
      node.appendChild(h('rt', null, py));
    } else {
      node = h('span', cls, surface);
    }
    if (click) {
      node.dataset.word = surface;
      node.dataset.py = py || '';
      node.setAttribute('tabindex', '-1');
    }
    return node;
  }

  function lineZh(toks) {
    var p = h('p', 'zh');
    toks.forEach(function (t) { p.appendChild(tokenNode(t)); });
    return p;
  }

  /* -------------------------------------------------------- audio player */

  function pauseAll() {
    var list = document.querySelectorAll('audio');
    for (var i = 0; i < list.length; i++) list[i].pause();
    CURRENT = null;
  }

  function buildPlayer(src) {
    var wrap = h('div', 'player');
    if (!src) {
      wrap.classList.add('is-na');
      wrap.appendChild(h('span', null, '暂无录音 · audio not available'));
      return wrap;
    }

    var audio = new Audio();
    audio.preload = 'none';
    audio.src = src;
    audio.hidden = true;

    var pp = h('button', 'pp');
    pp.type = 'button';
    pp.setAttribute('aria-label', 'Play');
    pp.innerHTML = PLAY_SVG;

    var track = h('div', 'track');
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', 'Seek');
    track.setAttribute('tabindex', '0');
    var fill = h('div', 'track-fill');
    var knob = h('div', 'track-knob');
    track.appendChild(fill);
    track.appendChild(knob);

    var time = h('span', 'p-time', '0:00 / --:--');

    var speed = h('button', 'p-speed', '1×');
    speed.type = 'button';
    speed.setAttribute('aria-label', 'Playback speed');

    wrap.appendChild(pp);
    wrap.appendChild(track);
    wrap.appendChild(time);
    wrap.appendChild(speed);
    wrap.appendChild(audio);

    var si = SPEEDS.indexOf(1);

    function update() {
      var d = audio.duration, c = audio.currentTime || 0;
      var pct = (isFinite(d) && d > 0) ? Math.min(100, (c / d) * 100) : 0;
      fill.style.width = pct + '%';
      knob.style.left = pct + '%';
      time.textContent = fmtTime(c) + ' / ' + fmtTime(d);
    }

    function setIcon(playing) {
      pp.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
      pp.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }

    pp.addEventListener('click', function () {
      if (audio.paused) {
        if (CURRENT && CURRENT !== audio) CURRENT.pause();
        CURRENT = audio;
        audio.play().catch(function () { /* autoplay blocked / missing file */ });
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () { setIcon(true); });
    audio.addEventListener('pause', function () { setIcon(false); });
    audio.addEventListener('ended', function () { setIcon(false); audio.currentTime = 0; });
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('loadedmetadata', update);
    audio.addEventListener('durationchange', update);
    audio.addEventListener('error', function () {
      wrap.classList.add('is-na');
      fill.style.width = '100%';
      time.textContent = '音源不可用';
    });

    function seekAt(clientX) {
      var r = track.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      if (isFinite(audio.duration)) audio.currentTime = ratio * audio.duration;
      update();
    }

    track.addEventListener('pointerdown', function (ev) {
      track.setPointerCapture(ev.pointerId);
      seekAt(ev.clientX);
      var move = function (e) { seekAt(e.clientX); };
      var up = function () {
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', up);
      };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up);
    });

    track.addEventListener('keydown', function (ev) {
      if (!isFinite(audio.duration)) return;
      if (ev.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); update(); }
      if (ev.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); update(); }
      if (ev.key === ' ' || ev.key === 'Enter') { pp.click(); ev.preventDefault(); }
    });

    speed.addEventListener('click', function () {
      si = (si + 1) % SPEEDS.length;
      audio.playbackRate = SPEEDS[si];
      speed.textContent = SPEEDS[si] + '×';
    });

    /* fetch duration on hover so the total time is known before playing */
    wrap.addEventListener('pointerenter', function () {
      if (audio.preload === 'none') { audio.preload = 'metadata'; audio.load(); }
    }, { once: true });

    return wrap;
  }

  /* ---------------------------------------------------- section renderers */

  function vocabGrid(list) {
    var grid = h('div', 'vocab');
    list.forEach(function (v) {
      var card = h('div', 'vcard');
      var top = h('div', 'vtop');
      top.appendChild(h('span', 'vword', v.word));
      if (v.part_of_speech) top.appendChild(h('span', 'vpos', v.part_of_speech));
      card.appendChild(top);
      card.appendChild(h('p', 'vpy', v.pinyin));
      card.appendChild(h('p', 'vmean', v.meaning));
      grid.appendChild(card);
    });
    return grid;
  }

  var SEC = {
    vocab: function (body, L) {
      body.appendChild(h('h3', 'sec-title', '生词 · New words (' + L.vocabulary.length + ')'));
      body.appendChild(vocabGrid(L.vocabulary));
      if (L.proper_nouns.length) {
        body.appendChild(h('h4', 'subhead', '专有名词 · Proper nouns'));
        body.appendChild(vocabGrid(L.proper_nouns));
      }
    },

    texts: function (body, L) {
      L.texts.forEach(function (t) {
        var sec = h('section', 'text-sec');
        var head = h('div', 'text-head');
        head.appendChild(h('h3', null, t.section));
        if (t.section_pinyin) head.appendChild(h('p', 'sec-py', t.section_pinyin));
        if (t.section_english) head.appendChild(h('p', 'sec-en', t.section_english));
        sec.appendChild(head);
        sec.appendChild(buildPlayer(t.audio));

        var lines = h('div', 'lines');
        if (t.kind === 'dialogue') {
          t.lines.forEach(function (d) {
            var line = h('div', 'line');
            var sp = h('span', 'speaker', d.speaker);
            if (d.speaker_pinyin) sp.appendChild(h('span', 'sp-py', d.speaker_pinyin));
            line.appendChild(sp);
            var lb = h('div', 'line-body');
            lb.appendChild(lineZh(d.tokens));
            lb.appendChild(h('p', 'en', d.english));
            line.appendChild(lb);
            lines.appendChild(line);
          });
        } else {
          var lb = h('div', 'line-body');
          lb.appendChild(lineZh(t.tokens));
          lb.appendChild(h('p', 'en', t.english));
          lines.appendChild(lb);
        }
        sec.appendChild(lines);
        body.appendChild(sec);
      });
    },

    notes: function (body, L) {
      L.notes.forEach(function (n) {
        var note = h('article', 'note');
        var hh = h('h3', null, n.title);
        if (n.title_english) hh.appendChild(h('span', 'note-en', n.title_english));
        note.appendChild(hh);
        note.appendChild(h('p', 'note-exp', n.explanation));
        if (n.explanation_english) note.appendChild(h('p', 'note-exp-en', n.explanation_english));
        if (n.examples.length) {
          var ul = h('ul', 'examples');
          n.examples.forEach(function (e) {
            var li = h('li');
            li.appendChild(lineZh(e.tokens));
            li.appendChild(h('p', 'en', e.english));
            ul.appendChild(li);
          });
          note.appendChild(ul);
        }
        body.appendChild(note);
      });
    },

    characters: function (body, L) {
      var c = L.characters;
      body.appendChild(h('h3', 'sec-title', c.title));
      if (c.title_english) body.appendChild(h('p', 'sec-sub', c.title_english));
      var box = h('div', 'charitems');
      c.items.forEach(function (it) {
        var item = h('div', 'citem');
        var row = h('div', 'cwords');
        var ws = it.words || [];
        var combine = ws.length >= 3 && it.meaning;
        ws.forEach(function (w, i) {
          if (i > 0) row.appendChild(h('span', 'cop', i === ws.length - 1 && combine ? '＝' : '＋'));
          row.appendChild(h('span', 'cword' + (combine && i === ws.length - 1 ? ' is-result' : ''), w));
        });
        item.appendChild(row);
        if (it.meaning) item.appendChild(h('p', 'cmean', it.meaning));
        box.appendChild(item);
      });
      body.appendChild(box);
    },

    game: function (body, L) {
      L.word_game.forEach(function (g) {
        var box = h('div', 'wg');
        var row = h('div', 'wgrow');
        var ws = g.words || [];
        ws.forEach(function (w, i) {
          var last = i === ws.length - 1 && ws.length > 1;
          row.appendChild(h('span', 'wchip' + (last ? ' is-result' : ''), w));
        });
        box.appendChild(row);
        if (g.meaning) box.appendChild(h('p', 'wgmean', g.meaning));
        body.appendChild(box);
      });
    },

    saying: function (body, L) {
      L.common_saying.forEach(function (s) {
        var b = h('blockquote', 'saying');
        b.appendChild(lineZh(s.tokens));
        if (s.pinyin && !state.pinyin) b.appendChild(h('p', 'py-line', s.pinyin));
        if (s.english) b.appendChild(h('p', 'en', s.english));
        body.appendChild(b);
      });
    },

    exercise: function (body, L) {
      var sec = h('section', 'text-sec');
      var head = h('div', 'text-head');
      head.appendChild(h('h3', null, '练习'));
      head.appendChild(h('p', 'sec-py', 'Liànxí'));
      head.appendChild(h('p', 'sec-en', 'Exercises — listening practice'));
      sec.appendChild(head);
      sec.appendChild(buildPlayer(L.audio_exercise));
      sec.appendChild(h('p', 'exercise-hint',
        '课本本课的听力练习录音。播放录音，配合课本中的练习题一起完成。'));
      body.appendChild(sec);
    }
  };

  function sectionsFor(L) {
    var out = [
      { id: 'vocab', zh: '生词', en: 'Vocabulary' },
      { id: 'texts', zh: '课文', en: 'Texts' },
      { id: 'notes', zh: '注释', en: 'Notes' },
      { id: 'characters', zh: '汉字', en: 'Characters' }
    ];
    if (L.word_game.length) out.push({ id: 'game', zh: '字词游戏', en: 'Word game' });
    out.push({ id: 'saying', zh: '常用语', en: 'Saying' });
    if (L.audio_exercise) out.push({ id: 'exercise', zh: '练习', en: 'Exercises' });
    return out;
  }

  /* ---------------------------------------------------------- lesson view */

  function renderLesson(n, sectionId) {
    var L = LESSONS[n - 1];
    if (!L) { location.hash = '#/'; return; }

    var secs = sectionsFor(L);
    if (!sectionId || !secs.some(function (s) { return s.id === sectionId; })) {
      sectionId = secs[0].id;
    }

    var art = h('article', 'lesson');

    var crumb = h('p', 'crumb');
    var back = h('a', null, '← 全部课程 All lessons');
    back.href = '#/';
    crumb.appendChild(back);
    crumb.appendChild(h('span', null, ' · Page ' + L.page));
    art.appendChild(crumb);

    var head = h('header', 'lesson-head');
    head.appendChild(h('span', 'lesson-eyebrow', 'Lesson ' + pad2(L.lesson)));
    head.appendChild(h('h2', null, L.title));
    head.appendChild(h('p', 'lesson-title-py', L.title_pinyin));
    head.appendChild(h('p', 'lesson-title-en', L.title_english));
    art.appendChild(head);

    var chips = h('nav', 'chips');
    chips.setAttribute('aria-label', 'Lesson sections');
    secs.forEach(function (s) {
      var b = h('button', 'chip-btn');
      b.type = 'button';
      b.appendChild(document.createTextNode(s.zh));
      b.appendChild(h('small', null, s.en));
      if (s.id === sectionId) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        if (location.hash === '#/lesson/' + n + '/' + s.id) return;
        location.hash = '#/lesson/' + n + '/' + s.id;
      });
      chips.appendChild(b);
    });
    art.appendChild(chips);

    var body = h('div', 'section-body');
    BODY = body;
    SEC[sectionId](body, L);
    art.appendChild(body);

    var pn = h('nav', 'prevnext');
    if (L.lesson > 1) {
      var prev = h('a', 'pn prev');
      prev.href = '#/lesson/' + (L.lesson - 1);
      prev.appendChild(h('span', 'pn-label', '← Lesson ' + pad2(L.lesson - 1)));
      prev.appendChild(h('span', 'pn-title', LESSONS[L.lesson - 2].title));
      pn.appendChild(prev);
    }
    if (L.lesson < LESSONS.length) {
      var next = h('a', 'pn next');
      next.href = '#/lesson/' + (L.lesson + 1);
      next.appendChild(h('span', 'pn-label', 'Lesson ' + pad2(L.lesson + 1) + ' →'));
      next.appendChild(h('span', 'pn-title', LESSONS[L.lesson].title));
      pn.appendChild(next);
    }
    art.appendChild(pn);

    document.getElementById('app').appendChild(art);
  }

  /* --------------------------------------------------------- culture view */

  function renderCulture(n) {
    var c = CULTURE[n - 1];
    if (!c) { location.hash = '#/'; return; }

    var art = h('article', 'lesson');
    var crumb = h('p', 'crumb');
    var back = h('a', null, '← 全部课程 All lessons');
    back.href = '#/';
    crumb.appendChild(back);
    crumb.appendChild(h('span', null, ' · Page ' + c.page));
    art.appendChild(crumb);

    var head = h('header', 'lesson-head');
    head.appendChild(h('span', 'lesson-eyebrow', '文化 · Culture'));
    head.appendChild(h('h2', null, c.title));
    head.appendChild(h('p', 'lesson-title-en', c.title_english));
    art.appendChild(head);

    var body = h('div', 'section-body');
    BODY = body;
    var sec = h('section', 'text-sec');
    sec.appendChild(lineZh(c.tokens));
    sec.appendChild(h('p', 'en', c.content_english));
    body.appendChild(sec);
    art.appendChild(body);

    var pn = h('nav', 'prevnext');
    if (n > 1) {
      var prev = h('a', 'pn prev');
      prev.href = '#/culture/' + (n - 1);
      prev.appendChild(h('span', 'pn-label', '← Culture ' + (n - 1)));
      prev.appendChild(h('span', 'pn-title', CULTURE[n - 2].title));
      pn.appendChild(prev);
    }
    if (n < CULTURE.length) {
      var next = h('a', 'pn next');
      next.href = '#/culture/' + (n + 1);
      next.appendChild(h('span', 'pn-label', 'Culture ' + (n + 1) + ' →'));
      next.appendChild(h('span', 'pn-title', CULTURE[n].title));
      pn.appendChild(next);
    }
    art.appendChild(pn);

    document.getElementById('app').appendChild(art);
  }

  /* ------------------------------------------------------------ home view */

  function lessonCard(L) {
    var card = h('a', 'card');
    card.href = '#/lesson/' + L.lesson;
    card.appendChild(h('span', 'card-num', 'LESSON ' + pad2(L.lesson)));
    card.appendChild(h('span', 'card-title', L.title));
    card.appendChild(h('span', 'card-py', L.title_pinyin));
    card.appendChild(h('span', 'card-en', L.title_english));
    card.appendChild(h('span', 'card-meta',
      L.vocabulary.length + ' words · ' + L.texts.length + ' texts'));
    return card;
  }

  function renderHome() {
    var app = document.getElementById('app');

    var hero = h('section', 'hero');
    hero.appendChild(h('p', 'hero-kicker', 'HSK 3 · Standard Course'));
    hero.appendChild(h('h2', null, '标准教程 3'));
    hero.appendChild(h('p', 'hero-sub',
      'Read every lesson of the HSK 3 Standard Course with its official audio. ' +
      'Tap any word for its pinyin and English meaning.'));
    var stats = h('p', 'hero-stats');
    var texts = 0, words = 0;
    LESSONS.forEach(function (L) { texts += L.texts.length; words += L.vocabulary.length; });
    function stat(value, label) {
      var s = h('span', 'stat');
      s.appendChild(h('b', null, String(value)));
      s.appendChild(document.createTextNode(' ' + label));
      return s;
    }
    stats.appendChild(stat(LESSONS.length, 'lessons'));
    stats.appendChild(stat(texts, 'texts'));
    stats.appendChild(stat(words, 'new words'));
    stats.appendChild(stat(100, 'audio tracks'));
    hero.appendChild(stats);
    app.appendChild(hero);

    var g1 = h('div', 'group-title');
    g1.appendChild(h('h3', null, 'Lessons'));
    g1.appendChild(h('span', null, '1 – 20'));
    app.appendChild(g1);

    var cards = h('div', 'cards');
    LESSONS.forEach(function (L) { cards.appendChild(lessonCard(L)); });
    app.appendChild(cards);

    if (CULTURE.length) {
      var g2 = h('div', 'group-title');
      g2.appendChild(h('h3', null, 'Culture'));
      g2.appendChild(h('span', null, '文化'));
      app.appendChild(g2);

      var cc = h('div', 'cards');
      CULTURE.forEach(function (c, i) {
        var card = h('a', 'card culture');
        card.href = '#/culture/' + (i + 1);
        card.appendChild(h('span', 'card-num', 'CULTURE · PAGE ' + c.page));
        card.appendChild(h('span', 'card-title', c.title));
        card.appendChild(h('span', 'card-en', c.title_english));
        cc.appendChild(card);
      });
      app.appendChild(cc);
    }

    var foot = h('footer', 'foot');
    foot.appendChild(h('span', null, 'HSK 3 Standard Course · 标准教程 3 — vocabulary, texts, notes and audio.'));
    var link = h('a', null, 'Word review · 600 词复习');
    link.href = 'https://mdmohsin109.github.io/hsk3-review/';
    link.target = '_blank';
    link.rel = 'noopener';
    foot.appendChild(link);
    app.appendChild(foot);
  }

  /* --------------------------------------------------------------- router */

  function parseHash() {
    var m = /^#\/lesson\/(\d+)(?:\/([a-z]+))?/.exec(location.hash);
    if (m) return { view: 'lesson', n: +m[1], section: m[2] || null };
    var c = /^#\/culture\/(\d+)/.exec(location.hash);
    if (c) return { view: 'culture', n: +c[1] };
    return { view: 'home' };
  }

  function render() {
    pauseAll();
    hideTip();

    var app = document.getElementById('app');
    app.textContent = '';
    BODY = null;

    var r = parseHash();
    if (r.view === 'lesson') renderLesson(r.n, r.section);
    else if (r.view === 'culture') renderCulture(r.n);
    else renderHome();

    sync();
    setTopbarHeight();
    window.scrollTo(0, 0);
  }

  /* -------------------------------------------------------------- tooltip */

  var el = {
    app: document.getElementById('app'),
    tip: document.getElementById('tip'),
    tipHanzi: document.getElementById('tip-hanzi'),
    tipPy: document.getElementById('tip-py'),
    tipSenses: document.getElementById('tip-senses'),
    tipClose: document.getElementById('tip-close'),
    mark: document.getElementById('t-mark'),
    pinyin: document.getElementById('t-pinyin'),
    english: document.getElementById('t-english'),
    theme: document.getElementById('t-theme'),
    fsDec: document.getElementById('fs-dec'),
    fsInc: document.getElementById('fs-inc'),
    topbar: document.querySelector('.topbar')
  };

  var active = null;
  var pinned = false;
  var hideTimer = null;

  function showTip(wordEl) {
    var word = wordEl.dataset.word;
    var senses = DICT[word] || [];
    var ctx = (wordEl.dataset.py || '').trim();

    if (active && active !== wordEl) active.classList.remove('is-open');
    active = wordEl;
    clearTimeout(hideTimer);

    el.tipHanzi.textContent = word;
    el.tipPy.textContent = ctx || (senses[0] && senses[0].pinyin) || '';

    el.tipSenses.textContent = '';
    if (!senses.length) {
      el.tipSenses.appendChild(h('li', null, 'Not in the HSK 3 word list.'));
    } else if (senses.length === 1) {
      var li = h('li');
      if (senses[0].pos) li.appendChild(h('span', 'sense-pos', senses[0].pos));
      li.appendChild(document.createTextNode(senses[0].meaning));
      el.tipSenses.appendChild(li);
    } else {
      senses.forEach(function (s) {
        var li = h('li');
        li.appendChild(h('span', 'alt-py', s.pinyin));
        if (s.pos) li.appendChild(h('span', 'sense-pos', s.pos));
        li.appendChild(document.createTextNode(s.meaning));
        el.tipSenses.appendChild(li);
      });
    }

    el.tip.hidden = false;
    wordEl.classList.add('is-open');
    place();
    requestAnimationFrame(function () { el.tip.classList.add('is-on'); });
  }

  function place() {
    if (!active) return;
    var r = active.getBoundingClientRect();
    var tw = el.tip.offsetWidth, th = el.tip.offsetHeight;
    var pad = 10;
    var vw = document.documentElement.clientWidth;

    var left = r.left + r.width / 2 - tw / 2;
    left = Math.max(pad, Math.min(left, vw - tw - pad));

    var below = r.top < th + 16;
    var top = below ? r.bottom + 10 : r.top - th - 10;

    el.tip.dataset.side = below ? 'bottom' : 'top';
    el.tip.style.left = Math.round(left) + 'px';
    el.tip.style.top = Math.round(top) + 'px';

    var arrow = r.left + r.width / 2 - left;
    arrow = Math.max(14, Math.min(arrow, tw - 14));
    el.tip.style.setProperty('--arrow-x', Math.round(arrow) + 'px');
  }

  function hideTip() {
    if (!active) return;
    active.classList.remove('is-open');
    active = null;
    pinned = false;
    clearTimeout(hideTimer);
    el.tip.classList.remove('is-on', 'is-pinned');
    hideTimer = setTimeout(function () { el.tip.hidden = true; }, 150);
  }

  function scheduleHide() {
    if (pinned) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideTip, 220);
  }

  el.app.addEventListener('pointerover', function (ev) {
    var w = ev.target.closest ? ev.target.closest('.w') : null;
    if (!w || !HOVER || pinned) return;
    showTip(w);
  });

  el.app.addEventListener('pointerout', function (ev) {
    var w = ev.target.closest ? ev.target.closest('.w') : null;
    if (!w || !HOVER || pinned) return;
    scheduleHide();
  });

  el.app.addEventListener('click', function (ev) {
    var w = ev.target.closest ? ev.target.closest('.w') : null;
    if (!w) return;
    ev.stopPropagation();
    if (active === w && pinned) { hideTip(); return; }
    showTip(w);
    pinned = true;
    el.tip.classList.add('is-pinned');
  });

  el.tip.addEventListener('pointerenter', function () { clearTimeout(hideTimer); });
  el.tip.addEventListener('pointerleave', function () { if (!pinned) scheduleHide(); });
  el.tipClose.addEventListener('click', hideTip);

  document.addEventListener('click', function (ev) {
    if (!active) return;
    if (ev.target === el.tip || el.tip.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest('.w')) return;
    hideTip();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && active) hideTip();
  });

  window.addEventListener('scroll', function () { if (active) place(); }, { passive: true });
  window.addEventListener('resize', function () {
    setTopbarHeight();
    if (active) place();
  });

  /* ------------------------------------------------------------- controls */

  function sync() {
    el.mark.setAttribute('aria-pressed', String(state.mark));
    el.pinyin.setAttribute('aria-pressed', String(state.pinyin));
    el.english.setAttribute('aria-pressed', String(state.english));
    document.documentElement.dataset.theme = state.theme;
    el.theme.textContent = state.theme === 'dark' ? '◑' : '◐';
    document.documentElement.style.setProperty('--fs', state.size + 'px');
    if (BODY) {
      BODY.classList.toggle('is-marked', state.mark);
      BODY.classList.toggle('is-en', state.english);
    }
    savePrefs();
  }

  el.mark.addEventListener('click', function () { state.mark = !state.mark; sync(); });
  el.english.addEventListener('click', function () { state.english = !state.english; sync(); });
  el.pinyin.addEventListener('click', function () {
    state.pinyin = !state.pinyin;
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
  el.theme.addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    sync();
  });
  el.fsDec.addEventListener('click', function () { state.size = Math.max(16, state.size - 1); sync(); });
  el.fsInc.addEventListener('click', function () { state.size = Math.min(30, state.size + 1); sync(); });

  /* ---------------------------------------------------------------- boot */

  function setTopbarHeight() {
    if (!el.topbar) return;
    document.documentElement.style.setProperty('--topbar-h', el.topbar.offsetHeight + 'px');
  }

  if (!localStorage.getItem(PREFS)) {
    state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  window.addEventListener('hashchange', render);

  if (el.topbar && window.ResizeObserver) {
    new ResizeObserver(setTopbarHeight).observe(el.topbar);
  }

  render();
})();
