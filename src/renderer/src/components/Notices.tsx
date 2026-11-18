// Notices from the engine (e.g. a command the central unit cannot do). Shown
// with text and an icon; dismissed with a button, never with Esc (Esc is
// STOP).
import {findElement} from '../../../model/validation';
import {EngineNotice} from '../../../shared/engineApi';
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';
import {useProjectStore} from '../store/projectStore';

const noticeText = (notice: EngineNotice): string => {
  const project = useProjectStore.getState().project;
  const element =
    notice.elementId && project
      ? findElement(project, notice.elementId)
      : undefined;
  const block = project?.blocks.find(
    (candidate) => candidate.id === notice.blockId,
  );
  const name =
    element?.name ||
    (element ? (strings.kinds[element.kind] ?? element.kind) : '') ||
    block?.name ||
    strings.kinds.block;
  switch (notice.code) {
    case 'extAccessoryUnsupported':
      return strings.notices.extAccessoryUnsupported();
    case 'refused':
      return strings.notices.refused(name);
    case 'incomplete':
      return strings.notices.incomplete(name, notice.reason ?? '');
    case 'failed':
      return strings.notices.failed(name);
    case 'labelNeedsFeedback':
      return strings.notices.labelNeedsFeedback(name);
  }
};

export const Notices = () => {
  const notices = useEngineStore((state) => state.notices);
  const dismiss = useEngineStore((state) => state.dismissNotice);
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.time} className="notice">
          <span aria-hidden>ⓘ</span>
          <span className="notice-text">{noticeText(notice)}</span>
          <button
            type="button"
            className="button"
            onClick={() => dismiss(notice.time)}
          >
            {strings.notices.dismiss}
          </button>
        </div>
      ))}
    </div>
  );
};
