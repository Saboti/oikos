/**
 * Modul: Setup-Script
 * Zweck: Erstmalige Einrichtung - ersten Admin-User anlegen.
 *        Interaktiv: `node setup.js`
 *        Nicht-interaktiv: `node setup.js --username admin --display-name "Max" --password geheim`
 *
 * HINWEIS: Diese Datei ist eine Kopie von ../../setup.js für den HA-Addon-Build-Kontext.
 *          Änderungen immer in der Root-Datei vornehmen und hierher kopieren.
 * Abhängigkeiten: server/db.js, bcrypt
 */

import readline from 'node:readline';
import bcrypt from 'bcrypt';
import * as db from './server/db.js';
import os from 'node:os';

// ── CLI-Argumente parsen ─────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username')       result.username      = args[++i];
    if (args[i] === '--display-name')   result.displayName   = args[++i];
    if (args[i] === '--password')       result.password      = args[++i];
    if (args[i] === '--skip-if-exists') result.skipIfExists  = true;
  }
  return result;
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function promptPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let password = '';
    process.stdin.on('data', function handler(char) {
      char = char.toString();
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        process.exit();
      } else if (char === '\u007f') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    });
  });
}

async function main() {
  const cliArgs = parseArgs();
  const nonInteractive = !!(cliArgs.username || cliArgs.password || cliArgs.displayName);

  console.log('\n=== Oikos Setup ===\n');

  if (!nonInteractive && !process.stdin.isTTY) {
    console.error(
      'Fehler: Kein Terminal (TTY) vorhanden.\n' +
      'Bitte --username, --display-name und --password als Argumente übergeben:\n\n' +
      '  node setup.js --username admin --display-name "Name" --password geheim\n'
    );
    rl.close();
    process.exit(1);
  }

  // Prüfen ob bereits Admin vorhanden
  const existingAdmin = db.get()
    .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    .get();

  if (existingAdmin) {
    if (nonInteractive && cliArgs.skipIfExists) {
      console.log('ℹ  Admin-Account bereits vorhanden, überspringe Setup.');
      rl.close();
      process.exit(0);
    } else if (nonInteractive) {
      // proceed – allows adding additional admins via CLI
    } else {
      console.log('ℹ  Es existiert bereits ein Admin-Account.\n');
      const proceed = await prompt('Trotzdem einen weiteren Admin anlegen? (j/N): ');
      if (proceed.toLowerCase() !== 'j') {
        console.log('Setup abgebrochen.');
        rl.close();
        process.exit(0);
      }
    }
  }

  console.log('Admin-Account anlegen:\n');

  let username, displayName, password;

  if (nonInteractive) {
    username    = (cliArgs.username    ?? '').trim();
    displayName = (cliArgs.displayName ?? '').trim();
    password    = cliArgs.password     ?? '';

    if (!username || username.length < 3) {
      console.error('Fehler: --username muss mindestens 3 Zeichen lang sein.');
      process.exit(1);
    }
    if (!displayName) {
      console.error('Fehler: --display-name darf nicht leer sein.');
      process.exit(1);
    }
    if (password.length < 8) {
      console.error('Fehler: --password muss mindestens 8 Zeichen lang sein.');
      process.exit(1);
    }
  } else {
    username = (await prompt('Benutzername: ')).trim();
    if (!username || username.length < 3) {
      console.error('Fehler: Benutzername muss mindestens 3 Zeichen lang sein.');
      process.exit(1);
    }

    displayName = (await prompt('Anzeigename (z.B. "Max Mustermann"): ')).trim();
    if (!displayName) {
      console.error('Fehler: Anzeigename darf nicht leer sein.');
      process.exit(1);
    }

    password = await promptPassword('Passwort: ');
    if (password.length < 8) {
      console.error('Fehler: Passwort muss mindestens 8 Zeichen lang sein.');
      process.exit(1);
    }

    const passwordConfirm = await promptPassword('Passwort bestätigen: ');
    if (password !== passwordConfirm) {
      console.error('Fehler: Passwörter stimmen nicht überein.');
      process.exit(1);
    }
  }

  const avatarColors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55'];
  const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

  console.log('\nAccount wird erstellt …');

  const hash = await bcrypt.hash(password, 12);

  try {
    const result = db.get()
      .prepare(`
        INSERT INTO users (username, display_name, password_hash, avatar_color, role)
        VALUES (?, ?, ?, ?, 'admin')
      `)
      .run(username, displayName, hash, avatarColor);

    const port = process.env.PORT || 3000;
    const host = getLocalIP();

    console.log(`\n✅ Admin-Account erfolgreich erstellt!`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`  Benutzername: ${username}`);
    console.log(`  Anzeigename:  ${displayName}`);
    console.log(`  Rolle:        Admin`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`\n🌐 Oikos ist erreichbar unter:\n`);
    console.log(`   Lokal:     http://localhost:${port}`);
    if (host) {
      console.log(`   Netzwerk:  http://${host}:${port}`);
    }
    console.log(`\n   Melde dich mit deinem neuen Account an. Viel Spaß!\n`);
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      console.error(`\nFehler: Benutzername "${username}" ist bereits vergeben.`);
    } else {
      console.error('\nFehler beim Erstellen:', err.message);
    }
    process.exit(1);
  }

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err.message);
  process.exit(1);
});
