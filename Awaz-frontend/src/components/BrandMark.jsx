export default function BrandMark({ small = false }) {
  return (
    <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 44 44" fill="none">
        <path d="M22 8v14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M15 19v3a7 7 0 0 0 14 0v-3" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M22 29v7m-6 0h12" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M9 18v5m26-5v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity=".58" />
      </svg>
    </span>
  );
}
