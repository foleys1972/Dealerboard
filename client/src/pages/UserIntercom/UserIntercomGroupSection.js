import React from 'react';
import { FiUsers, FiPlus } from 'react-icons/fi';
import {
  Section,
  SectionHeader,
  SectionTitle,
  SectionSubtext,
  AddContactButton,
  ContactList,
  ContactItem,
  ContactInfo,
  ContactName,
  OnlineBadge,
  EmptyState,
} from './UserIntercom.styles';
import { getParticipantId } from './useUserIntercomCalls';

export default function UserIntercomGroupSection({
  gridConfig,
  groupCalls,
  groupCallLoading,
  groupCallError,
  isInCall,
  instantCall,
  onlineUserIds,
  authUser,
  showEditPanel,
  selectedEditColor,
  colorMap,
  buttonColor,
  onOpenNewGroupModal,
  onStartGroupCall,
  onSetItemColor,
}) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>
          <FiUsers size={18} />
          <span>Group Calls</span>
        </SectionTitle>
        <AddContactButton onClick={onOpenNewGroupModal} title="Create Group">
          <FiPlus size={16} />
          <span>New Group</span>
        </AddContactButton>
      </SectionHeader>
      {groupCallLoading && <SectionSubtext>Loading groups...</SectionSubtext>}
      {groupCallError && <SectionSubtext $error>{groupCallError}</SectionSubtext>}
      <ContactList
        $columns={gridConfig.contactColumns}
        $gap={gridConfig.contactGap}
        $mobileColumns={gridConfig.contactMobileColumns}
      >
        {groupCalls.length === 0 && !groupCallLoading ? (
          <EmptyState>
            <p>No groups available yet.</p>
          </EmptyState>
        ) : null}
        {groupCalls.map((group) => (
          <ContactItem
            key={group.id}
            disabled={isInCall && !instantCall?.isGroupCall}
            $bgColor={colorMap[`group:${group.id}`] || buttonColor}
            onClick={(e) => {
              if (showEditPanel) {
                if (selectedEditColor) {
                  e.stopPropagation();
                  onSetItemColor('group', group.id, selectedEditColor);
                }
                return;
              }
              onStartGroupCall(group);
            }}
          >
            <ContactInfo>
              <ContactName style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#ffffff',
                  }}
                >
                  {group.name}
                </span>
                {Array.isArray(group.participants) && group.participants.length > 0 ? (
                  <OnlineBadge title="Online participants">
                    {(() => {
                      const ids = group.participants
                        .map((p) => getParticipantId(p))
                        .filter(Boolean);
                      const base = ids.filter((id) => onlineUserIds.has(String(id))).length;
                      const selfId = String(authUser?.id || authUser?.userId || '');
                      const includeSelf =
                        selfId && ids.includes(selfId) && !onlineUserIds.has(selfId) ? 1 : 0;
                      return base + includeSelf;
                    })()}
                  </OnlineBadge>
                ) : null}
              </ContactName>
            </ContactInfo>
          </ContactItem>
        ))}
      </ContactList>
    </Section>
  );
}
