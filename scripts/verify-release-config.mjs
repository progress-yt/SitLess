const required = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'SITLESS_UPDATE_URL'];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(`Missing release environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

let updateUrl;
try {
  updateUrl = new URL(process.env.SITLESS_UPDATE_URL);
} catch {
  console.error('SITLESS_UPDATE_URL must be a valid HTTPS URL.');
  process.exit(1);
}

if (updateUrl.protocol !== 'https:') {
  console.error('SITLESS_UPDATE_URL must use HTTPS.');
  process.exit(1);
}

console.log(`Release configuration is valid for ${updateUrl.origin}.`);
