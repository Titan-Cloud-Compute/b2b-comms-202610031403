export const VENDOR_STYLES = `
  .vendor-page { max-width: 720px; padding: 24px; color: var(--color-text-primary); font-family: var(--font-body); }
  .vendor-page h1 { font-family: var(--font-display); font-size: var(--font-size-xl); margin: 0 0 8px; }
  .vendor-page p.hint { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
  .vendor-card { background: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 16px; margin: 16px 0; }
  .vendor-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .vendor-field label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
  .vendor-field input, .vendor-field select { font-size: var(--font-size-input); padding: 8px; border: 1px solid var(--color-border); border-radius: var(--radius-btn); background: var(--color-bg-primary); color: var(--color-text-primary); }
  .vendor-btn { background: var(--color-primary); color: var(--color-white); border: none; border-radius: var(--radius-btn); padding: 8px 16px; cursor: pointer; }
  .vendor-btn:disabled { opacity: .6; cursor: default; }
  .vendor-error { color: var(--color-text-primary); background: var(--color-bg-tertiary); padding: 8px; border-radius: var(--radius-btn); }
  .vendor-doc-list { list-style: none; padding: 0; margin: 0; }
  .vendor-doc-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border); }
  .vendor-badge { font-size: var(--font-size-sm); padding: 2px 8px; border-radius: var(--radius-btn); background: var(--color-primary-light); color: var(--color-text-primary); }
  .vendor-links a { color: var(--color-primary); margin-right: 16px; }
`;
