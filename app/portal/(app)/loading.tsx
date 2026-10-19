/**
 * Every portal tab and detail page: the shell (rail, header) stays put and this skeleton shows
 * the moment a link is clicked, while the server loads the page. Nav links prefetch up to here.
 */
export default function PortalLoading() {
  return (
    <div className="pt-skel" role="status" aria-label="Loading">
      <div className="pt-head">
        <div>
          <i className="pt-sk pt-sk-eb" />
          <i className="pt-sk pt-sk-h1" />
        </div>
        <i className="pt-sk pt-sk-btn" />
      </div>
      {[0, 1, 2].map((k) => (
        <div className="pt-card" key={k}>
          <i className="pt-sk pt-sk-line" />
          <i className="pt-sk pt-sk-short" />
          <i className="pt-sk pt-sk-bar" />
        </div>
      ))}
    </div>
  );
}
