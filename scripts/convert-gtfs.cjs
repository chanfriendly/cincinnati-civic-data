#!/usr/bin/env node
/**
 * convert-gtfs.js
 *
 * Downloads the SORTA GTFS feed and converts it to the JSON format
 * consumed by the app (public/data/sorta_stops.json).
 *
 * Preserves:
 *   - stop_id, stop_name, stop_lat, stop_lon
 *   - wheelchair_boarding  (0 = unknown, 1 = accessible, 2 = not accessible)
 *   - routes[]             (joined via stop_times → trips → routes)
 *
 * Usage:
 *   node scripts/convert-gtfs.js
 *
 * Requires: Node 18+ (uses built-in fetch + fs/path/stream/unzip via child_process)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const readline = require('readline');

const GTFS_URL = 'https://www.go-metro.com/transitdata/google_transit.zip';
const TMP_ZIP  = path.join(__dirname, '_gtfs_tmp.zip');
const TMP_DIR  = path.join(__dirname, '_gtfs_tmp');
const OUT_FILE = path.join(__dirname, '../public/data/sorta_stops.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} …`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) { resolve([]); return; }
    const rows = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    let headers = null;
    rl.on('line', (line) => {
      // Basic CSV split (GTFS files don't use quoted commas)
      const cols = line.split(',');
      if (!headers) { headers = cols.map(h => h.trim().replace(/^\uFEFF/, '')); return; }
      const row = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim(); });
      rows.push(row);
    });
    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Download
  await download(GTFS_URL, TMP_ZIP);

  // 2. Unzip
  fs.mkdirSync(TMP_DIR, { recursive: true });
  console.log('Unzipping …');
  execSync(`unzip -o "${TMP_ZIP}" -d "${TMP_DIR}"`);

  // 3. Parse GTFS tables
  console.log('Parsing GTFS tables …');
  const [stops, stopTimes, trips, routes] = await Promise.all([
    parseCsv(path.join(TMP_DIR, 'stops.txt')),
    parseCsv(path.join(TMP_DIR, 'stop_times.txt')),
    parseCsv(path.join(TMP_DIR, 'trips.txt')),
    parseCsv(path.join(TMP_DIR, 'routes.txt')),
  ]);

  console.log(`  stops: ${stops.length}, stop_times: ${stopTimes.length}, trips: ${trips.length}, routes: ${routes.length}`);

  // 4. Build trip_id → route_short_name index
  const tripToRoute = {};
  const routeById = {};
  routes.forEach(r => { routeById[r.route_id] = r.route_short_name || r.route_long_name || r.route_id; });
  trips.forEach(t => { tripToRoute[t.trip_id] = routeById[t.route_id] || t.route_id; });

  // 5. Build stop_id → Set<route_name>
  const stopRoutes = {};
  stopTimes.forEach(st => {
    const routeName = tripToRoute[st.trip_id];
    if (!routeName) return;
    if (!stopRoutes[st.stop_id]) stopRoutes[st.stop_id] = new Set();
    stopRoutes[st.stop_id].add(routeName);
  });

  // 6. Build output
  //
  // wheelchair_boarding values (GTFS spec):
  //   0 or '' = no accessibility information for this stop
  //   1       = some vehicles at this stop can be boarded by a rider in a wheelchair
  //   2       = wheelchair boarding is not possible at this stop
  const output = stops.map(s => ({
    stop_id:             s.stop_id,
    stop_name:           s.stop_name,
    stop_lat:            parseFloat(s.stop_lat),
    stop_lon:            parseFloat(s.stop_lon),
    wheelchair_boarding: parseInt(s.wheelchair_boarding || '0', 10),
    routes:              Array.from(stopRoutes[s.stop_id] || []).sort(),
  }));

  // 7. Write
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${output.length} stops → ${OUT_FILE}`);

  // 8. Accessibility summary
  const accessible   = output.filter(s => s.wheelchair_boarding === 1).length;
  const inaccessible = output.filter(s => s.wheelchair_boarding === 2).length;
  const unknown      = output.filter(s => s.wheelchair_boarding === 0).length;
  console.log(`\nAccessibility summary:`);
  console.log(`  Accessible (1):    ${accessible}`);
  console.log(`  Not accessible (2):${inaccessible}`);
  console.log(`  Unknown (0):       ${unknown}`);

  // 9. Cleanup
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.rmSync(TMP_ZIP, { force: true });
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
