/** The cover hinges around the spine; the rest of the app keeps its original book icon. */
export function DiaryIcon() {
  return <svg className="diary-book" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <g className="diary-pages">
      <path d="M12 5c3-2 6-2 9-1v15c-3-1-6-1-9 1" />
      <path d="M15 8h3M15 11h3M15 14h3" />
    </g>
    <g className="diary-cover">
      <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1Z" />
      <path d="M6 8h3M6 11h3" />
    </g>
    <path d="M12 5v15" />
  </svg>;
}
