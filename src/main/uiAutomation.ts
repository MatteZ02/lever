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
  // Like drag; the expression returns [[x1, y1], [x2, y2]].
  | {dragJs: string}
  | {key: string; ctrl?: boolean; shift?: boolean}
  | {type: string}
  | {capture: string}
  | {js: string}
  // Mouse wheel at [x, y] (page coordinates) with deltaY, `times` times.
  // `touchpad`: smooth scrolling (precise deltas, deltaX allowed) instead of
  // wheel notches; `ctrl`: as a touchpad pinch sends it.
  | {
      wheel: [number, number, number];
      times?: number;
      deltaX?: number;
      touchpad?: boolean;
      ctrl?: boolean;
    }
  // Slows the renderer's CPU by this factor (Chromium DevTools emulation), to
  // approximate a low-spec PC. 1 = off.
  | {cpuThrottle: number}
  // Real touch input (DevTools Input.dispatchTouchEvent): the fingers now on
  // the page, in page coordinates. An empty list lifts every finger. Each
  // step is one touchStart/touchMove/touchEnd, so a gesture is several steps.
  // Or a JavaScript expression that returns that list.
  | {touch: [number, number][] | string}
  // Prints the renderer's main-thread work (DevTools Performance metrics:
  // task, script, layout, style time) since the previous metrics step.
  | {metrics: string};

export const uiScriptPath = (): string | undefined =>
  app.isPackaged ? undefined : process.env['LEVER_UI_SCRIPT'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastMetrics: Record<string, number> = {};

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
  let touchCount = 0;
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
    } else if ('drag' in step || 'dragJs' in step) {
      const [[x1, y1], [x2, y2]] =
        'drag' in step
          ? step.drag
          : ((await contents.executeJavaScript(step.dragJs)) as [
              [number, number],
              [number, number],
            ]);
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
          // Without this the page sees a move with no button held.
          modifiers: ['leftbuttondown'],
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
    } else if ('wheel' in step) {
      const [x, y, deltaY] = step.wheel;
      for (let i = 0; i < (step.times ?? 1); i++) {
        contents.sendInputEvent({
          type: 'mouseWheel',
          x,
          y,
          deltaX: step.deltaX ?? 0,
          deltaY,
          // A mouse wheel reports notches (wheelTicks); a touchpad does not.
          ...(step.touchpad
            ? {hasPreciseScrollingDeltas: true, wheelTicksX: 0, wheelTicksY: 0}
            : {wheelTicksX: 0, wheelTicksY: deltaY / 100}),
          ...(step.ctrl ? {modifiers: ['control' as const]} : {}),
        });
        await sleep(16);
      }
    } else if ('metrics' in step) {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach('1.3');
      }
      await contents.debugger.sendCommand('Performance.enable');
      const {metrics} = (await contents.debugger.sendCommand(
        'Performance.getMetrics',
      )) as {metrics: {name: string; value: number}[]};
      const now = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
      const keys = [
        'TaskDuration',
        'ScriptDuration',
        'LayoutDuration',
        'RecalcStyleDuration',
      ];
      const delta = Object.fromEntries(
        keys.map((key) => [
          key.replace('Duration', 'Ms'),
          Math.round(((now[key] ?? 0) - (lastMetrics[key] ?? 0)) * 1000),
        ]),
      );
      lastMetrics = now;
      console.log(`[ui] ${step.metrics}: ${JSON.stringify(delta)}`);
    } else if ('cpuThrottle' in step) {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach('1.3');
      }
      await contents.debugger.sendCommand('Emulation.setCPUThrottlingRate', {
        rate: step.cpuThrottle,
      });
      console.log(`[ui] CPU throttling ×${step.cpuThrottle}`);
    } else if ('touch' in step) {
      if (!contents.debugger.isAttached()) {
        contents.debugger.attach('1.3');
      }
      const fingers: [number, number][] =
        typeof step.touch === 'string'
          ? ((await contents.executeJavaScript(step.touch)) as [
              number,
              number,
            ][])
          : step.touch;
      const points = fingers.map(([x, y], id) => ({x, y, id}));
      const type =
        points.length === 0
          ? 'touchEnd'
          : points.length > touchCount
            ? 'touchStart'
            : points.length < touchCount
              ? 'touchEnd'
              : 'touchMove';
      await contents.debugger.sendCommand('Input.dispatchTouchEvent', {
        type,
        touchPoints: points,
      });
      touchCount = points.length;
    } else if ('js' in step) {
      const result: unknown = await contents.executeJavaScript(step.js);
      console.log(`[ui] ${JSON.stringify(result)}`);
    }
  }
  console.log('[ui] script done');
};
