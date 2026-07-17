/* ============================================================
   Supabase 設定（デプロイ時にGitHub Actionsが値を注入）
   ============================================================ */
const SUPABASE_URL = 'https://lvvcpazeczetawstddrv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eQXhJoYC0_AngShVkSMesg_Uy7VyEIy';
// deployed: 20260717T000238Z

/* ============================================================
   浮遊する金色の粒子と星の演出エンジン
   ============================================================ */
function createParticleField(canvas) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles = [], bursts = [], running = false, raf = null;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        w = Math.round(rect.width) || window.innerWidth;
        h = Math.round(rect.height) || window.innerHeight;
        canvas.width = w * dpr; canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function makeParticle() {
        const isStar = Math.random() < 0.35;
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            r: isStar ? 0.6 + Math.random() * 1.2 : 1 + Math.random() * 2.4,
            vy: isStar ? -0.05 - Math.random() * 0.1 : -0.15 - Math.random() * 0.35,
            vx: (Math.random() - 0.5) * 0.25,
            sway: Math.random() * Math.PI * 2,
            swaySpeed: 0.005 + Math.random() * 0.015,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.02 + Math.random() * 0.04,
            base: 0.25 + Math.random() * 0.5,
            star: isStar
        };
    }

    function seed(count) {
        particles = [];
        for (let i = 0; i < count; i++) particles.push(makeParticle());
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        ctx.globalCompositeOperation = "lighter";

        for (const p of particles) {
            p.sway += p.swaySpeed;
            p.twinkle += p.twinkleSpeed;
            p.x += p.vx + Math.sin(p.sway) * 0.3;
            p.y += p.vy;
            if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;

            const alpha = p.base * (0.55 + 0.45 * Math.sin(p.twinkle));
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
            g.addColorStop(0, `rgba(255, 240, 190, ${alpha})`);
            g.addColorStop(0.4, `rgba(255, 204, 0, ${alpha * 0.5})`);
            g.addColorStop(1, "rgba(255, 159, 67, 0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // 本を開いた瞬間に弾ける光の粒
        for (let i = bursts.length - 1; i >= 0; i--) {
            const b = bursts[i];
            b.x += b.vx; b.y += b.vy;
            b.vy += 0.02; b.vx *= 0.98; b.vy *= 0.98;
            b.life -= 0.012;
            if (b.life <= 0) { bursts.splice(i, 1); continue; }
            const a = b.life;
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4);
            g.addColorStop(0, `rgba(255, 247, 218, ${a})`);
            g.addColorStop(0.5, `rgba(255, 204, 0, ${a * 0.6})`);
            g.addColorStop(1, "rgba(255, 159, 67, 0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalCompositeOperation = "source-over";
        raf = requestAnimationFrame(draw);
    }

    let lastCount = 50;
    function start(count) {
        lastCount = count || 50;
        resize();
        seed(lastCount);
        if (!running) { running = true; draw(); }
    }
    function stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        ctx.clearRect(0, 0, w, h);
    }
    function burst(cx, cy, n) {
        for (let i = 0; i < (n || 60); i++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 5;
            bursts.push({
                x: cx, y: cy,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                r: 0.8 + Math.random() * 2,
                life: 0.7 + Math.random() * 0.5
            });
        }
    }

    window.addEventListener("resize", () => { if (running) { resize(); seed(lastCount); } });
    return { start, stop, burst, get size() { return { w, h }; } };
}

const homeField = createParticleField(document.getElementById("ambient-home"));
const bookField = createParticleField(document.getElementById("ambient-book"));
requestAnimationFrame(() => requestAnimationFrame(() => homeField.start(40)));

/* ============================================================
   絵本データ（Supabaseから取得）
   ============================================================ */
let storiesData = {};       // { [id]: { title, genre, pages, date, created_at } }
let latestStoryId = '';
let currentStoryId = '';
let activePageIndex = 0;
let isAudioEnabled = false;
let speechSynth = window.speechSynthesis;
let speechUtterance = null;
let humanVoice = null;
let iosSpeechKeepAlive = null;
let readStories = new Set();  // id のセット
let returnTo = 'home';
let libraryFilter = 'all';

/* ----- 言語設定 ----- */
let currentLang = localStorage.getItem('lang') || 'ja';

const STRINGS = {
    ja: {
        homeTitle:    '魔法の書庫',
        readToday:    '今日の本を読む',
        readLatest:   '最新の本を読む',
        noStory:      'まだ物語がありません',
        libEmpty:     'この条件の物語はまだありません。',
        openLibrary:  '📚 書庫を訪ねる',
        about:        'この絵本について',
        libraryTitle: '📚 魔法の書庫',
        libraryLead:  'これまでに綴られた物語たち。まだ読んでいない物語も、いつでも開くことができます。',
        filterAll:    'すべて',
        filterUnread: '未読',
        filterRead:   '読破',
        libCount:     (n) => `${n}冊`,
        loading:      '物語を読み込み中…',
        toastRead:    '✨ 物語を読み終えました。「読破」に記録しました',
        tapToOpen:    '【 タップして物語の扉を開く 】',
        tapToReread:  '【 タップして物語をもう一度読む 】',
        closeBook:    '物語を閉じる',
        finishBook:   '読み終えて本を閉じる',
        aboutTitle:   'この絵本について',
        aboutBody:    'このサイトで公開されている絵本の文章と挿絵は、すべてAIによって自動生成されたものです。実在の人物・団体・出来事とは関係ありません。生成された物語のひとときを、どうぞお楽しみください。',
        close:        'とじる',
        noEnglish:    '（英訳準備中）',
        statusRead:   '読破',
        statusUnread: '未読',
        loadError:    '物語の読み込みに失敗しました。<br>しばらくしてから再読み込みしてください。',
        reload:       '再読み込み',
    },
    en: {
        homeTitle:    'The Library of Magic Tales',
        readToday:    "Read Today's Story",
        readLatest:   'Read the Latest Story',
        noStory:      'No stories yet',
        libEmpty:     'No stories match this filter.',
        openLibrary:  '📚 Visit the Library',
        about:        'About This Book',
        libraryTitle: '📚 Magic Library',
        libraryLead:  'All the stories written so far. You can open any story, even ones you have not read yet.',
        filterAll:    'All',
        filterUnread: 'Unread',
        filterRead:   'Completed',
        libCount:     (n) => `${n} ${n === 1 ? 'book' : 'books'}`,
        loading:      'Loading stories…',
        toastRead:    "✨ You've finished the story. Marked as completed.",
        tapToOpen:    '[ Tap to Open the Story ]',
        tapToReread:  '[ Tap to Read Again ]',
        closeBook:    'Close the Story',
        finishBook:   'Finished Reading',
        aboutTitle:   'About This Book',
        aboutBody:    'All stories and illustrations on this site are automatically generated by AI. They have no relation to real people, organizations, or events. Please enjoy the magic of these generated tales.',
        close:        'Close',
        noEnglish:    '(English translation coming soon)',
        statusRead:   'Completed',
        statusUnread: 'Unread',
        loadError:    'Failed to load stories.<br>Please try reloading the page.',
        reload:       'Reload',
    },
};

const GENRE_EN = {
    'ぼうけん':   'Adventure',
    'ゆうじょう': 'Friendship',
    'どうぶつ':   'Animals',
    'きせつ':     'Seasons',
    'ファンタジー': 'Fantasy',
};

/**
 * ストーリー・ページオブジェクトから現在の言語に対応するフィールドを返す。
 * 英語フィールドが存在しない場合は日本語にフォールバックする。
 */
function t(obj, field) {
    if (currentLang === 'en') {
        const val = obj[field + '_en'];
        if (val) return val;
    }
    return obj[field] || '';
}

/**
 * ジャンル名を現在の言語に変換して返す。
 */
function genre(genreJa) {
    if (currentLang === 'en') return GENRE_EN[genreJa] || genreJa;
    return genreJa || 'ものがたり';
}

async function fetchStories() {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/stories?select=id,date,title,title_en,genre,pages,created_at&order=created_at.desc`,
        {
            headers: {
                'apikey': SUPABASE_PUBLISHABLE_KEY,
                'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            }
        }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// JST の今日の日付を "YYYY-MM-DD" で返す
function getTodayJST() {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

async function initApp() {
    try {
        const stories = await fetchStories();
        stories.forEach(s => {
            storiesData[s.id] = {
                title: s.title, title_en: s.title_en,
                genre: s.genre, pages: s.pages,
                date: s.date, created_at: s.created_at
            };
        });

        const readBtn = document.getElementById('home-read-btn');
        if (stories.length > 0) {
            latestStoryId = stories[0].id;
            const latest = storiesData[latestStoryId];
            const isToday = latest.date === getTodayJST();
            const s = STRINGS[currentLang];
            const titleDisplay = t(latest, 'title');
            const prefix = isToday ? s.readToday : s.readLatest;
            readBtn.textContent = `${prefix}：「${titleDisplay}」`;
            readBtn.onclick = () => enterImmersiveView(latestStoryId, 'home');
        } else {
            readBtn.textContent = STRINGS[currentLang].noStory;
            readBtn.disabled = true;
        }

        const ls = document.getElementById('loading-screen');
        ls.classList.add('hidden');
        setTimeout(() => { ls.style.display = 'none'; }, 700);
        applyLang();
    } catch (err) {
        console.error('ストーリー読み込みエラー:', err);
        const ls = document.getElementById('loading-screen');
        const s2 = STRINGS[currentLang];
        ls.querySelector('.loading-inner').innerHTML = `
            <div class="loading-error">
                <p>${s2.loadError}</p>
                <button onclick="location.reload()">${s2.reload}</button>
            </div>`;
    }
}

initApp();

/* ----- 音声 ----- */

// iOS Safari: ユーザーの最初の操作で Speech Synthesis をアンロック
// （ユーザー操作なしに speak() を呼ぶと iOS は無音になる）
let _speechUnlocked = false;
function _unlockSpeechSynthesis() {
    if (_speechUnlocked || !window.speechSynthesis) return;
    _speechUnlocked = true;
    const silent = new SpeechSynthesisUtterance('');
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
}
document.addEventListener('touchstart', _unlockSpeechSynthesis, { once: true, passive: true });
document.addEventListener('click', _unlockSpeechSynthesis, { once: true, passive: true });

function loadBestJapaneseVoice() {
    const voices = speechSynth.getVoices();
    if (voices.length === 0) return;
    humanVoice = voices.find(v => v.lang === 'ja-JP' && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft')))
                 || voices.find(v => v.lang === 'ja-JP')
                 || voices.find(v => v.lang.startsWith('ja'));
}
// iOS Safari は onvoiceschanged が発火しないことがあるためポーリングで待機
function loadVoicesWithRetry(attempt) {
    const voices = speechSynth.getVoices();
    if (voices.length > 0) {
        loadBestJapaneseVoice();
    } else if (attempt < 20) {
        setTimeout(() => loadVoicesWithRetry(attempt + 1), 250);
    }
}
loadVoicesWithRetry(0);
if (speechSynth.onvoiceschanged !== undefined) {
    speechSynth.onvoiceschanged = loadBestJapaneseVoice;
}

/* ----- 日付フォーマット ----- */
function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

// 同日複数冊がある場合は時刻も付与して区別する
function formatDateLabel(story, showTime) {
    let label = formatDate(story.date);
    if (showTime && story.created_at) {
        const dt = new Date(new Date(story.created_at).getTime() + 9 * 3600 * 1000);
        const hh = String(dt.getUTCHours()).padStart(2, '0');
        const mm = String(dt.getUTCMinutes()).padStart(2, '0');
        label += ` ${hh}:${mm}`;
    }
    return label;
}

/* ----- 言語切り替え ----- */
function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang === 'en' ? 'en' : 'ja';
    applyLang();
}

function applyLang() {
    const s = STRINGS[currentLang];

    // data-i18n 属性付き静的要素を一括更新
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const val = s[key];
        if (typeof val === 'string') el.textContent = val;
    });

    // 言語ボタンのハイライト
    document.getElementById('lang-ja').classList.toggle('active', currentLang === 'ja');
    document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');

    // ホーム読むボタン（動的テキスト）
    const readBtn = document.getElementById('home-read-btn');
    if (latestStoryId && storiesData[latestStoryId]) {
        const latest = storiesData[latestStoryId];
        const isToday = latest.date === getTodayJST();
        const titleDisplay = t(latest, 'title');
        const prefix = isToday ? s.readToday : s.readLatest;
        readBtn.textContent = `${prefix}：「${titleDisplay}」`;
        readBtn.disabled = false;
    } else {
        readBtn.textContent = s.noStory;
        readBtn.disabled = true;
    }

    // 書庫が表示中なら再レンダリング
    if (document.getElementById('library-screen').classList.contains('active')) {
        renderLibrary();
    }

    // 絵本が表示中なら本文・タイトルを更新
    if (currentStoryId && document.getElementById('immersive-book-layer').classList.contains('active')) {
        const story = storiesData[currentStoryId];
        if (story) {
            // カバータイトルを更新
            const coverTitle = document.getElementById('immersive-cover-title');
            if (coverTitle) coverTitle.textContent = t(story, 'title');
            // カバーガイドテキストを更新
            const coverGuide = document.getElementById('immersive-cover-guide');
            if (coverGuide) {
                const sg = STRINGS[currentLang];
                const isRead = readStories.has(currentStoryId);
                coverGuide.textContent = isRead ? sg.tapToReread : sg.tapToOpen;
            }
            // 各ページのテキストを更新
            story.pages.forEach((page, index) => {
                const pageEl = document.getElementById(`immersive-page-${index}`);
                if (pageEl) {
                    const textEl = pageEl.querySelector('.page-text');
                    if (textEl) textEl.textContent = t(page, 'text');
                }
            });
        }
    }
}

/* ----- 書庫ページ ----- */
function openLibrary() {
    renderLibrary();
    document.getElementById("library-screen").classList.add("active");
}
function closeLibrary() {
    document.getElementById("library-screen").classList.remove("active");
}
function setFilter(f, btn) {
    libraryFilter = f;
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    renderLibrary();
}
function renderLibrary() {
    const list = document.getElementById("lib-list");
    list.innerHTML = "";

    // 新着順（created_at 降順）でソート
    const sortedIds = Object.keys(storiesData).sort((a, b) =>
        new Date(storiesData[b].created_at) - new Date(storiesData[a].created_at)
    );

    // 同日に複数冊ある日付を検出
    const dateCounts = {};
    sortedIds.forEach(id => {
        const d = storiesData[id].date;
        dateCounts[d] = (dateCounts[d] || 0) + 1;
    });

    let shown = 0;
    sortedIds.forEach(id => {
        const story = storiesData[id];
        const isRead = readStories.has(id);
        if (libraryFilter === "unread" && isRead) return;
        if (libraryFilter === "read" && !isRead) return;
        shown++;
        const multipleToday = dateCounts[story.date] > 1;
        const dateLabel = formatDateLabel(story, multipleToday);
        const card = document.createElement("div");
        card.className = "lib-card";
        card.onclick = () => enterImmersiveView(id, "library");
        const s = STRINGS[currentLang];
        card.innerHTML = `
            <div class="lib-thumb"><img src="${story.pages[0].img}" alt=""></div>
            <div class="lib-info">
                <div class="lib-meta">
                    <span class="lib-date">${dateLabel}</span>
                    <span class="lib-genre">${genre(story.genre)}</span>
                </div>
                <div class="lib-title">${t(story, 'title')}</div>
                <span class="lib-status ${isRead ? 'read' : 'unread'}">${isRead ? s.statusRead : s.statusUnread}</span>
            </div>`;
        list.appendChild(card);
    });
    document.getElementById("lib-count").textContent = STRINGS[currentLang].libCount(shown);
    if (shown === 0) {
        const emptyMsg = STRINGS[currentLang].libEmpty;
        list.innerHTML = `<div class="lib-empty">${emptyMsg}</div>`;
    }
}

/* ----- AI注意ダイアログ ----- */
function openAiModal() { document.getElementById("ai-modal").classList.add("active"); }
function closeAiModal() { document.getElementById("ai-modal").classList.remove("active"); }
function closeAiModalBg(e) { if (e.target.id === "ai-modal") closeAiModal(); }

/* ----- コントロールパネルの表示制御 ----- */
function showControls() {
    document.getElementById('global-controls-panel').classList.add('visible');
}
function hideControls() {
    document.getElementById('global-controls-panel').classList.remove('visible');
}

function enterImmersiveView(key, from) {
    currentStoryId = key;
    returnTo = from || 'home';
    if (returnTo === 'home') {
        document.getElementById("home-screen").classList.add("fading-out");
    }

    setTimeout(() => {
        const layer = document.getElementById("immersive-book-layer");
        layer.classList.add("active");
        bookField.start(55);

        const stage = document.getElementById("story-stage");
        stage.className = "book-wrapper";

        setupStory(currentStoryId);
        showControls();
    }, 800);
}

function openImmersiveBook() {
    const bookStage = document.getElementById("story-stage");
    bookStage.classList.add("stage-opened", "animating");

    const size = bookField.size;
    bookField.burst(size.w / 2, size.h / 2, 70);

    // アニメーション中はコントロールパネルのタップを無効化
    document.getElementById('global-controls-panel').style.pointerEvents = 'none';

    setTimeout(() => {
        bookStage.classList.remove("animating");
        document.getElementById('global-controls-panel').style.pointerEvents = '';
        if (isAudioEnabled) playVoice();
    }, 1000);
}

function handlePageVoice() {
    if (isAudioEnabled) {
        setTimeout(() => { playVoice(); }, 400);
    } else {
        stopVoice();
    }
}

function toggleAudio() {
    const btn = document.getElementById("audio-toggle");
    isAudioEnabled = !isAudioEnabled;
    if (isAudioEnabled) { btn.classList.add("active"); playVoice(); }
    else { btn.classList.remove("active"); stopVoice(); }
}

function closeAndSaveStory() {
    stopVoice();
    const stage = document.getElementById("story-stage");
    stage.classList.remove("stage-opened");

    const isFirstTime = !readStories.has(currentStoryId);

    if (isFirstTime) {
        readStories.add(currentStoryId);
        setTimeout(() => { stage.classList.add("closing-animation"); }, 1400);
        setTimeout(() => { backToOrigin(true); }, 2500);
    } else {
        setTimeout(() => { backToOrigin(false); }, 1400);
    }
}

function closeBookInMiddle() {
    stopVoice();
    backToOrigin(false);
}

function backToOrigin(withToast) {
    document.getElementById("immersive-book-layer").classList.remove("active");
    hideControls();
    bookField.stop();

    if (returnTo === 'library') {
        renderLibrary();
        document.getElementById("library-screen").classList.add("active");
    } else {
        document.getElementById("home-screen").classList.remove("fading-out");
    }

    if (withToast) {
        const toast = document.getElementById("memory-toast");
        toast.classList.add("show");
        setTimeout(() => { toast.classList.remove("show"); }, 3500);
    }
}

function setupStory(key) {
    activePageIndex = 0;
    const story = storiesData[key];
    const coverTitle = document.getElementById("immersive-cover-title");
    const coverDiv = document.getElementById("book-cover");
    const coverGuide = document.getElementById("immersive-cover-guide");

    const isRead = readStories.has(key);
    coverTitle.textContent = t(story, 'title');
    coverDiv.className = "book-cover";
    const sg = STRINGS[currentLang];
    coverGuide.textContent = isRead ? sg.tapToReread : sg.tapToOpen;

    const wrapper = document.getElementById("pages-wrapper");
    wrapper.innerHTML = "";

    story.pages.forEach((page, index) => {
        const pageEl = document.createElement("div");
        pageEl.className = `page ${index === 0 ? 'active' : ''}`;
        pageEl.id = `immersive-page-${index}`;
        pageEl.style.zIndex = story.pages.length - index;
        pageEl.innerHTML = `
            <div class="page-sheen"></div>
            <div class="page-image-box">
                <img src="${page.img}" alt="scene">
            </div>
            <div class="page-content-box">
                <p class="page-text">${t(page, 'text') || `<em>${STRINGS[currentLang].noEnglish}</em>`}</p>
            </div>
        `;
        wrapper.appendChild(pageEl);
    });
    updateButtonVisibility();
}

function updateButtonVisibility() {
    const story = storiesData[currentStoryId];
    const closeMiddleBtn = document.getElementById("close-middle-btn");
    const finishBtn = document.getElementById("finish-btn");
    if (activePageIndex === story.pages.length - 1) {
        closeMiddleBtn.style.display = "none";
        finishBtn.style.display = "block";
    } else {
        closeMiddleBtn.style.display = "block";
        finishBtn.style.display = "none";
    }
}

function nextPage() {
    const story = storiesData[currentStoryId];
    if (activePageIndex < story.pages.length - 1) {
        const currentPage = document.getElementById(`immersive-page-${activePageIndex}`);
        currentPage.classList.remove("active");
        currentPage.classList.add("turned");

        activePageIndex++;
        const np = document.getElementById(`immersive-page-${activePageIndex}`);
        np.classList.add("active");

        handlePageVoice();
        updateButtonVisibility();
    }
}

function prevPage() {
    if (activePageIndex > 0) {
        const currentPage = document.getElementById(`immersive-page-${activePageIndex}`);
        currentPage.classList.remove("active");

        activePageIndex--;
        const pp = document.getElementById(`immersive-page-${activePageIndex}`);
        pp.classList.remove("turned");
        pp.classList.add("active");

        handlePageVoice();
        updateButtonVisibility();
    }
}

function playVoice() {
    stopVoice();
    // iOS Safari: cancel() の直後に speak() を呼ぶと無視されるため 50ms 待機する
    setTimeout(() => {
        if (!currentStoryId || !storiesData[currentStoryId]) return;
        const story = storiesData[currentStoryId];
        const page = story.pages[activePageIndex];
        const currentText = t(page, 'text');
        speechUtterance = new SpeechSynthesisUtterance(currentText);
        if (currentLang === 'en') {
            // 英語モード: 英語音声を優先して選択する
            const enVoice = speechSynth.getVoices().find(v => v.lang.startsWith('en'));
            if (enVoice) speechUtterance.voice = enVoice;
            speechUtterance.lang = 'en-US';
        } else {
            // 日本語モード: 最適な日本語音声を使用する
            if (!humanVoice) loadBestJapaneseVoice();
            if (humanVoice) speechUtterance.voice = humanVoice;
            speechUtterance.lang = 'ja-JP';
        }
        speechUtterance.rate = 0.92;
        speechUtterance.pitch = 1.05;
        // iOS Safari バグ対策: 約15秒で音声が停止するため定期的に resume する
        iosSpeechKeepAlive = setInterval(() => {
            if (speechSynth.speaking) { speechSynth.pause(); speechSynth.resume(); }
        }, 12000);
        speechSynth.speak(speechUtterance);
    }, 50);
}

function stopVoice() {
    if (iosSpeechKeepAlive) { clearInterval(iosSpeechKeepAlive); iosSpeechKeepAlive = null; }
    if (speechSynth.speaking) speechSynth.cancel();
}
