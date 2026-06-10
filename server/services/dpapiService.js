const { execFile } = require('child_process');

function execPowerShell(script, stdin) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || stdout || error.message || '').toString();
          reject(new Error(msg));
          return;
        }
        resolve(String(stdout || '').trim());
      }
    );

    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

async function protectString(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const value = String(plaintext);
  if (value.length === 0) return '';

  const script = `
$in = [Console]::In.ReadToEnd()
Add-Type -AssemblyName System.Security
$bytes = [System.Text.Encoding]::UTF8.GetBytes($in)
$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($enc)
`;

  return execPowerShell(script, value);
}

async function unprotectString(ciphertextBase64) {
  if (ciphertextBase64 === null || ciphertextBase64 === undefined) return null;
  const value = String(ciphertextBase64);
  if (value.length === 0) return '';

  const script = `
$in = [Console]::In.ReadToEnd().Trim()
Add-Type -AssemblyName System.Security
$enc = [Convert]::FromBase64String($in)
$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.Text.Encoding]::UTF8.GetString($dec)
`;

  return execPowerShell(script, value);
}

module.exports = {
  protectString,
  unprotectString,
};
