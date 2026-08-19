/**
 * Helper script to encode certificate files to base64 for embedding in qa.json
 * Usage: node scripts/encode-certificates.js <path-to-cer> <path-to-key>
 */

const fs = require('fs');
const path = require('path');

// Get file paths from command line arguments
const cerPath = process.argv[2];
const keyPath = process.argv[3];

if (!cerPath || !keyPath) {
  console.error('Usage: node scripts/encode-certificates.js <path-to-cer> <path-to-key>');
  console.error('Example: node scripts/encode-certificates.js C:\\Downloads\\cert.cer C:\\Downloads\\key.key');
  process.exit(1);
}

try {
  // Read certificate file
  const cerBuffer = fs.readFileSync(cerPath);
  const cerBase64 = cerBuffer.toString('base64');
  
  // Read key file
  const keyBuffer = fs.readFileSync(keyPath);
  const keyBase64 = keyBuffer.toString('base64');
  
  console.log('\n=== Copy the following values into test-data/envs/qa.json ===\n');
  console.log('"efirma": {');
  console.log(`  "cerContent": "${cerBase64}",`);
  console.log(`  "keyContent": "${keyBase64}",`);
  console.log('  "password": "YOUR_EFIRMA_PASSWORD"');
  console.log('}');
  console.log('\n=== End ===\n');
  
  // Also write to a file for easy copying
  const output = {
    cerContent: cerBase64,
    keyContent: keyBase64,
    password: "YOUR_EFIRMA_PASSWORD"
  };
  
  fs.writeFileSync(
    path.join(__dirname, 'encoded-certificates.json'),
    JSON.stringify(output, null, 2)
  );
  
  console.log('✓ Also saved to scripts/encoded-certificates.json');
  
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
