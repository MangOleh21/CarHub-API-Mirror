import 'dotenv/config';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { bootstrapOwner, BootstrapOwnerError } from '../auth/bootstrap-owner.js';
import { createPool } from '../config/pool.js';
import { createAdminsModel } from '../models/adminsModel.js';

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Owner bootstrap must run in an interactive terminal');
  }

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(prompt);

  return new Promise((resolve, reject) => {
    let value = '';

    const finish = (error) => {
      stdin.off('keypress', onKeypress);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };

    const onKeypress = (character, key) => {
      if (key.ctrl && key.name === 'c') {
        finish(new Error('Owner bootstrap was cancelled'));
      } else if (key.name === 'return' || key.name === 'enter') {
        finish();
      } else if (key.name === 'backspace') {
        value = value.slice(0, -1);
      } else if (!key.ctrl && !key.meta && character) {
        value += character;
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Owner bootstrap must run in an interactive terminal');
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  let name;
  let email;
  try {
    name = (await prompt.question('Owner full name (optional): ')).trim();
    email = await prompt.question('Owner email: ');
  } finally {
    prompt.close();
  }

  const password = await readHidden('Owner password: ');
  const confirmation = await readHidden('Confirm password: ');
  if (password !== confirmation) {
    throw new Error('Passwords do not match');
  }

  const pool = createPool();
  try {
    const owner = await bootstrapOwner(createAdminsModel(pool), {
      ...(name ? { name } : {}),
      email,
      password,
    });
    console.log(`Created initial owner account ${owner.email} (id ${owner.id}).`);
  } catch (error) {
    if (error instanceof BootstrapOwnerError) {
      throw error;
    }

    console.error('Owner bootstrap failed; verify DATABASE_URL and database availability.');
    console.error(`Failure type: ${error.name}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
