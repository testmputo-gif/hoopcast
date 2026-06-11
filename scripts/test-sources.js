/**
 * Quick test — runs right now and shows exactly what each
 * data source returns for TODAY's date.
 * Run this from GitHub Actions to diagnose fixture fetching.
 */

function todayNigeria() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const TODAY = process.argv[2] || todayNigeria();
const YESTERDAY = (() => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
})();
const TOMORROW = (() => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
})();

console.log('═══════════════════════════════════════════════════');
console.log('  HoopCast Source Tester');
console.log(`  Testing dates: ${YESTERDAY} | ${TODAY} | ${TOMORROW}`);
console.log('═══════════════════════════════════════════════════\n');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function get(url, extra = {}) {
  try {
    const r = await fetch(url, {
      headers: { ...HEADERS, ...extra },
      signal: AbortSignal.timeout(15000),
    });
    console.log(`  HTTP ${r.status} — ${url.substring(0, 90)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch(e) {
    console.log(`  ERROR — ${e.message} — ${url.substring(0, 90)}`);
    return null;
  }
}

async function testESPN(date) {
  console.log(`\n── ESPN NBA (${date}) ──`);
  const d = date.replace(/-/g,'');
  const data = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}&limit=100`);
  if (!data) { console.log('  No response'); return; }
  const events = data.events || [];
  console.log(`  Events found: ${events.length}`);
  events.forEach(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway==='home');
    const away = comp?.competitors?.find(c => c.homeAway==='away');
    console.log(`  [${e.status?.type?.name}] ${away?.team?.displayName} @ ${home?.team?.displayName} — ${home?.score||'?'}:${away?.score||'?'}`);
  });

  console.log(`\n── ESPN WNBA (${date}) ──`);
  const data2 = await get(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${d}&limit=100`);
  const events2 = data2?.events || [];
  console.log(`  Events found: ${events2.length}`);
  events2.forEach(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway==='home');
    const away = comp?.competitors?.find(c => c.homeAway==='away');
    console.log(`  [${e.status?.type?.name}] ${away?.team?.displayName} @ ${home?.team?.displayName}`);
  });
}

async function testSofascore(date) {
  console.log(`\n── Sofascore (${date}) ──`);
  const data = await get(
    `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${date}`,
    { 'Referer': 'https://www.sofascore.com/' }
  );
  if (!data) { console.log('  No response'); return; }
  const events = data.events || [];
  console.log(`  Total events: ${events.length}`);
  const byLeague = {};
  events.forEach(e => {
    const l = e.tournament?.name || 'Unknown';
    if (!byLeague[l]) byLeague[l] = [];
    byLeague[l].push(`${e.awayTeam?.name} @ ${e.homeTeam?.name} [${e.status?.type}]`);
  });
  Object.entries(byLeague).forEach(([league, games]) => {
    console.log(`\n  ${league} (${games.length} games):`);
    games.slice(0, 3).forEach(g => console.log(`    ${g}`));
    if (games.length > 3) console.log(`    ... and ${games.length - 3} more`);
  });
}

async function testSofascoreLive() {
  console.log(`\n── Sofascore LIVE right now ──`);
  const data = await get(
    'https://api.sofascore.com/api/v1/sport/basketball/events/live',
    { 'Referer': 'https://www.sofascore.com/' }
  );
  const events = data?.events || [];
  console.log(`  Live events right now: ${events.length}`);
  events.forEach(e => {
    console.log(`  ${e.tournament?.name}: ${e.awayTeam?.name} @ ${e.homeTeam?.name}`);
  });
}

async function testTheSportsDB(date) {
  console.log(`\n── TheSportsDB (${date}) ──`);
  // Test with NBA league ID
  const data = await get(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Basketball`);
  const events = data?.events || [];
  console.log(`  Events: ${events.length}`);
  events.slice(0, 5).forEach(e => {
    console.log(`  ${e.strLeague}: ${e.strAwayTeam} @ ${e.strHomeTeam} [${e.strStatus}]`);
  });
}

async function testAPIBasketball(date) {
  const key = process.env.API_BASKETBALL_KEY;
  if (!key) { console.log('\n── API-Basketball — No key set, skipping ──'); return; }
  console.log(`\n── API-Basketball (${date}) ──`);
  const data = await get(`https://v1.basketball.api-sports.io/games?date=${date}`, {
    'x-apisports-key': key
  });
  const games = data?.response || [];
  console.log(`  Games: ${games.length}`);
  games.slice(0, 5).forEach(g => {
    console.log(`  ${g.league?.name}: ${g.teams?.away?.name} @ ${g.teams?.home?.name} [${g.status?.short}]`);
  });
}

async function main() {
  // Test all three dates to see where games appear
  for (const date of [YESTERDAY, TODAY, TOMORROW]) {
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  DATE: ${date}`);
    console.log('═'.repeat(55));
    await testESPN(date);
    await testSofascore(date);
    await testTheSportsDB(date);
    await testAPIBasketball(date);
  }

  // Also test live events
  await testSofascoreLive();

  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  TEST COMPLETE');
  console.log('  Check above to see which dates/sources have games');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => { console.error('Test failed:', e.message); process.exit(1); });
