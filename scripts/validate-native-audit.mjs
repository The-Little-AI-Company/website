import {createHash} from 'node:crypto';
import {lstatSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const LOCK_SHA256 = '54de17de0e3e513d91a57731af56c06f7627d4cb7fbe246dee32e0d2b94b92f5';
export const PACKAGE_IDENTITIES = 403;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Check duplicate decoded keys and bounds, then let native JSON.parse own grammar.
export function parseReport(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576) throw Error('Audit JSON byte bound.');
  const stack = [];
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      if (++tokens > 100000 || stack.length >= 128) throw Error('Audit JSON structural bound.');
      stack.push(ch === '{' ? new Set() : null);
    } else if (ch === '}' || ch === ']') {
      if (!stack.length) throw Error('Unmatched audit JSON container.');
      stack.pop();
    } else if (ch === '"') {
      if (++tokens > 100000) throw Error('Audit JSON token bound.');
      const start = i;
      let closed = false;
      for (i++; i < text.length; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') {closed = true; break;}
      }
      if (!closed) throw Error('Unterminated audit JSON string.');
      let next = i + 1;
      while (next < text.length && /[\x20\t\r\n]/.test(text[next])) next++;
      if (text[next] === ':') {
        const keys = stack.at(-1);
        if (!(keys instanceof Set)) throw Error('Audit JSON member outside object.');
        const key = JSON.parse(text.slice(start, i + 1));
        if (keys.has(key)) throw Error('Duplicate audit JSON member.');
        keys.add(key);
      }
    }
  }
  if (stack.length) throw Error('Unclosed audit JSON container.');
  return JSON.parse(text);
}

export function validateAuditInput(lockBytes, manifest) {
  const hash = createHash('sha256').update(lockBytes).digest('hex');
  if (hash !== LOCK_SHA256 || manifest?.packageManager !== 'pnpm@10.34.7') {
    throw Error('Native audit input differs from the independently reviewed403-identity graph.');
  }
  return {lockSha256: hash, packageIdentities: PACKAGE_IDENTITIES};
}

export function validateAuditReport(text) {
  const report = parseReport(text);
  if (!plain(report) || report.error || !plain(report.advisories) || Object.keys(report.advisories).length) {
    throw Error('Native audit must contain an empty advisory object and no error.');
  }
  for (const key of ['actions', 'muted']) {
    if (!Array.isArray(report[key]) || report[key].length) throw Error('Native audit actions or muted findings are invalid.');
  }
  const metadata = report.metadata;
  if (!plain(metadata) || !plain(metadata.vulnerabilities)) throw Error('Native audit metadata is missing.');
  const severities = ['critical', 'high', 'info', 'low', 'moderate'];
  if (JSON.stringify(Object.keys(metadata.vulnerabilities).sort()) !== JSON.stringify(severities)
      || Object.values(metadata.vulnerabilities).some(value => value !== 0)) {
    throw Error('All five native audit severity counts must be present and zero.');
  }
  if (metadata.totalDependencies !== PACKAGE_IDENTITIES) throw Error('Native audit does not acknowledge the complete403-identity input.');
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (!Number.isSafeInteger(metadata[key]) || metadata[key] < 0 || metadata[key] > PACKAGE_IDENTITIES) {
      throw Error('Invalid native audit dependency counts.');
    }
  }
  return {nativeAuditSchemaPassed: true, packageIdentities: PACKAGE_IDENTITIES,
    wireCoverageOrCurrentVendorAdvisoryClearanceProved: false};
}

function boundedRead(filename) {
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1048576) throw Error('Unsafe audit input file.');
  return readFileSync(filename);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 2 && args[0] === '--input') {
      result = validateAuditInput(boundedRead(join(args[1], 'pnpm-lock.yaml')), JSON.parse(boundedRead(join(args[1], 'package.json'))));
    } else if (args.length === 1 && args[0] !== '--input') {
      result = validateAuditReport(boundedRead(args[0]).toString('utf8'));
    } else throw Error('Usage: validate-native-audit.mjs --input DIRECTORY | REPORT');
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
