/**
 * 책있나 프록시 (Google Apps Script 웹 앱)
 *
 * 하는 일
 *  - 도서관 정보나루 인증키를 앱 대신 안전하게 보관하고 API를 대신 부른다.
 *  - 같은 조회는 캐시(최대 6시간)에서 돌려줘 하루 호출 수를 아낀다.
 *  - 하루 호출 상한(DAILY_LIMIT)을 넘으면 { error: 'budget' }을 돌려준다.
 *  - (v1.1) 대출가능 알림 구독을 저장하고, GitHub Actions에 목록을 넘긴다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)에 사용자가 직접 넣는 값
 *  - D4L_AUTH_KEY : 도서관 정보나루 인증키 (필수)
 *  - DAILY_LIMIT  : 하루 최대 호출 수 (선택, 기본 450)
 *  - ADMIN_TOKEN  : GitHub Actions가 구독 목록을 받을 때 쓰는 긴 임의 문자열 (v1.1)
 *
 * 개인정보: 요청한 사람을 식별하는 정보는 저장하지 않는다. 날짜별 호출 수만 센다.
 */

var API_BASE = 'https://data4library.kr/api/';
var CACHE_SECONDS = 21600; // CacheService 최대 6시간
var DEFAULT_LIMIT = 450;
var REGIONS = ['11', '21', '22', '23', '24', '25', '26', '29', '31', '32', '33', '34', '35', '36', '37', '38', '39'];
var SORTS = { loan: 'desc', pubYear: 'desc', title: 'asc' };

// ---------- 진입점 ----------

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    switch (p.op) {
      case 'health':
        return json_(health_());
      case 'search':
        return json_(search_(p));
      case 'detail':
        return json_(detail_(p));
      case 'holdings':
        return json_(holdings_(p));
      case 'exist':
        return json_(exist_(p));
      case 'export':
        return json_(exportSubscriptions_(p));
      default:
        return json_({ error: 'bad_request', message: '알 수 없는 요청이에요.' });
    }
  } catch (err) {
    return json_(errorBody_(err));
  }
}

// 알림 구독은 본문을 text/plain JSON으로 받는다(브라우저 사전 요청을 피하려고).
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.op === 'subscribe') return json_(subscribe_(body));
    if (body.op === 'unsubscribe') return json_(unsubscribe_(body));
    return json_({ error: 'bad_request', message: '알 수 없는 요청이에요.' });
  } catch (err) {
    return json_(errorBody_(err));
  }
}

// ---------- 조회 ----------

function search_(p) {
  var q = String(p.q || '').trim();
  if (!q || q.length > 100) throw badRequest_('검색어를 확인해 주세요.');
  var page = clampInt_(p.page, 1, 50, 1);
  var sort = SORTS[p.sort] ? p.sort : 'loan';
  var params = { pageNo: page, pageSize: 20, sort: sort, order: SORTS[sort] };
  var digits = q.replace(/[^0-9]/g, '');
  if (/^\d{13}$/.test(digits) && digits.length === q.replace(/[\s-]/g, '').length) params.isbn13 = digits;
  else params.keyword = q;
  return cachedCall_('srchBooks', params);
}

function detail_(p) {
  var isbn = isbn13_(p.isbn);
  return cachedCall_('srchDtlList', { isbn13: isbn, loaninfoYN: 'N' });
}

function holdings_(p) {
  var isbn = isbn13_(p.isbn);
  var region = String(p.region || '');
  if (REGIONS.indexOf(region) < 0) throw badRequest_('지역 코드를 확인해 주세요.');
  return cachedCall_('libSrchByBook', { isbn: isbn, region: region, pageNo: 1, pageSize: 100 });
}

// 도서관 여러 곳(최대 5곳)의 소장·대출가능 여부를 한 번에
function exist_(p) {
  var isbn = isbn13_(p.isbn);
  var libs = String(p.libs || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return /^\d{4,10}$/.test(s); });
  libs = libs.filter(function (s, i) { return libs.indexOf(s) === i; }).slice(0, 5);
  if (!libs.length) throw badRequest_('도서관 코드를 확인해 주세요.');

  var cache = CacheService.getScriptCache();
  var results = {};
  var missing = [];
  libs.forEach(function (code) {
    var hit = cache.get(cacheKey_('bookExist', { libCode: code, isbn13: isbn }));
    if (hit) results[code] = JSON.parse(hit);
    else missing.push(code);
  });
  if (missing.length) {
    try {
      spend_(missing.length);
    } catch (err) {
      // 한도를 다 썼어도 캐시에 있던 도서관 결과는 돌려준다. 하나도 없으면 그대로 budget 오류.
      if (err.code !== 'budget' || missing.length === libs.length) throw err;
      missing.forEach(function (code) { results[code] = { error: 'budget' }; });
      count_('exist');
      return { results: results, budget: true };
    }
    var key = authKey_();
    var requests = missing.map(function (code) {
      return { url: apiUrl_('bookExist', { libCode: code, isbn13: isbn }, key), muteHttpExceptions: true };
    });
    var responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (res, i) {
      var code = missing[i];
      var parsed = parseResponse_(res);
      if (parsed.ok) {
        results[code] = parsed.data;
        cache.put(cacheKey_('bookExist', { libCode: code, isbn13: isbn }), JSON.stringify(parsed.data), CACHE_SECONDS);
      } else {
        results[code] = { error: 'upstream' };
      }
    });
  }
  count_('exist');
  return { results: results };
}

function health_() {
  var props = PropertiesService.getScriptProperties();
  var today = today_();
  var yesterday = Utilities.formatDate(new Date(Date.now() - 24 * 3600 * 1000), 'Asia/Seoul', 'yyyy-MM-dd');
  return {
    ok: true,
    date: today,
    keyConfigured: Boolean(props.getProperty('D4L_AUTH_KEY')),
    used: Number(props.getProperty('usage:' + today) || 0),
    limit: limit_(),
    stats: JSON.parse(props.getProperty('stats:' + today) || '{}'),
    // 아침 점검 때는 오늘 기록이 거의 없으니 어제 하루치도 함께 돌려준다.
    yesterday: {
      date: yesterday,
      used: Number(props.getProperty('usage:' + yesterday) || 0),
      stats: JSON.parse(props.getProperty('stats:' + yesterday) || '{}'),
    },
    subscriptions: listSubscriptionKeys_().length,
  };
}

// ---------- 정보나루 호출과 캐시 ----------

function cachedCall_(endpoint, params) {
  var cache = CacheService.getScriptCache();
  var key = cacheKey_(endpoint, params);
  var hit = cache.get(key);
  count_(endpoint);
  if (hit) return JSON.parse(hit);
  spend_(1);
  var res = UrlFetchApp.fetch(apiUrl_(endpoint, params, authKey_()), { muteHttpExceptions: true });
  var parsed = parseResponse_(res);
  if (!parsed.ok) throw upstream_();
  var text = JSON.stringify(parsed.data);
  if (text.length < 90000) cache.put(key, text, CACHE_SECONDS);
  return parsed.data;
}

function apiUrl_(endpoint, params, key) {
  var parts = ['authKey=' + encodeURIComponent(key), 'format=json'];
  Object.keys(params).forEach(function (k) {
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
  });
  return API_BASE + endpoint + '?' + parts.join('&');
}

function parseResponse_(res) {
  if (res.getResponseCode() !== 200) return { ok: false };
  try {
    var data = JSON.parse(res.getContentText('UTF-8'));
    if (data && data.response && data.response.error) return { ok: false };
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false };
  }
}

function cacheKey_(endpoint, params) {
  var raw = endpoint + '?' + Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('&');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
  return 'v1:' + Utilities.base64EncodeWebSafe(digest);
}

// ---------- 하루 호출 예산 ----------

function limit_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty('DAILY_LIMIT'));
  return v > 0 ? v : DEFAULT_LIMIT;
}

function spend_(n) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'usage:' + today_();
    var used = Number(props.getProperty(key) || 0);
    if (used + n > limit_()) throw budget_();
    props.setProperty(key, String(used + n));
  } finally {
    lock.releaseLock();
  }
}

// 기능별 사용 횟수(개인 식별 정보 없음) — 성과 지표용
function count_(name) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'stats:' + today_();
    var stats = JSON.parse(props.getProperty(key) || '{}');
    stats[name] = (stats[name] || 0) + 1;
    props.setProperty(key, JSON.stringify(stats));
  } catch (err) {
    /* 통계는 실패해도 조회에는 영향을 주지 않는다 */
  }
}

// 오래된 날짜별 기록 정리 (트리거로 하루 한 번 실행 권장)
function cleanupOldCounters() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var cutoff = new Date(Date.now() - 31 * 24 * 3600 * 1000);
  var cutoffStr = Utilities.formatDate(cutoff, 'Asia/Seoul', 'yyyy-MM-dd');
  Object.keys(all).forEach(function (k) {
    var m = k.match(/^(usage|stats):(\d{4}-\d{2}-\d{2})$/);
    if (m && m[2] < cutoffStr) props.deleteProperty(k);
  });
  cleanupStaleSubscriptions_();
}

// ---------- (v1.1) 대출가능 알림 구독 ----------
// 저장 내용: 푸시 주소와 키, 관심 도서 ISBN, 도서관 코드. 이름·연락처는 없다.

function subscribe_(body) {
  var sub = body.subscription || {};
  if (typeof sub.endpoint !== 'string' || sub.endpoint.indexOf('https://') !== 0 || sub.endpoint.length > 600) {
    throw badRequest_('알림 주소가 올바르지 않아요.');
  }
  if (!sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
    throw badRequest_('알림 키가 올바르지 않아요.');
  }
  var items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(function (it) {
    return {
      isbn: isbn13_(it.isbn),
      libs: (Array.isArray(it.libs) ? it.libs : []).filter(function (c) { return /^\d{4,10}$/.test(c); }).slice(0, 5),
    };
  }).filter(function (it) { return it.libs.length; });
  var record = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, items: items, updatedAt: new Date().toISOString() };
  var text = JSON.stringify(record);
  if (text.length > 8500) throw badRequest_('관심 도서가 너무 많아요.');
  PropertiesService.getScriptProperties().setProperty(subKey_(sub.endpoint), text);
  count_('subscribe');
  return { ok: true, items: items.length };
}

function unsubscribe_(body) {
  var endpoint = body.subscription && body.subscription.endpoint;
  if (typeof endpoint === 'string') PropertiesService.getScriptProperties().deleteProperty(subKey_(endpoint));
  return { ok: true };
}

function exportSubscriptions_(p) {
  var token = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!token || String(p.token || '') !== token) return { error: 'forbidden', message: '권한이 없어요.' };
  var props = PropertiesService.getScriptProperties();
  var list = listSubscriptionKeys_().map(function (k) { return JSON.parse(props.getProperty(k)); });
  return { subscriptions: list };
}

function listSubscriptionKeys_() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(function (k) {
    return k.indexOf('sub:') === 0;
  });
}

function cleanupStaleSubscriptions_() {
  var props = PropertiesService.getScriptProperties();
  var cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  listSubscriptionKeys_().forEach(function (k) {
    try {
      var rec = JSON.parse(props.getProperty(k));
      if (!rec.updatedAt || Date.parse(rec.updatedAt) < cutoff) props.deleteProperty(k);
    } catch (err) {
      props.deleteProperty(k);
    }
  });
}

function subKey_(endpoint) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, endpoint, Utilities.Charset.UTF_8);
  return 'sub:' + Utilities.base64EncodeWebSafe(digest).slice(0, 32);
}

// ---------- 도우미 ----------

function authKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('D4L_AUTH_KEY');
  if (!key) {
    var err = new Error('프록시에 인증키가 아직 없어요.');
    err.code = 'not_configured';
    throw err;
  }
  return key;
}

function isbn13_(value) {
  var v = String(value || '').replace(/[^0-9]/g, '');
  if (!/^\d{13}$/.test(v)) throw badRequest_('ISBN을 확인해 주세요.');
  return v;
}

function clampInt_(value, min, max, fallback) {
  var n = parseInt(value, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function badRequest_(message) {
  var err = new Error(message);
  err.code = 'bad_request';
  return err;
}

function budget_() {
  var err = new Error('오늘 조회 한도를 다 썼어요.');
  err.code = 'budget';
  return err;
}

function upstream_() {
  var err = new Error('도서관 정보나루가 응답하지 않아요.');
  err.code = 'upstream';
  return err;
}

function errorBody_(err) {
  var code = (err && err.code) || 'server';
  var message = code === 'server' ? '프록시에서 문제가 생겼어요.' : err.message;
  return { error: code, message: message };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 처음 설정할 때 편집기에서 한 번씩 실행하는 함수 ----------

// 매일 새벽 오래된 기록을 지우는 트리거를 만든다. 여러 번 실행해도 하나만 남는다.
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cleanupOldCounters') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupOldCounters').timeBased().everyDays(1).atHour(4).create();
  Logger.log('매일 04시 정리 트리거를 만들었어요.');
}

// 실행 → 로그에 "인증키 동작 확인"이 보이면 성공

function testSetup() {
  var key = authKey_();
  var res = UrlFetchApp.fetch(apiUrl_('libSrch', { pageNo: 1, pageSize: 1 }, key), { muteHttpExceptions: true });
  var parsed = parseResponse_(res);
  if (parsed.ok) {
    Logger.log('인증키 동작 확인: 도서관 목록 응답을 받았어요.');
  } else {
    Logger.log('응답 코드 ' + res.getResponseCode() + ' — 인증키 승인 여부와 값을 확인해 주세요.');
  }
}
