// Notices from the engine (e.g. a command the central unit cannot do). Shown
// with text and an icon; they fade out by themselves after a while (the
// diagram keeps its own marker, e.g. "!" on a failed turnout), or are
// dismissed with a button, never with Esc (Esc is STOP). Hovering pauses the
// fade.
import {findElement} from '../../../model/validation';
import {EngineNotice} from '../../../shared/engineApi';
import {strings} from '../../../shared/strings';
import {describeElementId} from '../describe';
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
      return strings.notices.refused(name, notice.reason);
    case 'incomplete':
      return strings.notices.incomplete(name, notice.reason ?? '');
    case 'failed':
      return strings.notices.failed(name);
    case 'labelNeedsFeedback':
      return strings.notices.labelNeedsFeedback(name);
    case 'routeRefused':
      return strings.notices.routeRefused(notice.reason ?? '');
    case 'routeSet':
      return strings.notices.routeSet(
        (notice.manualThrow ?? []).map(
          (t) =>
            `${describe(t.turnoutId)}: ${strings.positions[t.position] ?? t.position}`,
        ),
      );
    case 'routeFailed':
      return strings.notices.routeFailed(describe(notice.elementId));
    case 'routeBroken':
      return strings.notices.routeBroken(describe(notice.elementId));
    case 'routeReleasedMoved':
      return strings.notices.routeReleasedMoved(describe(notice.elementId));
    case 'routeCancelled':
      return strings.notices.routeCancelled(
        describe(notice.elementId),
        describe(notice.toElementId),
      );
    case 'routeUndone':
      return strings.notices.routeUndone(
        (notice.skipped ?? []).map(describe),
        (notice.manualBack ?? []).map(describe),
      );
  }
};

const describe = (elementId: string | undefined) =>
  elementId
    ? describeElementId(useProjectStore.getState().project, elementId)
    : '';

// How long a notice stays before it has faded out.
const NOTICE_SHOWN_MS = 10000;

export const Notices = () => {
  const notices = useEngineStore((state) => state.notices);
  const dismiss = useEngineStore((state) => state.dismissNotice);
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.time}
          className="notice fading"
          style={{animationDuration: `${NOTICE_SHOWN_MS}ms`}}
          onAnimationEnd={() => dismiss(notice.time)}
        >
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
