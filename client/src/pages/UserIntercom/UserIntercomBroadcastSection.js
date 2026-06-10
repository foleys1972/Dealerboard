import React from 'react';
import { FiRadio, FiMic } from 'react-icons/fi';
import {
  Section,
  SectionHeader,
  SectionTitle,
  Badge,
  SectionSubtext,
  BroadcastList,
  BroadcastItem,
  BroadcastHeader,
  BroadcastName,
  BroadcastTitleRow,
  BroadcastStats,
  BroadcastStat,
  OnAirPill,
  MonitorToggle,
  PushToTalkButton,
} from './UserIntercom.styles';

export default function UserIntercomBroadcastSection({
  broadcasts,
  broadcastLoading,
  broadcastError,
  activeBroadcastCount,
  speakingBroadcastId,
  showEditPanel,
  selectedEditColor,
  colorMap,
  buttonColor,
  onSetItemColor,
  onToggleBroadcast,
  onStartPushToTalk,
  onStopPushToTalk,
}) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>
          <FiRadio size={18} />
          <span>Broadcast Monitors</span>
        </SectionTitle>
        <Badge $active={activeBroadcastCount > 0}>{activeBroadcastCount} active</Badge>
      </SectionHeader>
      {broadcastLoading && <SectionSubtext>Updating broadcast list...</SectionSubtext>}
      {broadcastError && <SectionSubtext $error>{broadcastError}</SectionSubtext>}
      <BroadcastList>
        {broadcasts.map((broadcast) => (
          <BroadcastItem
            key={broadcast.id}
            $active={broadcast.active}
            $bgColor={colorMap[`broadcast:${broadcast.id}`] || buttonColor}
            onClick={(e) => {
              if (showEditPanel && selectedEditColor) {
                e.stopPropagation();
                onSetItemColor('broadcast', broadcast.id, selectedEditColor);
              }
            }}
          >
            <BroadcastHeader>
              <BroadcastName>
                <BroadcastTitleRow>
                  {broadcast.hoot?.state?.isActive && <OnAirPill>On Air</OnAirPill>}
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: '#ffffff',
                      fontWeight: 600,
                    }}
                  >
                    {broadcast.name}
                  </span>
                  <MonitorToggle
                    aria-label={broadcast.active ? 'Turn monitor off' : 'Turn monitor on'}
                    $active={broadcast.active}
                    disabled={broadcast.isToggling}
                    onClick={() => !broadcast.isToggling && onToggleBroadcast(broadcast.id)}
                    style={{ marginLeft: 8 }}
                  />
                </BroadcastTitleRow>
                {broadcast.active && (
                  <BroadcastStats>
                    <BroadcastStat title="Monitoring">
                      <strong>{broadcast.hoot?.state?.persistentListenerCount || 0}</strong>
                      <span style={{ opacity: 0.8 }}>monitoring</span>
                    </BroadcastStat>
                  </BroadcastStats>
                )}
              </BroadcastName>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {broadcast.active && (
                  <PushToTalkButton
                    type="button"
                    disabled={!broadcast.active}
                    $speaking={speakingBroadcastId === broadcast.id}
                    onMouseDown={() => broadcast.active && onStartPushToTalk(broadcast.id)}
                    onMouseUp={() => onStopPushToTalk(broadcast.id)}
                    onMouseLeave={() =>
                      speakingBroadcastId === broadcast.id && onStopPushToTalk(broadcast.id)
                    }
                    onTouchStart={(e) => {
                      e.preventDefault();
                      if (broadcast.active) onStartPushToTalk(broadcast.id);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      onStopPushToTalk(broadcast.id);
                    }}
                    onTouchCancel={(e) => {
                      e.preventDefault();
                      onStopPushToTalk(broadcast.id);
                    }}
                    style={{ width: 'auto', marginTop: 0 }}
                  >
                    <FiMic size={14} />
                    {speakingBroadcastId === broadcast.id ? 'Live' : 'PTT'}
                  </PushToTalkButton>
                )}
              </div>
            </BroadcastHeader>
          </BroadcastItem>
        ))}
      </BroadcastList>
    </Section>
  );
}
