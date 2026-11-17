// Notices from the engine (e.g. a command the central unit cannot do). Shown
// with text and an icon; dismissed with a button, never with Esc (Esc is
// STOP).
import {strings} from '../../../shared/strings';
import {useEngineStore} from '../store/engineStore';

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
          <span className="notice-text">{strings.notices[notice.code]}</span>
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
