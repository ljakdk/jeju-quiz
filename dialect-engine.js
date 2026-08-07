/* ===== 우리나라 방언 퀴즈 공유 엔진 (방·랭킹·게시판·오답집계·배경음악) =====
   각 지역 HTML에서 window.QUIZ = { region, emoji, questions:[...] } 정의 후 이 스크립트를 불러온다. */
(function () {
  "use strict";

  /* ---- Supabase (기존 제주와 동일 프로젝트, 별도 _kr 테이블 사용) ---- */
  var SUPABASE_URL = "https://zxdxdqsutsvnbplqaefx.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4ZHhkcXN1dHN2bmJwbHFhZWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjQyMTQsImV4cCI6MjEwMTU0MDIxNH0.Xv5l9F8696UYIxmcNltJwDtz_VS9aBp2hYfEvhjl33U";
  var HDR = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY };
  var HDRJ = { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" };

  var REGIONS = [
    { name: "🏠 전체", file: "dialect.html" },
    { name: "제주", file: "jeju.html" },
    { name: "경상도", file: "gyeongsang.html" },
    { name: "전라도", file: "jeolla.html" },
    { name: "충청도", file: "chungcheong.html" },
    { name: "강원도", file: "gangwon.html" }
  ];

  var CFG = (typeof QUIZ !== "undefined" && QUIZ) ? QUIZ : (window.QUIZ || {});
  var REGION = CFG.region || "방언";
  var EMOJI = CFG.emoji || "🗣️";
  var BANK = CFG.questions || [];

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); };
  function rpc(fn, p) { return fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, { method: "POST", headers: HDRJ, body: JSON.stringify(p) }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }); }

  /* ---- 방(여러 지역 공용, URL ?room=코드 + localStorage로 페이지 간 유지) ---- */
  function getRoomCode() {
    var c = null;
    try { c = new URLSearchParams(location.search).get("room"); } catch (e) {}
    if (!c) { try { c = localStorage.getItem("krRoomCode"); } catch (e) {} }
    return c ? c.toUpperCase() : null;
  }
  var currentRoom = null;
  (function () {
    var code = getRoomCode();
    if (code) {
      var nm = code; try { var s = JSON.parse(localStorage.getItem("krRoom") || "null"); if (s && s.code === code) nm = s.name; } catch (e) {}
      currentRoom = { code: code, name: nm };
      try { localStorage.setItem("krRoomCode", code); } catch (e) {}
    }
  })();
  function roomQS() { return currentRoom ? ("?room=" + encodeURIComponent(currentRoom.code)) : ""; }

  /* ---- 상태 ---- */
  var userName = "", QUESTIONS = [], current = 0, answers = [], answerTimeMs = [];
  var advanceTimer = null, combo = 0, bestCombo = 0, startTime = 0, tickTimer = null, lastWrong = [];
  var comboBonus = 0, challengeMode = false, challengeTimer = null, challengeEndsAt = 0;
  var survivalMode = false, survivalLives = 3, matchState = null;
  var soundOn = true, lastShownIndex = -1, qStartTime = 0, rankReturnTo = "start", learnReturnTo = "start";

  /* ---------- 화면 구성 ---------- */
  function build() {
    injectCSS();
    var nav = REGIONS.map(function (r) {
      var active = r.name === REGION ? " active" : "";
      return '<a class="dnav-link' + active + '" href="' + r.file + roomQS() + '">' + r.name + '</a>';
    }).join("");

    $("app").innerHTML =
      '<button id="themeBtn" class="theme-btn" title="다크모드 전환">🌙</button>' +
      '<nav class="dnav">' + nav + '</nav>' +
      '<div class="room-banner hidden" id="roomBanner"></div>' +

      '<div id="startScreen" class="card">' +
        '<div class="hero"><span class="emoji">' + EMOJI + '</span><h1>' + esc(REGION) + ' 방언 퀴즈</h1>' +
        '<div class="sub">얼마나 알고 있을까요?</div>' +
        '<p class="desc">짧은 대화를 읽고 방언의 뜻을 맞혀 보세요. 총 ' + BANK.length + '문제!</p></div>' +
        '<div class="best-badge hidden" id="bestBadge"></div>' +
        '<div class="greet hidden" id="greetBox"></div>' +
        '<div class="name-box" id="nameBox"><label for="nameInput">이름을 입력해 주세요 <span class="req">(반드시 실명으로 입력)</span></label>' +
        '<input type="text" id="nameInput" placeholder="예) 김한글" maxlength="20" autocomplete="off"><div class="err" id="nameErr"></div></div>' +
        '<button class="btn" id="startBtn">퀴즈 시작하기 🚀</button>' +
        '<div class="mode-grid">' +
          '<button class="mode-btn" id="startChallengeBtn"><span class="me">⏱️</span><span class="mt">도전 모드</span><span class="ms">60초 타임어택</span></button>' +
          '<button class="mode-btn" id="startSurvivalBtn"><span class="me">💥</span><span class="mt">골든벨 생존</span><span class="ms">목숨 3개</span></button>' +
          '<button class="mode-btn" id="startMatchBtn"><span class="me">🃏</span><span class="mt">짝맞추기</span><span class="ms">기억력 게임</span></button>' +
        '</div>' +
        '<div class="side-grid">' +
          '<button class="btn ghost" id="startDexBtn">📖 방언 도감</button>' +
          '<button class="btn ghost" id="startBadgeBtn">🏅 내 배지</button>' +
        '</div>' +
        '<button class="btn ghost hidden" id="startRankBtn">🏆 우리 반 랭킹 보기</button>' +
        '<button class="btn ghost hidden" id="startLearnBtn">📚 우리 반 배운 점 보기</button>' +
        '<div class="joinhint" id="joinHint"></div>' +
      '</div>' +

      '<div id="quizScreen" class="card hidden">' +
        '<div class="topbar"><span class="who" id="whoLabel"></span><span class="topbar-right">' +
        '<span class="timer" id="timer">⏱ 00:00</span><button class="sound-btn" id="soundBtn">🔊</button><span class="count" id="countLabel"></span></span></div>' +
        '<div class="progress"><div id="progressBar"></div></div><div class="nav-grid" id="navGrid"></div><div id="questionArea"></div>' +
        '<div class="footer-nav"><button class="btn ghost" id="prevBtn">← 이전</button><button class="btn" id="nextBtn">다음 →</button></div>' +
        '<div style="margin-top:12px"><button class="btn alt" id="submitBtn">결과 확인하기 ✅</button></div></div>' +

      '<div id="resultScreen" class="card hidden"></div>' +
      '<div id="dexScreen" class="card hidden"></div>' +
      '<div id="badgeScreen" class="card hidden"></div>' +
      '<div id="matchScreen" class="card hidden"></div>' +

      '<div id="rankScreen" class="card hidden">' +
        '<div class="rank-head"><div><h2 class="rank-title" id="rankTitle">🏆 우리 반 랭킹</h2><div class="rank-sub">' + esc(REGION) + ' 방언 순위</div></div>' +
        '<button class="btn ghost rank-refresh" id="rankRefresh">🔄</button></div>' +
        '<div id="rankList" class="rank-list"></div><div id="hardWords" class="hard-box"></div>' +
        '<button class="btn ghost room-reset-btn hidden" id="rankResetBtn">🧹 우리 반 점수 초기화 (선생님)</button>' +
        '<button class="btn" id="rankBack" style="margin-top:18px">← 돌아가기</button></div>' +

      '<div id="learnScreen" class="card hidden">' +
        '<div class="rank-head"><div><h2 class="rank-title">📚 우리 반 배운 점</h2><div class="rank-sub">' + esc(REGION) + ' 방언에서 새롭게 알게 된 점</div></div>' +
        '<button class="btn ghost rank-refresh" id="learnRefresh">🔄</button></div>' +
        '<div id="learnWriteBox"><button class="btn alt" id="learnWriteBtn">✏️ 배운 점 남기기</button>' +
        '<div id="learnWriteForm" class="hidden"><input id="learnName" type="text" placeholder="이름(실명)" maxlength="20">' +
        '<textarea id="learnText" placeholder="새롭게 알게 된 점을 적어 주세요." maxlength="300"></textarea>' +
        '<div class="rank-status" id="learnWriteStatus"></div><button class="btn alt" id="learnSubmit">올리기</button>' +
        '<button class="btn ghost" id="learnCancel" style="margin-top:10px">취소</button></div></div>' +
        '<div id="learnList" class="rank-list"></div>' +
        '<button class="btn" id="learnBack" style="margin-top:18px">← 돌아가기</button></div>' +

      '<div id="resetModal" class="modal-overlay hidden"><div class="modal"><div class="m-emoji">🧹</div>' +
        '<p>이 방의 <b>' + esc(REGION) + '</b> 점수를 지울까요?<br>선생님 비밀번호를 입력하세요.<br><span class="dim">(방 전체 점수가 초기화됩니다)</span></p>' +
        '<input id="resetPw" type="text" class="reset-input" placeholder="방 비밀번호">' +
        '<div class="rank-status" id="resetStatus"></div>' +
        '<div class="modal-btns"><button class="btn ghost" id="resetCancel">취소</button><button class="btn" id="resetGo">초기화</button></div></div></div>' +

      '<canvas id="confetti" class="confetti-canvas hidden"></canvas>';

    $("themeBtn").onclick = toggleTheme;
    $("startBtn").onclick = startQuiz;
    $("soundBtn").onclick = toggleSound;
    $("prevBtn").onclick = function () { goRelative(-1); };
    $("nextBtn").onclick = function () { goRelative(1); };
    $("submitBtn").onclick = submitQuiz;
    $("nameInput").addEventListener("keydown", function (e) { if (e.key === "Enter") startQuiz(); });
    $("startRankBtn").onclick = function () { openRank("start"); };
    $("startLearnBtn").onclick = function () { openLearn("start"); };
    $("startDexBtn").onclick = openDex;
    $("startChallengeBtn").onclick = startChallenge;
    $("startSurvivalBtn").onclick = startSurvival;
    $("startMatchBtn").onclick = startMatch;
    $("startBadgeBtn").onclick = openBadges;
    $("rankRefresh").onclick = loadLeaderboard;
    $("rankBack").onclick = closeRank;
    $("rankResetBtn").onclick = openResetModal;
    $("learnRefresh").onclick = loadReflections;
    $("learnBack").onclick = closeLearn;
    $("learnWriteBtn").onclick = toggleLearnWrite;
    $("learnCancel").onclick = toggleLearnWrite;
    $("learnSubmit").onclick = submitLearn;
    $("resetCancel").onclick = function () { $("resetModal").classList.add("hidden"); };
    $("resetGo").onclick = doResetRoom;

    document.addEventListener("keydown", function (e) {
      if ($("quizScreen").classList.contains("hidden")) return;
      if (e.key >= "1" && e.key <= "4") { var i = +e.key - 1; if (i < QUESTIONS[current].options.length) { e.preventDefault(); choose(i); } }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goRelative(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goRelative(1); }
      else if (e.key === "Enter" && current === QUESTIONS.length - 1) { e.preventDefault(); submitQuiz(); }
    });
  }

  /* ---------- 방 배너 / 버튼 상태 ---------- */
  function refreshRoomUI() {
    var el = $("roomBanner");
    if (currentRoom) { el.classList.remove("hidden"); el.innerHTML = '🏫 <b>' + esc(currentRoom.name) + '</b> 방 · ' + esc(REGION) + ' <span class="room-code">' + esc(currentRoom.code) + '</span>'; }
    else el.classList.add("hidden");
    $("startRankBtn").classList.toggle("hidden", !currentRoom);
    $("startLearnBtn").classList.toggle("hidden", !currentRoom);
    $("joinHint").innerHTML = currentRoom ? "" : '학급 방에 입장하면 랭킹·게시판을 함께 볼 수 있어요. <a href="dialect.html">전체(허브)에서 입장하기 →</a>';
  }
  function detectRoomName() {
    if (!currentRoom) return;
    rpc("get_room_kr", { p_code: currentRoom.code }).then(function (name) {
      if (name) { currentRoom.name = name; try { localStorage.setItem("krRoom", JSON.stringify(currentRoom)); } catch (e) {} refreshRoomUI(); }
      else { currentRoom = null; try { localStorage.removeItem("krRoomCode"); } catch (e) {} refreshRoomUI(); }
    }).catch(function () {});
  }

  /* ---------- 다크모드/소리 ---------- */
  function applyTheme(t) { if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); var b = $("themeBtn"); if (b) b.textContent = (t === "dark") ? "☀️" : "🌙"; try { localStorage.setItem("dialectTheme", t); } catch (e) {} }
  function toggleTheme() { applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); }
  function toggleSound() { soundOn = !soundOn; $("soundBtn").textContent = soundOn ? "🔊" : "🔇"; }
  var audioCtx = null;
  function tone(f, o, d, ty) { var t = audioCtx.currentTime + o, os = audioCtx.createOscillator(), g = audioCtx.createGain(); os.type = ty || "sine"; os.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); os.connect(g); g.connect(audioCtx.destination); os.start(t); os.stop(t + d + 0.02); }
  function playSound(k) { if (!soundOn) return; try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); if (k === "click") tone(520, 0, 0.05, "triangle"); else if (k === "correct") { tone(660, 0, 0.12); tone(880, 0.06, 0.12); } else if (k === "wrong") tone(160, 0, 0.22, "sawtooth"); else if (k === "combo") [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, i * 0.05, 0.12, "triangle"); }); else if (k === "timeup") { tone(392, 0, 0.25, "sawtooth"); tone(262, 0.18, 0.35, "sawtooth"); } else if (k === "fanfare")[523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.13, 0.2); }); } catch (e) {} }

  /* ---------- 셔플 ---------- */
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function buildShuffled(list) { var qs = list.map(function (q) { var o = shuffle(q.options.map(function (_, i) { return i; })); return { dialogue: q.dialogue, hl: q.hl, q: q.q, exp: q.exp, options: o.map(function (i) { return q.options[i]; }), answer: o.indexOf(q.answer) }; }); return shuffle(qs); }

  /* ---------- 최고 기록(방 밖에서만 표시) ---------- */
  function bestKey() { return "krBest_" + REGION; }
  function getBest() { try { return JSON.parse(localStorage.getItem(bestKey()) || "null"); } catch (e) { return null; } }
  function renderBestBadge() { var el = $("bestBadge"); if (!el) return; var b = getBest(); if (b && !currentRoom) { el.classList.remove("hidden"); el.innerHTML = '🏅 내 최고 기록 · <span class="hl2">🏆 ' + b.score + '점</span> · 정확도 ' + b.pct + '%' + (b.combo >= 2 ? ' · 🔥 최고 ' + b.combo + '연속' : ''); } else el.classList.add("hidden"); }

  /* ---------- 타이머 ---------- */
  function fmtTime(ms) { var s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
  function startTimer() { startTime = Date.now(); $("timer").textContent = "⏱ 00:00"; tickTimer = setInterval(function () { $("timer").textContent = "⏱ " + fmtTime(Date.now() - startTime); }, 1000); }
  function stopTimer() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  /* ---------- 라운드 ---------- */
  function startQuiz() {
    var v = $("nameBox").classList.contains("hidden") ? userName : $("nameInput").value.trim();
    if (!v) { $("nameErr").textContent = "이름을 입력해야 시작할 수 있어요!"; $("nameInput").focus(); return; }
    userName = v; try { localStorage.setItem("krName", v); } catch (e) {}
    startRound(buildShuffled(BANK));
  }
  function updateNameArea() {
    var stored = ""; try { stored = localStorage.getItem("krName") || ""; } catch (e) {}
    if (stored) {
      userName = stored;
      $("greetBox").classList.remove("hidden");
      $("greetBox").innerHTML = '🙋 <b>' + esc(stored) + '</b> 님으로 참여 중 <button type="button" class="linkbtn" id="changeNameBtn">이름 바꾸기</button>';
      $("nameBox").classList.add("hidden");
      $("changeNameBtn").onclick = function () { $("greetBox").classList.add("hidden"); $("nameBox").classList.remove("hidden"); $("nameInput").value = stored; $("nameInput").focus(); };
    } else { $("greetBox").classList.add("hidden"); $("nameBox").classList.remove("hidden"); }
  }
  function retryRound() { startRound(buildShuffled(BANK)); }
  function retryWrong() { if (lastWrong.length) startRound(buildShuffled(lastWrong)); }
  function showOnly(id) { ["startScreen", "quizScreen", "resultScreen", "rankScreen", "learnScreen", "dexScreen", "badgeScreen", "matchScreen"].forEach(function (s) { $(s).classList.add("hidden"); }); $(id).classList.remove("hidden"); }
  function startRound(qs) {
    clearAdvance(); stopTimer();
    QUESTIONS = qs; answers = new Array(qs.length).fill(null); answerTimeMs = new Array(qs.length).fill(null);
    current = 0; lastShownIndex = -1; combo = 0; bestCombo = 0; comboBonus = 0; challengeMode = false; $("quizScreen").classList.remove("challenge");
    $("whoLabel").textContent = "🙋 " + userName + (currentRoom ? " · " + currentRoom.name : "");
    showOnly("quizScreen"); startTimer(); buildNav(); render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function buildNav() { var g = $("navGrid"); g.innerHTML = ""; QUESTIONS.forEach(function (_, i) { var b = document.createElement("button"); b.textContent = i + 1; b.onclick = function () { clearAdvance(); current = i; render(); }; g.appendChild(b); }); }
  function updateNav() { var b = $("navGrid").children; for (var i = 0; i < b.length; i++) { b[i].className = ""; if (answers[i] !== null) b[i].classList.add("answered"); if (i === current) b[i].classList.add("current"); } }
  function render() {
    var q = QUESTIONS[current]; if (!q) return;
    if (current !== lastShownIndex) { qStartTime = Date.now(); lastShownIndex = current; }
    var dh = q.dialogue.map(function (p) { var t = p[1].split(q.hl).join('<span class="hl">' + esc(q.hl) + '</span>'); return '<div class="line"><span class="spk">' + esc(p[0]) + ':</span>' + t + '</div>'; }).join("");
    var mk = ["A", "B", "C", "D"];
    var oh = q.options.map(function (o, i) { return '<button class="opt' + (answers[current] === i ? " selected" : "") + '" data-i="' + i + '"><span class="mk">' + mk[i] + '</span><span>' + esc(o) + '</span></button>'; }).join("");
    $("questionArea").innerHTML = '<span class="qtag">제 ' + (current + 1) + ' 문제</span><div class="dialogue">' + dh + '</div><div class="qtext">' + esc(q.q) + '</div><div class="options">' + oh + '</div>';
    Array.prototype.forEach.call($("questionArea").querySelectorAll(".opt"), function (b) { b.onclick = function () { choose(+b.getAttribute("data-i")); }; });
    if (!challengeMode && !survivalMode) $("countLabel").textContent = (current + 1) + " / " + QUESTIONS.length;
    if (!challengeMode && !survivalMode) $("progressBar").style.width = ((current + 1) / QUESTIONS.length * 100) + "%";
    $("prevBtn").style.visibility = current === 0 ? "hidden" : "visible";
    $("nextBtn").style.visibility = current === QUESTIONS.length - 1 ? "hidden" : "visible";
    updateNav();
  }
  function choose(i) { var first = answers[current] === null; if (first) answerTimeMs[current] = Date.now() - qStartTime; answers[current] = i; var ok = (i === QUESTIONS[current].answer); if (first) { if (ok) { combo++; if (combo > bestCombo) bestCombo = combo; var add = Math.min(combo, 6) - 1; if (add > 0) comboBonus += add; if (combo >= 2) showCombo(combo); playSound(combo >= 3 ? "combo" : "correct"); } else { combo = 0; playSound("wrong"); if (survivalMode) survivalLives--; } if (survivalMode) updateSurvivalHud(); } else { playSound("click"); } render(); clearAdvance(); var last = current >= QUESTIONS.length - 1; if (survivalMode) { if (first && !ok && survivalLives <= 0) { advanceTimer = setTimeout(function () { advanceTimer = null; finishSurvival(); }, 750); } else { advanceTimer = setTimeout(function () { advanceTimer = null; if (!last) { current++; render(); updateSurvivalHud(); } }, 640); } } else if (challengeMode) { advanceTimer = setTimeout(function () { advanceTimer = null; if (!last) { current++; render(); } }, 480); } else if (!last) { advanceTimer = setTimeout(function () { advanceTimer = null; current++; render(); }, 350); } }
  function clearAdvance() { if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; } }
  function goRelative(d) { clearAdvance(); var n = current + d; if (n >= 0 && n < QUESTIONS.length) { current = n; render(); } }

  /* ---------- 제출 & 결과 ---------- */
  function submitQuiz() { clearAdvance(); var un = answers.filter(function (a) { return a === null; }).length; if (un > 0 && !window.confirm("아직 풀지 않은 문제가 " + un + "개 있어요.\n그래도 결과를 확인할까요? (안 푼 문제는 오답 처리)")) return; doSubmit(); }
  function doSubmit() {
    stopTimer();
    var elapsed = Date.now() - startTime, correct = 0, speed = 0, gained = []; lastWrong = [];
    QUESTIONS.forEach(function (q, i) { if (answers[i] === q.answer) { correct++; gained.push(q.hl); var t = answerTimeMs[i] == null ? 99999 : answerTimeMs[i]; if (t < 3000) speed += 5; else if (t < 6000) speed += 3; else if (t < 10000) speed += 1; } else lastWrong.push(q); });
    var total = QUESTIONS.length, pct = Math.round(correct / total * 100), score = correct * 10 + speed + comboBonus; addDex(gained); updateDexBtn();
    markPlayed(REGION); earnBadge("first"); if (pct === 100) earnBadge("perfect"); if (bestCombo >= 10) earnBadge("combo10"); updateBadgeBtn();
    var newRecord = false;
    if (!currentRoom) { var b = getBest(); if (!b || score > b.score) { newRecord = true; try { localStorage.setItem(bestKey(), JSON.stringify({ score: score, pct: pct, combo: bestCombo })); } catch (e) {} } else if (bestCombo > (b.combo || 0)) { try { localStorage.setItem(bestKey(), JSON.stringify({ score: b.score, pct: b.pct, combo: bestCombo })); } catch (e) {} } }
    var grade, emoji;
    if (pct === 100) { grade = REGION + " 방언 박사님! 🏆"; emoji = "🏆"; } else if (pct >= 80) { grade = REGION + " 방언 고수! 🌟"; emoji = "🌟"; } else if (pct >= 60) { grade = "제법인데요? 👍"; emoji = "😄"; } else if (pct >= 40) { grade = "조금만 더 배워봐요 📖"; emoji = "🙂"; } else { grade = "다시 도전해봐요 💪"; emoji = "🐣"; }
    var mk = ["A", "B", "C", "D"];
    var rev = QUESTIONS.map(function (q, i) { var my = answers[i], ok = my === q.answer; var dl = q.dialogue.map(function (p) { return esc(p[0]) + ": " + esc(p[1]); }).join(" / "); var myT = my === null ? "무응답" : (mk[my] + ". " + esc(q.options[my])); var an = mk[q.answer] + ". " + esc(q.options[q.answer]); return '<div class="rev ' + (ok ? "correct" : "wrong") + '"><div class="rh"><span>' + (ok ? "✅" : "❌") + '</span><span class="no">' + (i + 1) + '번</span><span>' + esc(q.hl) + '</span></div><div class="rq">💬 ' + dl + '</div><div class="ans ' + (ok ? "you-ok" : "you-wrong") + '"><span class="lab">내 답:</span> ' + myT + '</div>' + (ok ? "" : '<div class="ans you-ok"><span class="lab">정답:</span> ' + an + '</div>') + '<div class="exp">📝 ' + q.exp + '</div></div>'; }).join("");

    var wrongBtn = lastWrong.length ? '<button class="btn ghost" id="retryWrongBtn">❌ 틀린 문제만 다시 풀기 (' + lastWrong.length + ')</button>' : "";
    var comboNote = bestCombo >= 2 ? '<div class="combo-note">🔥 이번 최고 ' + bestCombo + '연속!</div>' : "";
    var recNote = newRecord ? '<div class="newrecord">🎉 내 최고 기록 경신!</div>' : "";
    var rankBtn = currentRoom ? '<button class="btn alt" id="resRankBtn">🏆 우리 반 랭킹 보기</button>' : "";
    var memoBox = currentRoom ? '<div class="memo-box"><label class="memo-title" for="memoInput">📝 오늘 새롭게 알게 된 점</label>' +
      '<textarea id="memoInput" placeholder="예) ‘' + esc(BANK[0] ? BANK[0].hl : "") + '’의 뜻을 처음 알았다!" maxlength="300"></textarea><div class="memo-count"><span id="memoCount">0</span> / 300</div>' +
      '<div class="rank-status" id="memoStatus"></div><button class="btn alt" id="memoBtn">📚 배운 점 게시판에 올리기</button>' +
      '<button class="btn ghost" id="resLearnBtn" style="margin-top:10px">우리 반 배운 점 보기</button></div>' : "";

    showOnly("resultScreen");
    $("resultScreen").innerHTML =
      '<div class="score-hero"><span class="emoji">' + emoji + '</span><h2>' + esc(userName) + ' 님의 결과</h2>' +
      '<div class="score-ring" style="--pct:' + pct + '%"><div class="inner"><span class="big">' + correct + '/' + total + '</span><span class="small">' + pct + '점</span></div></div>' +
      '<div class="grade">' + grade + '</div>' + recNote + comboNote + '</div>' +
      '<div class="stat-row"><div class="stat"><div class="v">🏆 ' + score + '</div><div class="l">총점</div></div><div class="stat"><div class="v">⚡ +' + speed + '</div><div class="l">속도 보너스</div></div><div class="stat"><div class="v">🔥 +' + comboBonus + '</div><div class="l">콤보 보너스</div></div><div class="stat"><div class="v">⏱ ' + fmtTime(elapsed) + '</div><div class="l">걸린 시간</div></div></div>' +
      '<div class="standing" id="standing"></div><div class="rank-status" id="rankStatus"></div>' +
      '<div class="result-actions"><button class="btn" id="retryBtn">↺ 다시 풀기 (새로 섞기)</button>' + rankBtn + wrongBtn + '</div>' +
      memoBox +
      '<div class="review-title">📚 문제별 해설</div>' + rev;

    $("retryBtn").onclick = retryRound;
    if (lastWrong.length) $("retryWrongBtn").onclick = retryWrong;
    if (currentRoom) { $("resRankBtn").onclick = function () { openRank("result"); }; $("resLearnBtn").onclick = function () { openLearn("result"); };
      var memoEl = $("memoInput"); if (memoEl) memoEl.addEventListener("input", function () { $("memoCount").textContent = memoEl.value.length; });
      $("memoBtn").onclick = submitMemo;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderBestBadge();
    if (pct >= 80) { playSound("fanfare"); runConfetti(); }

    if (currentRoom) {
      setRankStatus("⏳ 순위 등록 중…");
      rpc("submit_score_kr", { p_room: currentRoom.code, p_region: REGION, p_name: userName, p_score: score, p_pct: pct, p_secs: Math.round(elapsed / 1000) })
        .then(function (attempt) { var info = (attempt >= 2) ? " (" + attempt + "회차 기록으로 갱신)" : ""; setRankStatus("✅ 우리 반 랭킹에 등록됐어요!" + info); showStanding(score); })
        .catch(function () { setRankStatus("⚠️ 순위 등록 실패 — 인터넷을 확인해 주세요."); });
      rpc("log_wrongs_kr", { p_room: currentRoom.code, p_region: REGION, p_name: userName, p_hls: lastWrong.map(function (q) { return q.hl; }) }).catch(function () {});
    }
  }
  function setRankStatus(m) { var el = $("rankStatus"); if (el) el.textContent = m; }
  function showStanding(my) {
    if (!currentRoom) return;
    fetch(SUPABASE_URL + "/rest/v1/scores_kr?room=eq." + encodeURIComponent(currentRoom.code) + "&region=eq." + encodeURIComponent(REGION) + "&select=score", { headers: HDR })
      .then(function (r) { return r.json(); }).then(function (rows) { if (!Array.isArray(rows) || !rows.length) return; var rank = rows.filter(function (r) { return r.score > my; }).length + 1; var el = $("standing"); if (el) el.innerHTML = '🏫 우리 반 ' + esc(REGION) + '에서 <b>' + rank + '등</b> / ' + rows.length + '명!'; }).catch(function () {});
  }

  /* ---------- 랭킹 ---------- */
  function openRank(from) { rankReturnTo = from || "start"; $("rankResetBtn").classList.toggle("hidden", !currentRoom); showOnly("rankScreen"); window.scrollTo({ top: 0 }); loadLeaderboard(); }
  function closeRank() { showOnly(rankReturnTo === "result" ? "resultScreen" : "startScreen"); window.scrollTo({ top: 0 }); }
  function loadLeaderboard() {
    var list = $("rankList");
    if (!currentRoom) { list.innerHTML = '<div class="rank-empty">학급 방에 입장하면 순위가 나타나요.</div>'; $("hardWords").innerHTML = ""; return; }
    list.innerHTML = '<div class="rank-empty">⏳ 불러오는 중…</div>';
    fetch(SUPABASE_URL + "/rest/v1/scores_kr?room=eq." + encodeURIComponent(currentRoom.code) + "&region=eq." + encodeURIComponent(REGION) + "&select=name,score,pct,secs,attempt&order=score.desc,secs.asc&limit=50", { headers: HDR })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(renderRank).catch(function () { list.innerHTML = '<div class="rank-empty">⚠️ 불러오지 못했어요.</div>'; });
    loadHardest();
  }
  function renderRank(rows) {
    var list = $("rankList");
    if (!Array.isArray(rows) || !rows.length) { list.innerHTML = '<div class="rank-empty">아직 등록된 점수가 없어요. 첫 주인공이 되어 보세요! 🙂</div>'; return; }
    var me = false;
    list.innerHTML = rows.map(function (r, i) {
      var rank = i + 1, isMe = !me && userName && r.name === userName; if (isMe) me = true;
      var medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
      return '<div class="rank-row ' + (isMe ? "me" : "") + ' ' + (rank <= 3 ? "top" + rank : "") + '"><span class="rank-no">' + medal + '</span><span class="rank-name">' + esc(r.name) + (isMe ? " (나)" : "") + '</span><span class="rank-score">🏆 ' + r.score + '</span><span class="rank-meta">' + r.pct + '% · ' + fmtTime((r.secs || 0) * 1000) + (r.attempt >= 2 ? ' · ' + r.attempt + '회차' : '') + '</span></div>';
    }).join("");
  }
  function loadHardest() {
    var box = $("hardWords"); if (!currentRoom) { box.innerHTML = ""; return; }
    rpc("hardest_kr", { p_room: currentRoom.code, p_region: REGION }).then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="hard-title">🧗 우리 반이 어려워한 방언 TOP</div><div class="hard-chips">' + rows.map(function (r) { return '<span class="hard-chip">' + esc(r.hl) + ' <b>' + r.cnt + '명</b></span>'; }).join("") + '</div>';
    }).catch(function () { box.innerHTML = ""; });
  }

  /* ---------- 점수 초기화 ---------- */
  function openResetModal() { $("resetPw").value = ""; $("resetStatus").textContent = ""; $("resetModal").classList.remove("hidden"); }
  function doResetRoom() {
    if (!currentRoom) return; var pw = $("resetPw").value.trim(); if (!pw) { $("resetStatus").textContent = "비밀번호를 입력하세요."; return; }
    $("resetStatus").textContent = "⏳ 처리 중…";
    rpc("reset_room_kr", { p_code: currentRoom.code, p_password: pw }).then(function (n) { if (n === -1) { $("resetStatus").textContent = "비밀번호가 틀렸어요."; return; } $("resetModal").classList.add("hidden"); loadLeaderboard(); }).catch(function () { $("resetStatus").textContent = "실패했어요. 다시 시도해 주세요."; });
  }

  /* ---------- 배운 점 게시판 ---------- */
  function openLearn(from) { learnReturnTo = from || "start"; $("learnWriteForm").classList.add("hidden"); $("learnWriteBtn").classList.remove("hidden"); showOnly("learnScreen"); window.scrollTo({ top: 0 }); loadReflections(); }
  function closeLearn() { showOnly(learnReturnTo === "result" ? "resultScreen" : "startScreen"); window.scrollTo({ top: 0 }); }
  function toggleLearnWrite() { var f = $("learnWriteForm"), b = $("learnWriteBtn"); if (f.classList.contains("hidden")) { $("learnName").value = userName || ""; $("learnText").value = ""; $("learnWriteStatus").textContent = ""; f.classList.remove("hidden"); b.classList.add("hidden"); } else { f.classList.add("hidden"); b.classList.remove("hidden"); } }
  function postReflection(name, text) { return fetch(SUPABASE_URL + "/rest/v1/reflections_kr", { method: "POST", headers: HDRJ, body: JSON.stringify({ room: currentRoom.code, region: REGION, name: name, text: text }) }).then(function (r) { return r.ok; }).catch(function () { return false; }); }
  function submitMemo() {
    var ta = $("memoInput"); if (!ta || !currentRoom) return; var text = ta.value.trim(); var st = $("memoStatus");
    if (!text) { if (st) st.textContent = "내용을 입력해 주세요."; return; }
    if (st) st.textContent = "⏳ 올리는 중…";
    postReflection(userName, text).then(function (ok) {
      if (!ok) { if (st) st.textContent = "⚠️ 올리기 실패 — 다시 시도해 주세요."; return; }
      ta.disabled = true; var mb = $("memoBtn"); if (mb) { mb.disabled = true; mb.style.opacity = ".55"; mb.textContent = "✅ 올렸어요!"; }
      if (st) st.textContent = "✅ 게시판에 올렸어요! ‘우리 반 배운 점 보기’로 확인하세요.";
    });
  }
  function submitLearn() {
    var name = $("learnName").value.trim(), text = $("learnText").value.trim(), st = $("learnWriteStatus");
    if (!name) { st.textContent = "이름을 입력해 주세요."; return; }
    if (!text) { st.textContent = "내용을 입력해 주세요."; return; }
    if (!currentRoom) { st.textContent = "방에 입장한 상태에서만 올릴 수 있어요."; return; }
    st.textContent = "⏳ 올리는 중…";
    postReflection(name, text).then(function (ok) { if (!ok) { st.textContent = "⚠️ 올리기 실패 — 다시 시도해 주세요."; return; } if (!userName) userName = name; toggleLearnWrite(); loadReflections(); });
  }
  function loadReflections() {
    var list = $("learnList");
    if (!currentRoom) { list.innerHTML = '<div class="rank-empty">학급 방에 입장하면 글을 볼 수 있어요.</div>'; return; }
    list.innerHTML = '<div class="rank-empty">⏳ 불러오는 중…</div>';
    fetch(SUPABASE_URL + "/rest/v1/reflections_kr?room=eq." + encodeURIComponent(currentRoom.code) + "&region=eq." + encodeURIComponent(REGION) + "&select=id,name,text,likes,created_at&order=created_at.desc&limit=300", { headers: HDR })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(renderReflections).catch(function () { list.innerHTML = '<div class="rank-empty">⚠️ 불러오지 못했어요.</div>'; });
  }
  function isLiked(id) { try { return JSON.parse(localStorage.getItem("krLikes") || "[]").indexOf(id) >= 0; } catch (e) { return false; } }
  function addLiked(id) { try { var a = JSON.parse(localStorage.getItem("krLikes") || "[]"); if (a.indexOf(id) < 0) { a.push(id); localStorage.setItem("krLikes", JSON.stringify(a)); } } catch (e) {} }
  function renderReflections(rows) {
    var list = $("learnList");
    if (!Array.isArray(rows) || !rows.length) { list.innerHTML = '<div class="rank-empty">아직 올라온 글이 없어요. 첫 글을 남겨보세요! 🙂</div>'; return; }
    list.innerHTML = '<div class="list-count">총 ' + rows.length + '개의 글</div>' + rows.map(function (r) {
      var liked = isLiked(r.id);
      return '<div class="memo-post"><div class="memo-post-head"><span class="memo-post-name">🙋 ' + esc(r.name) + '</span><button class="like-btn ' + (liked ? "liked" : "") + '" ' + (liked ? "disabled" : "") + ' data-id="' + r.id + '">❤️ <span>' + (r.likes || 0) + '</span></button></div><div class="memo-post-text">' + esc(r.text) + '</div></div>';
    }).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".like-btn"), function (b) { b.onclick = function () { likeReflection(+b.getAttribute("data-id"), b); }; });
  }
  function likeReflection(id, btn) { if (isLiked(id)) return; addLiked(id); if (btn) { btn.disabled = true; btn.classList.add("liked"); } rpc("like_reflection_kr", { p_id: id }).then(function (n) { if (btn && typeof n === "number") { var s = btn.querySelector("span"); if (s) s.textContent = n; } }).catch(function () {}); }

  /* ---------- 콤보 연출 ---------- */
  function showCombo(n) {
    var el = document.getElementById("comboPop");
    if (!el) { el = document.createElement("div"); el.id = "comboPop"; document.body.appendChild(el); }
    var big = n >= 5 ? " big" : "";
    el.className = ""; el.textContent = "🔥 " + n + " 콤보!";
    void el.offsetWidth; el.className = "show" + big;
    clearTimeout(el._t); el._t = setTimeout(function () { el.className = ""; }, 900);
  }

  /* ---------- 방언 도감 ---------- */
  function dexKey() { return "krDex_" + REGION; }
  function getDex() { try { return JSON.parse(localStorage.getItem(dexKey()) || "[]"); } catch (e) { return []; } }
  function addDex(hls) { try { var a = getDex(), ch = false; hls.forEach(function (h) { if (a.indexOf(h) < 0) { a.push(h); ch = true; } }); if (ch) localStorage.setItem(dexKey(), JSON.stringify(a)); } catch (e) {} if (getDex().length >= dexTotal() && dexTotal() > 0) earnBadge("dexmaster"); }
  function dexTotal() { var seen = {}, n = 0; BANK.forEach(function (q) { if (!seen[q.hl]) { seen[q.hl] = 1; n++; } }); return n; }
  function updateDexBtn() { var b = document.getElementById("startDexBtn"); if (!b) return; var got = getDex().length, tot = dexTotal(); b.textContent = "📖 방언 도감 (" + Math.min(got, tot) + "/" + tot + ")"; }
  function openDex() {
    var got = getDex(), seen = {}, cards = "", n = 0, total = dexTotal();
    BANK.forEach(function (q) {
      if (seen[q.hl]) return; seen[q.hl] = 1;
      var has = got.indexOf(q.hl) >= 0; if (has) n++;
      cards += has
        ? '<div class="dex-card got"><div class="dex-word">' + esc(q.hl) + '</div><div class="dex-mean">' + esc(q.options[q.answer]) + '</div></div>'
        : '<div class="dex-card lock"><div class="dex-word">🔒</div><div class="dex-mean">???</div></div>';
    });
    var pct = total ? Math.round(n / total * 100) : 0;
    var done = (n >= total && total > 0) ? '<div class="dex-done">🎉 ' + esc(REGION) + ' 방언 도감 완성! 축하해요!</div>' : '';
    $("dexScreen").innerHTML =
      '<div class="rank-head"><div><h2 class="rank-title">📖 ' + esc(REGION) + ' 방언 도감</h2><div class="rank-sub">맞힌 방언이 카드로 수집돼요</div></div></div>' +
      '<div class="dex-rate">수집 ' + n + ' / ' + total + ' · ' + pct + '%</div>' +
      '<div class="dex-bar"><div style="width:' + pct + '%"></div></div>' + done +
      '<div class="dex-grid">' + cards + '</div>' +
      '<button class="btn" id="dexBack" style="margin-top:18px">← 돌아가기</button>';
    showOnly("dexScreen"); window.scrollTo({ top: 0 });
    $("dexBack").onclick = function () { showOnly("startScreen"); window.scrollTo({ top: 0 }); };
  }

  /* ---------- 도전 모드 (타임어택) ---------- */
  function startChallenge() {
    var v = $("nameBox").classList.contains("hidden") ? userName : $("nameInput").value.trim();
    if (!v) { $("nameErr").textContent = "이름을 입력해야 시작할 수 있어요!"; $("nameInput").focus(); return; }
    userName = v; try { localStorage.setItem("krName", v); } catch (e) {}
    clearAdvance(); stopTimer();
    var big = []; for (var k = 0; k < 6; k++) big = big.concat(buildShuffled(BANK));
    QUESTIONS = big; answers = new Array(big.length).fill(null); answerTimeMs = new Array(big.length).fill(null);
    current = 0; lastShownIndex = -1; combo = 0; bestCombo = 0; comboBonus = 0; challengeMode = true;
    $("whoLabel").textContent = "🙋 " + userName + " · ⏱️ 도전 모드";
    $("quizScreen").classList.add("challenge");
    showOnly("quizScreen"); render(); window.scrollTo({ top: 0, behavior: "smooth" });
    challengeEndsAt = Date.now() + 60000;
    updateChallengeTimer();
    challengeTimer = setInterval(updateChallengeTimer, 200);
  }
  function updateChallengeTimer() {
    var left = Math.max(0, challengeEndsAt - Date.now());
    var sec = Math.ceil(left / 1000);
    var t = $("timer"); if (t) { t.textContent = "⏱ " + sec + "초"; t.className = "timer" + (sec <= 10 ? " danger" : ""); }
    var cs = 0; for (var i = 0; i < QUESTIONS.length; i++) { if (answers[i] != null && answers[i] === QUESTIONS[i].answer) cs++; }
    var c = $("countLabel"); if (c) c.textContent = "✅ " + cs + " · 🔥 " + combo;
    if (left <= 0) finishChallenge();
  }
  function finishChallenge() {
    if (challengeTimer) { clearInterval(challengeTimer); challengeTimer = null; }
    clearAdvance(); playSound("timeup");
    var correct = 0, gained = [];
    for (var i = 0; i < QUESTIONS.length; i++) { if (answers[i] != null && answers[i] === QUESTIONS[i].answer) { correct++; gained.push(QUESTIONS[i].hl); } }
    addDex(gained); updateDexBtn();
    markPlayed(REGION); earnBadge("first"); if (correct >= 20) earnBadge("speed"); if (bestCombo >= 10) earnBadge("combo10"); updateBadgeBtn();
    var score = correct * 10 + comboBonus;
    var bestK = "krChBest_" + REGION, prev = 0; try { prev = +localStorage.getItem(bestK) || 0; } catch (e) {}
    var isNew = score > prev; if (isNew) { try { localStorage.setItem(bestK, String(score)); } catch (e) {} }
    challengeMode = false; $("quizScreen").classList.remove("challenge");
    var grade = correct >= 25 ? "⚡ 방언 스피드왕! 🏆" : correct >= 18 ? "🌟 대단해요!" : correct >= 10 ? "👍 좋아요!" : "💪 다시 도전!";
    showOnly("resultScreen");
    $("resultScreen").innerHTML =
      '<div class="score-hero"><span class="emoji">⏱️</span><h2>' + esc(userName) + ' 님 · 도전 모드 결과</h2>' +
      '<div class="ch-big">✅ ' + correct + ' <span>문제 정답</span></div>' +
      '<div class="grade">' + grade + '</div>' + (isNew ? '<div class="newrecord">🎉 도전 최고 기록 경신!</div>' : '') + (bestCombo >= 2 ? '<div class="combo-note">🔥 최고 ' + bestCombo + '연속!</div>' : '') + '</div>' +
      '<div class="stat-row"><div class="stat"><div class="v">🏆 ' + score + '</div><div class="l">총점</div></div><div class="stat"><div class="v">🔥 +' + comboBonus + '</div><div class="l">콤보 보너스</div></div><div class="stat"><div class="v">🏅 ' + Math.max(score, prev) + '</div><div class="l">도전 최고</div></div></div>' +
      '<div class="ch-note">⏱️ 도전 모드 점수는 개인 기록이에요. (우리 반 랭킹은 일반 모드로 겨뤄요!)</div>' +
      '<div class="result-actions"><button class="btn alt" id="chRetryBtn">⏱️ 다시 도전</button><button class="btn ghost" id="chHomeBtn">🏠 처음으로</button><button class="btn ghost" id="chDexBtn">📖 방언 도감</button></div>';
    $("chRetryBtn").onclick = startChallenge;
    $("chHomeBtn").onclick = function () { showOnly("startScreen"); updateDexBtn(); window.scrollTo({ top: 0 }); };
    $("chDexBtn").onclick = openDex;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (correct >= 18) { playSound("fanfare"); runConfetti(); }
  }

  /* ---------- 추가 스타일 주입 ---------- */
  function injectCSS() {
    if (document.getElementById("dialectExtraCss")) return;
    var st = document.createElement("style"); st.id = "dialectExtraCss";
    st.textContent = [
      "#comboPop{position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);z-index:3000;pointer-events:none;font-weight:900;font-size:34px;color:#fff;background:linear-gradient(135deg,#f76707,#e8590c);padding:12px 26px;border-radius:16px;box-shadow:0 10px 30px rgba(230,80,0,.45);opacity:0;text-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;}",
      "#comboPop.show{animation:comboPop .9s ease-out;}",
      "#comboPop.show.big{font-size:44px;background:linear-gradient(135deg,#f03e3e,#d6336c);}",
      "@keyframes comboPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(-8deg);}20%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(3deg);}45%{transform:translate(-50%,-50%) scale(1) rotate(0);}80%{opacity:1;}100%{opacity:0;transform:translate(-50%,-80%) scale(1);}}",
      ".timer.danger{color:#e03131;font-weight:900;animation:tblink 1s steps(2) infinite;}@keyframes tblink{50%{opacity:.35;}}",
      "#quizScreen.challenge .nav-grid,#quizScreen.challenge .progress,#quizScreen.challenge .footer-nav,#quizScreen.challenge #submitBtn{display:none!important;}",
      ".ch-big{font-size:40px;font-weight:900;color:var(--head);margin:10px 0 4px;}.ch-big span{font-size:18px;font-weight:700;color:var(--gray);}",
      ".ch-note{text-align:center;font-size:13px;color:var(--gray);background:var(--soft,rgba(0,0,0,.05));border-radius:10px;padding:8px 12px;margin:6px 0 4px;word-break:keep-all;}",
      ".dex-rate{text-align:center;font-weight:800;color:var(--head);margin:6px 0 8px;}",
      ".dex-bar{height:12px;border-radius:99px;background:rgba(0,0,0,.08);overflow:hidden;margin-bottom:14px;}.dex-bar>div{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:99px;transition:width .4s;}",
      ".dex-done{text-align:center;font-weight:900;color:var(--accent2);margin:4px 0 12px;}",
      ".dex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;}",
      ".dex-card{border-radius:14px;padding:14px 10px;text-align:center;border:2px solid var(--line);min-height:78px;display:flex;flex-direction:column;justify-content:center;gap:4px;}",
      ".dex-card.got{background:linear-gradient(135deg,rgba(255,146,43,.16),rgba(255,255,255,.02));border-color:var(--accent);}",
      ".dex-card.lock{opacity:.5;}",
      ".dex-card .dex-word{font-size:19px;font-weight:900;color:var(--head);}",
      ".dex-card .dex-mean{font-size:12.5px;color:var(--gray);word-break:keep-all;line-height:1.4;}",
      "#quizScreen.survival .nav-grid,#quizScreen.survival .progress,#quizScreen.survival .footer-nav,#quizScreen.survival #submitBtn{display:none!important;}",
      ".mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px;}",
      ".mode-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:15px 6px;border:1.5px solid var(--line);background:var(--paper);border-radius:16px;cursor:pointer;font-family:inherit;transition:transform .14s,border-color .18s,box-shadow .2s;}",
      ".mode-btn:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:var(--shadow-sm);}",
      ".mode-btn .me{font-size:26px;line-height:1;}",
      ".mode-btn .mt{font-weight:800;font-size:14px;color:var(--head);margin-top:4px;}",
      ".mode-btn .ms{font-size:11px;color:var(--gray);}",
      ".side-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}.side-grid .btn{margin-top:0;}",
      "@media(max-width:520px){.mode-grid{gap:7px;}.mode-btn{padding:13px 4px;}.mode-btn .mt{font-size:12.5px;}.mode-btn .ms{font-size:10px;}}",
      ".badge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:11px;}",
      ".badge-card{text-align:center;padding:16px 10px;border:1.5px solid var(--line);border-radius:16px;background:var(--paper);}",
      ".badge-card.got{border-color:var(--accent2);background:linear-gradient(135deg,rgba(255,193,7,.14),transparent);}",
      ".badge-card.lock{opacity:.5;}",
      ".badge-emoji{font-size:34px;line-height:1;}",
      ".badge-name{font-weight:800;color:var(--head);font-size:14px;margin-top:6px;}",
      ".badge-desc{font-size:11.5px;color:var(--gray);margin-top:3px;word-break:keep-all;line-height:1.4;}",
      ".match-hud{display:flex;justify-content:center;gap:18px;font-weight:800;color:var(--head);margin:6px 0 14px;font-size:15px;font-variant-numeric:tabular-nums;}",
      ".match-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;}",
      ".match-card{aspect-ratio:3/4;border:1.5px solid var(--line);border-radius:13px;background:var(--soft);cursor:pointer;font-family:inherit;display:grid;place-items:center;padding:6px;font-weight:800;transition:transform .14s,border-color .18s,background .18s;text-align:center;word-break:keep-all;line-height:1.3;}",
      ".match-card:hover:not([disabled]){transform:translateY(-2px);border-color:var(--accent);}",
      ".match-card .mc-back{font-size:26px;color:var(--gray);}",
      ".match-card.flip{background:var(--paper);border-color:var(--accent);}",
      ".match-card.done{background:linear-gradient(135deg,rgba(47,158,68,.16),transparent);border-color:var(--green);cursor:default;opacity:.9;}",
      ".match-card .mc-d{color:var(--accent);font-size:16px;}",
      ".match-card .mc-m{color:var(--head);font-size:13.5px;}",
      "@media(max-width:520px){.match-grid{gap:7px;}.match-card .mc-d{font-size:14px;}.match-card .mc-m{font-size:12px;}}",
      "#krToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:3200;background:var(--head);color:var(--paper);font-weight:800;font-size:14px;padding:12px 20px;border-radius:99px;box-shadow:0 10px 30px rgba(0,0,0,.3);opacity:0;pointer-events:none;transition:opacity .3s,transform .3s;max-width:90vw;text-align:center;}",
      "#krToast.show{opacity:1;transform:translateX(-50%) translateY(0);}"
    ].join("");
    document.head.appendChild(st);
  }

  /* ---------- 토스트 알림 ---------- */
  function toast(msg) {
    var el = document.getElementById("krToast");
    if (!el) { el = document.createElement("div"); el.id = "krToast"; document.body.appendChild(el); }
    el.textContent = msg; el.className = "";
    void el.offsetWidth; el.className = "show";
    clearTimeout(el._t); el._t = setTimeout(function () { el.className = ""; }, 2600);
  }

  /* ---------- 배지 · 업적 ---------- */
  var BADGES = [
    { id: "first", e: "🎯", n: "첫 도전", d: "퀴즈를 처음 완료했어요" },
    { id: "perfect", e: "💯", n: "만점왕", d: "정확도 100% 달성" },
    { id: "combo10", e: "🔥", n: "콤보왕", d: "한 판에서 10연속 정답" },
    { id: "speed", e: "⚡", n: "스피드왕", d: "도전 모드 20문제 이상" },
    { id: "dexmaster", e: "📖", n: "도감 마스터", d: "한 지역 도감 완성" },
    { id: "survivor", e: "💥", n: "생존왕", d: "골든벨 15문제 이상 생존" },
    { id: "matcher", e: "🃏", n: "짝맞추기 달인", d: "실수 없이 짝맞추기 클리어" },
    { id: "traveler", e: "🧭", n: "방언 여행가", d: "5개 지역을 모두 플레이" }
  ];
  function getBadges() { try { return JSON.parse(localStorage.getItem("krBadges") || "[]"); } catch (e) { return []; } }
  function hasBadge(id) { return getBadges().indexOf(id) >= 0; }
  function earnBadge(id) {
    if (hasBadge(id)) return;
    try { var a = getBadges(); a.push(id); localStorage.setItem("krBadges", JSON.stringify(a)); } catch (e) {}
    var b = null; BADGES.forEach(function (x) { if (x.id === id) b = x; });
    if (b) toast("🏅 새 배지 획득! " + b.e + " " + b.n);
    updateBadgeBtn();
  }
  function markPlayed(region) {
    try {
      var a = JSON.parse(localStorage.getItem("krPlayed") || "[]");
      if (a.indexOf(region) < 0) { a.push(region); localStorage.setItem("krPlayed", JSON.stringify(a)); }
      if (a.length >= 5) earnBadge("traveler");
    } catch (e) {}
  }
  function updateBadgeBtn() { var b = document.getElementById("startBadgeBtn"); if (!b) return; b.textContent = "🏅 내 배지 (" + getBadges().length + "/" + BADGES.length + ")"; }
  function openBadges() {
    var cards = BADGES.map(function (bd) {
      var got = hasBadge(bd.id);
      return '<div class="badge-card ' + (got ? "got" : "lock") + '"><div class="badge-emoji">' + (got ? bd.e : "🔒") + '</div><div class="badge-name">' + esc(got ? bd.n : "???") + '</div><div class="badge-desc">' + esc(bd.d) + '</div></div>';
    }).join("");
    $("badgeScreen").innerHTML =
      '<div class="rank-head"><div><h2 class="rank-title">🏅 내 배지</h2><div class="rank-sub">활동하며 배지를 모아 보세요</div></div></div>' +
      '<div class="dex-rate">획득 ' + getBadges().length + ' / ' + BADGES.length + '</div>' +
      '<div class="badge-grid">' + cards + '</div>' +
      '<button class="btn" id="badgeBack" style="margin-top:20px">← 돌아가기</button>';
    showOnly("badgeScreen"); window.scrollTo({ top: 0 });
    $("badgeBack").onclick = function () { showOnly("startScreen"); window.scrollTo({ top: 0 }); };
  }

  /* ---------- 골든벨 생존 모드 ---------- */
  function startSurvival() {
    var v = $("nameBox").classList.contains("hidden") ? userName : $("nameInput").value.trim();
    if (!v) { $("nameErr").textContent = "이름을 입력해야 시작할 수 있어요!"; $("nameInput").focus(); return; }
    userName = v; try { localStorage.setItem("krName", v); } catch (e) {}
    clearAdvance(); stopTimer();
    var big = []; for (var k = 0; k < 6; k++) big = big.concat(buildShuffled(BANK));
    QUESTIONS = big; answers = new Array(big.length).fill(null); answerTimeMs = new Array(big.length).fill(null);
    current = 0; lastShownIndex = -1; combo = 0; bestCombo = 0; comboBonus = 0;
    survivalMode = true; survivalLives = 3;
    $("whoLabel").textContent = "🙋 " + userName + " · 💥 골든벨 생존";
    $("quizScreen").classList.add("challenge"); $("quizScreen").classList.add("survival");
    showOnly("quizScreen"); render(); updateSurvivalHud(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function updateSurvivalHud() {
    var lives = survivalLives < 0 ? 0 : survivalLives;
    var t = $("timer"); if (t) { t.textContent = "❤️".repeat(lives) + "🖤".repeat(3 - lives); t.className = "timer"; }
    var correct = 0; for (var i = 0; i < QUESTIONS.length; i++) { if (answers[i] != null && answers[i] === QUESTIONS[i].answer) correct++; }
    var c = $("countLabel"); if (c) c.textContent = "🔥 " + correct + " 생존";
  }
  function finishSurvival() {
    clearAdvance();
    var correct = 0, gained = [];
    for (var i = 0; i < QUESTIONS.length; i++) { if (answers[i] != null && answers[i] === QUESTIONS[i].answer) { correct++; gained.push(QUESTIONS[i].hl); } }
    addDex(gained); updateDexBtn();
    var bestK = "krSurvBest_" + REGION, prev = 0; try { prev = +localStorage.getItem(bestK) || 0; } catch (e) {}
    var isNew = correct > prev; if (isNew) { try { localStorage.setItem(bestK, String(correct)); } catch (e) {} }
    survivalMode = false; $("quizScreen").classList.remove("challenge"); $("quizScreen").classList.remove("survival");
    markPlayed(REGION); earnBadge("first"); if (correct >= 15) earnBadge("survivor"); if (bestCombo >= 10) earnBadge("combo10"); updateBadgeBtn();
    var grade = correct >= 20 ? "🏆 골든벨 챔피언!" : correct >= 12 ? "🌟 방언 생존왕!" : correct >= 6 ? "👍 잘 버텼어요!" : "💪 다시 도전!";
    showOnly("resultScreen");
    $("resultScreen").innerHTML =
      '<div class="score-hero"><span class="emoji">💥</span><h2>' + esc(userName) + ' 님 · 골든벨 생존 결과</h2>' +
      '<div class="ch-big">🔥 ' + correct + ' <span>문제 생존</span></div>' +
      '<div class="grade">' + grade + '</div>' + (isNew ? '<div class="newrecord">🎉 최고 기록 경신!</div>' : '') + (bestCombo >= 2 ? '<div class="combo-note">🔥 최고 ' + bestCombo + '연속!</div>' : '') + '</div>' +
      '<div class="stat-row"><div class="stat"><div class="v">🔥 ' + correct + '</div><div class="l">문제 생존</div></div><div class="stat"><div class="v">🏅 ' + Math.max(correct, prev) + '</div><div class="l">최고 기록</div></div></div>' +
      '<div class="ch-note">💥 골든벨은 개인 기록이에요. 틀리지 않고 오래 버텨 보세요!</div>' +
      '<div class="result-actions"><button class="btn alt" id="svRetryBtn">💥 다시 도전</button><button class="btn ghost" id="svHomeBtn">🏠 처음으로</button></div>';
    $("svRetryBtn").onclick = startSurvival;
    $("svHomeBtn").onclick = function () { showOnly("startScreen"); updateDexBtn(); updateBadgeBtn(); window.scrollTo({ top: 0 }); };
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (correct >= 12) { playSound("fanfare"); runConfetti(); }
  }

  /* ---------- 방언 짝맞추기(기억력 게임) ---------- */
  function startMatch() {
    var seen = {}, pool = [];
    BANK.forEach(function (q) { if (!seen[q.hl]) { seen[q.hl] = 1; pool.push(q); } });
    pool = shuffle(pool.slice()).slice(0, 6);
    var cards = [];
    pool.forEach(function (q, idx) {
      cards.push({ pair: idx, type: "d", text: q.hl });
      cards.push({ pair: idx, type: "m", text: q.options[q.answer] });
    });
    cards = shuffle(cards);
    matchState = { cards: cards, flipped: [], matched: 0, moves: 0, lock: false, start: Date.now(), pairs: pool.length };
    renderMatch();
    showOnly("matchScreen"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderMatch() {
    var s = matchState;
    var grid = s.cards.map(function (c, i) {
      var up = c.done || s.flipped.indexOf(i) >= 0;
      var inner = up ? ('<span class="' + (c.type === "d" ? "mc-d" : "mc-m") + '">' + esc(c.text) + '</span>') : '<span class="mc-back">?</span>';
      return '<button class="match-card ' + (c.done ? "done" : (up ? "flip" : "")) + '" data-i="' + i + '"' + (c.done ? " disabled" : "") + '>' + inner + '</button>';
    }).join("");
    $("matchScreen").innerHTML =
      '<div class="rank-head"><div><h2 class="rank-title">🃏 방언 짝맞추기</h2><div class="rank-sub">방언과 뜻 카드를 짝지어 보세요</div></div></div>' +
      '<div class="match-hud"><span>🔄 ' + s.moves + '번</span><span>✅ ' + s.matched + ' / ' + s.pairs + '</span></div>' +
      '<div class="match-grid">' + grid + '</div>' +
      '<div class="result-actions" style="margin-top:18px"><button class="btn alt" id="matchRetry">🔄 새 카드</button><button class="btn ghost" id="matchBack">← 돌아가기</button></div>';
    Array.prototype.forEach.call($("matchScreen").querySelectorAll(".match-card"), function (b) { b.onclick = function () { flipMatch(+b.getAttribute("data-i")); }; });
    $("matchRetry").onclick = startMatch;
    $("matchBack").onclick = function () { showOnly("startScreen"); window.scrollTo({ top: 0 }); };
  }
  function flipMatch(i) {
    var s = matchState; if (!s || s.lock) return;
    var c = s.cards[i]; if (c.done || s.flipped.indexOf(i) >= 0) return;
    s.flipped.push(i); playSound("click"); renderMatch();
    if (s.flipped.length === 2) {
      s.moves++; s.lock = true;
      var a = s.cards[s.flipped[0]], b = s.cards[s.flipped[1]];
      if (a.pair === b.pair) {
        a.done = true; b.done = true; s.matched++; s.flipped = []; s.lock = false;
        playSound("correct"); renderMatch();
        if (s.matched === s.pairs) finishMatch();
      } else {
        playSound("wrong");
        setTimeout(function () { s.flipped = []; s.lock = false; renderMatch(); }, 850);
      }
    }
  }
  function finishMatch() {
    var s = matchState;
    var secs = Math.round((Date.now() - s.start) / 1000);
    var perfect = s.moves === s.pairs;
    markPlayed(REGION); earnBadge("first"); if (perfect) earnBadge("matcher"); updateBadgeBtn();
    var bestK = "krMatchBest_" + REGION, prev = 0; try { prev = +localStorage.getItem(bestK) || 0; } catch (e) {}
    var isNew = !prev || s.moves < prev; if (isNew) { try { localStorage.setItem(bestK, String(s.moves)); } catch (e) {} }
    playSound("fanfare"); runConfetti();
    setTimeout(function () {
      $("matchScreen").innerHTML =
        '<div class="score-hero"><span class="emoji">🃏</span><h2>짝맞추기 완성!</h2>' +
        '<div class="ch-big">🎉 ' + s.pairs + '<span> 쌍 완성</span></div>' +
        '<div class="grade">' + (perfect ? "🏆 완벽해요! 한 번도 안 틀렸어요!" : "👍 잘했어요!") + '</div>' + (isNew ? '<div class="newrecord">🎉 최소 시도 기록 경신!</div>' : '') + '</div>' +
        '<div class="stat-row"><div class="stat"><div class="v">🔄 ' + s.moves + '</div><div class="l">시도 횟수</div></div><div class="stat"><div class="v">⏱ ' + secs + '초</div><div class="l">걸린 시간</div></div><div class="stat"><div class="v">🏅 ' + Math.min(s.moves, prev || s.moves) + '</div><div class="l">최소 기록</div></div></div>' +
        '<div class="result-actions" style="margin-top:20px"><button class="btn alt" id="matchAgain">🔄 다시 하기</button><button class="btn ghost" id="matchHome">🏠 처음으로</button></div>';
      $("matchAgain").onclick = startMatch;
      $("matchHome").onclick = function () { showOnly("startScreen"); updateDexBtn(); updateBadgeBtn(); window.scrollTo({ top: 0 }); };
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 750);
  }

  /* ---------- 컨페티 ---------- */
  function runConfetti() {
    var cv = $("confetti"); cv.classList.remove("hidden"); var ctx = cv.getContext("2d"); cv.width = window.innerWidth; cv.height = window.innerHeight;
    var css = getComputedStyle(document.documentElement), a1 = css.getPropertyValue("--accent").trim() || "#e03131", a2 = css.getPropertyValue("--accent2").trim() || "#f08c00";
    var cs = [a1, a2, "#ffd166", "#43a047", "#4361ee", "#e76f51"], ps = [];
    for (var i = 0; i < 150; i++) ps.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4, r: 6 + Math.random() * 8, c: cs[Math.floor(Math.random() * cs.length)], vx: -2.5 + Math.random() * 5, vy: 2 + Math.random() * 4, rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4 });
    var f = 0; (function step() { ctx.clearRect(0, 0, cv.width, cv.height); ps.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.rot += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore(); }); f++; if (f < 200) requestAnimationFrame(step); else cv.classList.add("hidden"); })();
  }

  /* ---------- 시작 ---------- */
  build();
  var savedTheme = "light"; try { savedTheme = localStorage.getItem("dialectTheme") || "light"; } catch (e) {}
  applyTheme(savedTheme);
  refreshRoomUI();
  renderBestBadge();
  updateNameArea();
  updateDexBtn();
  updateBadgeBtn();
  detectRoomName();
})();
