// Development-only UI automation, for checking the UI without touching the
// user's screen: Lever runs hidden, a script sends input events to Lever's
// own page (never OS-level input) and saves images of the page itself
// (capturePage), never of the screen. Renderer console output is printed.
//
//   LEVER_UI_SCRIPT=steps.json LEVER_UI_OUT=folder npx electron .
//
// Steps: {"wait": ms} | {"click": [x, y], "button"?: "left"|"right",
// "double"?: true} | {"drag": [[x1, y1], [x2, y2]]} | {"key": "t", "ctrl"?:
// true, "shift"?: true} | {"type": "text"} | {"capture": "name.png"} |
// {"js": "code returning a value to print"}.
//
// Never active in a packaged build.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {app, BrowserWindow} from 'electron';

type Step =
  | {wait: number}
  | {
      click: [number, number];
      button?: 'left' | 'right';
      double?: boolean;
      // Coordinates relative to the first element matching this selector.
      relativeTo?: string;
    }
  // Clicks the first button whose text is exactly this.
  | {clickText: string}
  // Clicks (with real input events) where this expression says: it must
  // return [x, y] in page coordinates.
  | {clickAtJs: string}
  | {drag: [[number, number], [number, number]]}
  | {key: string; ctrl?: boolean; shift?: boolean}
  | {type: string}
  | {capture: string}
  | {js: string};

export const uiScriptPath = (): string | undefined =>
  app.isPackaged ? undefined : process.env['LEVER_UI_SCRIPT'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runUiScript = async (
  window: BrowserWindow,
  scriptPath: string,
): Promise<void> => {
  try {
    await runSteps(window, scriptPath);
  } catch (error) {
    console.log(`[ui] script failed: ${String(error)}`);
  }
  app.quit();
};

const runSteps = async (window: BrowserWindow, scriptPath: string) => {
  const out = process.env['LEVER_UI_OUT'] ?? '.';
  await mkdir(out, {recursive: true});
  const steps = JSON.parse(await readFile(scriptPath, 'utf8')) as Step[];
  const contents = window.webContents;
  contents.on('console-message', (event) => {
    console.log(`[renderer ${event.level}] ${event.message}`);
  });
  await sleep(1500);
  for (const step of steps) {
    if ('wait' in step) {
      await sleep(step.wait);
    } else if ('clickText' in step) {
      const found: unknown = await contents.executeJavaScript(
        `(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(step.clickText)}); if (b) { b.click(); return true; } return false; })()`,
      );
      if (!found) {
        console.log(`[ui] button not found: ${step.clickText}`);
      }
      await sleep(150);
    } else if ('clickAtJs' in step) {
      const [x, y] = (await contents.executeJavaScript(step.clickAtJs)) as [
        number,
        number,
      ];
      contents.sendInputEvent({type: 'mouseMove', x, y});
      contents.sendInputEvent({
        type: 'mouseDown',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      contents.sendInputEvent({
        type: 'mouseUp',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await sleep(150);
    } else if ('click' in step) {
      let [x, y] = step.click;
      if (step.relativeTo) {
        const origin = (await contents.executeJavaScript(
          `(() => { const r = document.querySelector(${JSON.stringify(step.relativeTo)})?.getBoundingClientRect(); return r ? [r.left, r.top] : [0, 0]; })()`,
        )) as [number, number];
        x = Math.round(x + origin[0]);
        y = Math.round(y + origin[1]);
      }
      const button = step.button ?? 'left';
      for (let n = 1; n <= (step.double ? 2 : 1); n++) {
        contents.sendInputEvent({type: 'mouseMove', x, y});
        contents.sendInputEvent({
          type: 'mouseDown',
          x,
          y,
          button,
          clickCount: n,
        });
        contents.sendInputEvent({type: 'mouseUp', x, y, button, clickCount: n});
      }
      await sleep(120);
    } else if ('drag' in step) {
      const [[x1, y1], [x2, y2]] = step.drag;
      contents.sendInputEvent({type: 'mouseMove', x: x1, y: y1});
      contents.sendInputEvent({
        type: 'mouseDown',
        x: x1,
        y: y1,
        button: 'left',
        clickCount: 1,
      });
      for (let i = 1; i <= 8; i++) {
        contents.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(x1 + ((x2 - x1) * i) / 8),
          y: Math.round(y1 + ((y2 - y1) * i) / 8),
          button: 'left',
        });
        await sleep(15);
      }
      contents.sendInputEvent({
        type: 'mouseUp',
        x: x2,
        y: y2,
        button: 'left',
        clickCount: 1,
      });
      await sleep(120);
    } else if ('key' in step) {
      const modifiers: ('control' | 'shift')[] = [];
      if (step.ctrl) {
        modifiers.push('control');
      }
      if (step.shift) {
        modifiers.push('shift');
      }
      contents.sendInputEvent({type: 'keyDown', keyCode: step.key, modifiers});
      if (step.key.length === 1) {
        contents.sendInputEvent({type: 'char', keyCode: step.key, modifiers});
      }
      contents.sendInputEvent({type: 'keyUp', keyCode: step.key, modifiers});
      await sleep(120);
    } else if ('type' in step) {
      for (const char of step.type) {
        contents.sendInputEvent({type: 'char', keyCode: char});
      }
      await sleep(120);
    } else if ('capture' in step) {
      // Let React render and the (hidden) window paint before capturing.
      await contents.executeJavaScript(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      );
      await sleep(200);
      const image = await contents.capturePage();
      await writeFile(join(out, step.capture), image.toPNG());
      console.log(`[ui] captured ${step.capture}`);
    } else if ('js' in step) {
      const result: unknown = await contents.executeJavaScript(step.js);
      console.log(`[ui] ${JSON.stringify(result)}`);
    }
  }
  console.log('[ui] script done');
};
