import { Icon } from "./Icon";

/** "Google Calendar" and "Add to calendar (.ics)" side by side (phase 1, 27 Oct 2026). */
export function AddToCalendar({
  google,
  ics,
  admin = false,
}: {
  google: string;
  ics: string | null;
  admin?: boolean;
}) {
  const btn = admin ? "ad-btn ghost small" : "btn btn-g btn-s pt-btn-sm";
  return (
    <div className={admin ? "ad-btns" : "pt-cal-links"} data-testid="add-to-calendar">
      <a className={btn} href={google} target="_blank" rel="noopener noreferrer">
        {!admin && <Icon name="calendar" size={16} />} Google Calendar
      </a>
      {ics && (
        <a className={btn} href={ics} download aria-label="Add to calendar (.ics file)">
          {!admin && <Icon name="ics" size={16} />} Add to calendar (.ics)
        </a>
      )}
    </div>
  );
}
