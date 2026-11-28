// Pause / resume automation (Level 4): automatic trains brake to a stop and
// wait, keeping their destinations; resuming drives them on. Separate from
// STOP (track power stays on, drivers' trains are not stopped). STOP and
// track power off also pause automation, so trains never start again by
// themselves when power returns. Shown when there is a Level 4 area, or
// while automation is paused.
import {Project} from '../../../model/project';
import {strings} from '../../../shared/strings';
import {sendCommand, useEngineStore} from '../store/engineStore';

export const AutomationButton = ({project}: {project: Project}) => {
  const paused = useEngineStore((state) => state.layout.automationPaused);
  const level4 = project.areas.some((area) => area.level === 4);
  if (!level4 && !paused) {
    return null;
  }
  return (
    <button
      type="button"
      className={`button${paused ? ' automation-button--paused' : ''}`}
      aria-pressed={paused}
      onClick={() =>
        sendCommand({type: 'setAutomationPaused', paused: !paused})
      }
    >
      {paused
        ? `${strings.trains.paused} · ${strings.trains.resume}`
        : strings.trains.pause}
    </button>
  );
};
