import { exec, execSync } from 'child_process';
import {
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'fs';
import { ensureDirSync } from 'fs-extra';
import * as path from 'path';

interface RunCmdOpts {
  silenceError?: boolean;
  env?: Record<string, string>;
}

export let cli;

export function uniq(prefix: string) {
  return `${prefix}${Math.floor(Math.random() * 10000000)}`;
}

export function forEachCli(
  selectedCliOrFunction: string | Function,
  callback?: (currentCLIName) => void
) {
  let clis;
  if (process.env.SELECTED_CLI && selectedCliOrFunction && callback) {
    if (selectedCliOrFunction == process.env.SELECTED_CLI) {
      clis = [process.env.SELECTED_CLI];
    } else {
      clis = [];
    }
  } else if (process.env.SELECTED_CLI) {
    clis = [process.env.SELECTED_CLI];
  } else {
    clis = callback ? [selectedCliOrFunction] : ['nx', 'angular'];
  }

  const cb: any = callback ? callback : selectedCliOrFunction;
  clis.forEach((c) => {
    describe(`[${c}]`, () => {
      beforeEach(() => {
        cli = c;
      });
      cb(c);
    });
  });
}

export function patchKarmaToWorkOnWSL(): void {
  try {
    const karma = readFile('karma.conf.js');
    if (process.env['WINDOWSTMP']) {
      updateFile(
        'karma.conf.js',
        karma.replace(
          `const { constants } = require('karma');`,
          `
      const { constants } = require('karma');
      process.env['TMPDIR']="${process.env['WINDOWSTMP']}";
    `
        )
      );
    }
  } catch (e) {}
}

export function workspaceConfigName() {
  return cli === 'angular' ? 'angular.json' : 'workspace.json';
}

export function runCreateWorkspace(
  name: string,
  {
    preset,
    appName,
    style,
  }: { preset: string; appName?: string; style?: string }
) {
  let command = `npx create-nx-workspace@${process.env.PUBLISHED_VERSION} ${name} --cli=${cli} --preset=${preset} --no-interactive`;
  if (appName) {
    command += ` --appName ${appName}`;
  }
  if (style) {
    command += ` --style ${style}`;
  }
  const create = execSync(command, {
    cwd: `./tmp/${cli}`,
    stdio: [0, 1, 2],
    // stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
  });
  return create ? create.toString() : '';
}

export function yarnAdd(pkg: string) {
  const install = execSync(`yarn add ${pkg}`, {
    cwd: tmpProjPath(),
    // ...{ stdio: ['pipe', 'pipe', 'pipe'] },
    ...{ stdio: [0, 1, 2] },
    env: process.env,
  });
  return install ? install.toString() : '';
}

export function runNgNew(): string {
  return execSync(`../../node_modules/.bin/ng new proj --no-interactive`, {
    cwd: `./tmp/${cli}`,
    env: process.env,
  }).toString();
}

/**
 * Sets up a new project in the temporary project path
 * for the currently selected CLI.
 */
export function newProject(): void {
  try {
    cleanup();
    if (!directoryExists(tmpBackupProjPath())) {
      runCreateWorkspace('proj', { preset: 'empty' });
      const packages = [
        `@nrwl/angular`,
        `@nrwl/express`,
        `@nrwl/nest`,
        `@nrwl/next`,
        `@nrwl/react`,
        `@nrwl/storybook`,
        `@nrwl/nx-plugin`,
        `@nrwl/eslint-plugin-nx`,
      ];
      yarnAdd(packages.join(` `));
      packages
        .filter(
          (f) => f !== '@nrwl/nx-plugin' && f !== `@nrwl/eslint-plugin-nx`
        )
        .forEach((p) => {
          runCLI(`g ${p}:init`);
        });
      execSync(`mv ${tmpProjPath()} ${tmpBackupProjPath()}`);
    }
    execSync(`cp -a ${tmpBackupProjPath()} ${tmpProjPath()}`);
  } catch (e) {
    console.log(`Failed to set up project for e2e tests.`);
    console.log(e.message);
    throw e;
  }
}

/**
 * Ensures that a project has been setup
 * in the temporary project path for the
 * currently selected CLI.
 *
 * If one is not found, it creates a new project.
 */
export function ensureProject(): void {
  // if (!directoryExists(tmpProjPath())) {
  newProject();
  // }
}

export function supportUi() {
  return false;
  // return !process.env.NO_CHROME;
}

export function runCommandAsync(
  command: string,
  opts: RunCmdOpts = {
    silenceError: false,
    env: process.env,
  }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: tmpProjPath(),
        env: process.env,
      },
      (err, stdout, stderr) => {
        if (!opts.silenceError && err) {
          reject(err);
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

export function runCLIAsync(
  command: string,
  opts: RunCmdOpts = {
    silenceError: false,
    env: process.env,
  }
): Promise<{ stdout: string; stderr: string }> {
  return runCommandAsync(`./node_modules/.bin/nx ${command}`, opts);
}

export function runNgAdd(
  command?: string,
  opts: RunCmdOpts = {
    silenceError: false,
    env: process.env,
  }
): string {
  try {
    yarnAdd('@nrwl/workspace');
    return execSync(
      `./node_modules/.bin/ng g @nrwl/workspace:ng-add ${command}`,
      {
        cwd: tmpProjPath(),
        env: opts.env,
      }
    )
      .toString()
      .replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ''
      );
  } catch (e) {
    if (opts.silenceError) {
      return e.stdout.toString();
    } else {
      console.log(e.stdout.toString(), e.stderr.toString());
      throw e;
    }
  }
}

export function runCLI(
  command?: string,
  opts: RunCmdOpts = {
    silenceError: false,
    env: process.env,
  }
): string {
  try {
    const r = execSync(`./node_modules/.bin/nx ${command}`, {
      cwd: tmpProjPath(),
      env: opts.env,
    })
      .toString()
      .replace(
        /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
        ''
      );

    if (process.env.VERBOSE_OUTPUT) {
      console.log(r);
    }

    const needsMaxWorkers = /g.*(express|nest|node|web|react):app.*/;
    if (needsMaxWorkers.test(command)) {
      setMaxWorkers();
    }

    return r;
  } catch (e) {
    if (opts.silenceError) {
      return e.stdout.toString();
    } else {
      console.log(e.stdout.toString(), e.stderr.toString());
      throw e;
    }
  }
}

export function expectTestsPass(v: { stdout: string; stderr: string }) {
  expect(v.stderr).toContain('Ran all test suites');
  expect(v.stderr).not.toContain('fail');
}

export function runCommand(command: string): string {
  try {
    const r = execSync(command, {
      cwd: tmpProjPath(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    }).toString();
    if (process.env.VERBOSE_OUTPUT) {
      console.log(r);
    }
    return r;
  } catch (e) {
    return e.stdout.toString() + e.stderr.toString();
  }
}

/**
 * Sets maxWorkers in CircleCI on all projects that require it
 * so that it doesn't try to run it with 34 workers
 *
 * maxWorkers required for: node, web, jest
 */
function setMaxWorkers() {
  if (process.env['CIRCLECI']) {
    const workspaceFile = workspaceConfigName();
    const workspace = readJson(workspaceFile);

    Object.keys(workspace.projects).forEach((appName) => {
      const {
        architect: { build },
      } = workspace.projects[appName];

      if (!build) {
        return;
      }

      if (
        build.builder.startsWith('@nrwl/node') ||
        build.builder.startsWith('@nrwl/web') ||
        build.builder.startsWith('@nrwl/jest')
      ) {
        build.options.maxWorkers = 4;
      }
    });

    updateFile(workspaceFile, JSON.stringify(workspace));
  }
}

export function updateFile(f: string, content: string | Function): void {
  ensureDirSync(path.dirname(tmpProjPath(f)));
  if (typeof content === 'string') {
    writeFileSync(tmpProjPath(f), content);
  } else {
    writeFileSync(
      tmpProjPath(f),
      content(readFileSync(tmpProjPath(f)).toString())
    );
  }
}

export function renameFile(f: string, newPath: string): void {
  ensureDirSync(path.dirname(tmpProjPath(newPath)));
  renameSync(tmpProjPath(f), tmpProjPath(newPath));
}

export function checkFilesExist(...expectedFiles: string[]) {
  expectedFiles.forEach((f) => {
    const ff = f.startsWith('/') ? f : tmpProjPath(f);
    if (!exists(ff)) {
      throw new Error(`File '${ff}' does not exist`);
    }
  });
}

export function checkFilesDoNotExist(...expectedFiles: string[]) {
  expectedFiles.forEach((f) => {
    const ff = f.startsWith('/') ? f : tmpProjPath(f);
    if (exists(ff)) {
      throw new Error(`File '${ff}' does not exist`);
    }
  });
}

export function listFiles(dirName: string) {
  return readdirSync(tmpProjPath(dirName));
}

export function readJson(f: string): any {
  return JSON.parse(readFile(f));
}

export function readFile(f: string) {
  const ff = f.startsWith('/') ? f : tmpProjPath(f);
  return readFileSync(ff).toString();
}

export function cleanup() {
  execSync(`rm -rf ${tmpProjPath()}`);
}

export function rmDist() {
  execSync(`rm -rf ${tmpProjPath()}/dist`);
}

export function directoryExists(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory();
  } catch (err) {
    return false;
  }
}

export function fileExists(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch (err) {
    return false;
  }
}

export function exists(filePath: string): boolean {
  return directoryExists(filePath) || fileExists(filePath);
}

export function getSize(filePath: string): number {
  return statSync(filePath).size;
}

export function tmpProjPath(path?: string) {
  return path ? `./tmp/${cli}/proj/${path}` : `./tmp/${cli}/proj`;
}

function tmpBackupProjPath(path?: string) {
  return path ? `./tmp/${cli}/proj-backup/${path}` : `./tmp/${cli}/proj-backup`;
}
