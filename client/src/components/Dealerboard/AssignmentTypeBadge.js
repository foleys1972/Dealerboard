import React from 'react';

/**
 * Small type indicator for dealerboard assignment admin UI.
 */
export function LineTypeBadge({ meta, showLabel = false }) {
  if (!meta) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        borderRadius: '4px',
        padding: '0.12rem 0.4rem',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: meta.color,
          flexShrink: 0,
        }}
      />
      {showLabel ? meta.label : meta.short}
    </span>
  );
}

export function AssignmentLabelPreview({ label, meta, subtitle }) {
  if (!meta) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.65rem 0.75rem',
        borderLeft: `4px solid ${meta.border}`,
        background: meta.bg,
        borderRadius: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <LineTypeBadge meta={meta} showLabel />
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'inherit' }}>{label}</span>
      </div>
      {subtitle ? (
        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{subtitle}</div>
      ) : null}
    </div>
  );
}
