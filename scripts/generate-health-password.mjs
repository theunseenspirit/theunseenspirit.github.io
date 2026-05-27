import { randomInt } from "node:crypto";

const DEFAULT_LENGTH = 56;
const MIN_LENGTH = 32;
const MAX_LENGTH = 128;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=?";

const args = parseArgs(process.argv.slice(2));
const length = clamp(Number(args.length || DEFAULT_LENGTH), MIN_LENGTH, MAX_LENGTH);
const password = generatePassword(length);

console.log("");
console.log("Health dashboard password");
console.log("");
console.log(password);
console.log("");
console.log(`Length: ${length}`);
console.log("Entropy: high enough for an encrypted public GitHub Pages payload if you keep it private.");
console.log("");
console.log("Use it with:");
console.log("");
console.log("$secure = Read-Host \"Dashboard password\" -AsSecureString");
console.log("$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)");
console.log("$env:HEALTH_DASHBOARD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)");
console.log('node scripts/build-health-data.mjs --input "C:\\Users\\zacha\\Downloads\\export\\apple_health_export"');
console.log("Remove-Item Env:\\HEALTH_DASHBOARD_PASSWORD");
console.log("");

function generatePassword(length) {
  let output = "";
  while (!isComplex(output)) {
    output = Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  }
  return output;
}

function isComplex(value) {
  return (
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[!@#$%^&*_\-+=?]/.test(value)
  );
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return DEFAULT_LENGTH;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--length") {
      parsed.length = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}
