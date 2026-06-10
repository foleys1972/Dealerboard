/**
 * Normalize dealerboard button assignment shape from GET /api/dealerboard/config/:userId.
 * Backend uses assignmentType; older UI code expected assignment.type with snake_case values.
 */

export function getAssignmentType(assignment) {
  if (!assignment) return null;
  const raw = assignment.assignmentType || assignment.type;
  if (!raw) return null;
  const normalized = String(raw).trim();
  if (normalized === 'line') return 'privateWire';
  if (normalized === 'speed_dial') return 'speedDial';
  return normalized;
}

export function isSpeedDialAssignment(assignment) {
  return getAssignmentType(assignment) === 'speedDial';
}

export function isPrivateWireAssignment(assignment) {
  return getAssignmentType(assignment) === 'privateWire';
}

export function isDdiLineAssignment(assignment) {
  return getAssignmentType(assignment) === 'ddiLine';
}

export function getPageAssignmentsMap(dealerboardConfig, pageNumber) {
  if (!dealerboardConfig?.assignments) return {};
  return dealerboardConfig.assignments[pageNumber]
    || dealerboardConfig.assignments[String(pageNumber)]
    || {};
}

export function getButtonAssignment(pageAssignments, buttonNumber) {
  if (!pageAssignments) return null;
  return pageAssignments[buttonNumber] || pageAssignments[String(buttonNumber)] || null;
}

export function resolveAssignmentLineId(assignment) {
  if (!assignment) return null;
  return assignment.lineId || assignment.ddiLineId || null;
}

export function resolveAssignmentLabel(assignment, { lines = [], speedDials = [] } = {}) {
  if (!assignment) return 'Empty';

  const type = getAssignmentType(assignment);

  if (type === 'speedDial') {
    return assignment.metadata?.label
      || speedDials.find((s) => s.id === assignment.speedDialId)?.name
      || assignment.metadata?.name
      || assignment.metadata?.number
      || 'Speed Dial';
  }

  const lineId = resolveAssignmentLineId(assignment);
  const line = lineId ? lines.find((l) => String(l.id) === String(lineId)) : null;

  if (line) {
    return line.label || line.lineName || line.name || line.lineLabel || 'Line';
  }

  if (type === 'privateWire') return assignment.metadata?.label || 'Private Wire';
  if (type === 'ddiLine') return assignment.metadata?.label || 'DDI Line';
  if (type === 'broadcast') return assignment.label || assignment.metadata?.label || 'Broadcast';
  if (type === 'groupCall') return assignment.label || assignment.metadata?.label || 'Group';

  return assignment.metadata?.label || 'Assigned';
}

export function resolvePrivateWireMode(line, assignment) {
  const fromLine = (line?.mode || '').toString().trim().toUpperCase();
  if (['ARD', 'MRD', 'HOOT'].includes(fromLine)) return fromLine;

  const meta = assignment?.metadata;
  if (meta && typeof meta === 'object') {
    const fromMeta = (meta.mode || meta.lineMode || '').toString().trim().toUpperCase();
    if (['ARD', 'MRD', 'HOOT'].includes(fromMeta)) return fromMeta;
    const st = (meta.signalling_type || meta.signallingType || '').toString().trim().toUpperCase();
    if (st === 'AUTO_RINGDOWN') return 'ARD';
    if (st === 'MANUAL_RINGDOWN') return 'MRD';
    if (st === 'NONE') return 'HOOT';
  }

  return fromLine || 'ARD';
}

export function resolveAssignmentTypeLabel(assignment, line) {
  const type = getAssignmentType(assignment);
  if (type === 'speedDial') return 'SPEED';
  if (line?.type === 'private_wire') return line.mode || 'PW';
  if (line?.type === 'DDI' || type === 'ddiLine') return 'DDI';
  if (type === 'privateWire') return 'PW';
  if (type === 'broadcast') return 'BCAST';
  if (type === 'groupCall') return 'GROUP';
  return type ? String(type).toUpperCase() : '';
}

/** Visual metadata for assignment type chips / button accents in admin layout. */
export const ASSIGNMENT_TYPE_META = {
  privateWire: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: '#22c55e',
    short: 'PW',
    label: 'Private Wire',
  },
  ddiLine: {
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: '#3b82f6',
    short: 'DDI',
    label: 'DDI Line',
  },
  speedDial: {
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: '#a855f7',
    short: 'SPD',
    label: 'Speed Dial',
  },
  broadcast: {
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: '#f59e0b',
    short: 'BCAST',
    label: 'Broadcast',
  },
  viewingKey: {
    color: '#06b6d4',
    bg: 'rgba(6, 182, 212, 0.12)',
    border: '#06b6d4',
    short: 'RING',
    label: 'Soft Ring Key',
  },
  callForward: {
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: '#eab308',
    short: 'FWD',
    label: 'Call Forward',
  },
  dialTone: {
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: '#64748b',
    short: 'DIAL',
    label: 'Dial Tone',
  },
};

export function getAssignmentTypeMeta(assignment) {
  const type = getAssignmentType(assignment);
  if (type && ASSIGNMENT_TYPE_META[type]) return ASSIGNMENT_TYPE_META[type];
  return {
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.12)',
    border: '#6b7280',
    short: 'LINE',
    label: 'Line',
  };
}

export function getLineKindMeta(kind) {
  if (kind === 'privateWire') return ASSIGNMENT_TYPE_META.privateWire;
  if (kind === 'ddiLine') return ASSIGNMENT_TYPE_META.ddiLine;
  if (kind === 'broadcast') return ASSIGNMENT_TYPE_META.broadcast;
  return getAssignmentTypeMeta(null);
}
