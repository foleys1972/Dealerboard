import React from 'react';
import { FiSearch, FiX, FiExternalLink } from 'react-icons/fi';
import {
  IconButton,
  SettingsPanel,
  SettingsHeader,
  SettingsContent,
  SettingsFooter,
  SettingsFooterButton,
  SettingGroup,
  SettingLabel,
  StatusSelect,
  UserDetails,
  DetailRow,
  DetailLabel,
  DetailValue,
  ForwardUserDisplay,
  ForwardUserInfo,
  ChangeButton,
  SelectButton,
  SectionSubtext,
} from './UserIntercom.styles';

export default function UserIntercomSettingsPanel({
  user,
  groupCalls,
  status,
  onStatusChange,
  callForward,
  onShowForwardSearch,
  onClose,
  onLeaveGroup,
  onOpenFullSettings,
}) {
  return (
    <SettingsPanel>
      <SettingsHeader>
        <h3>Quick Controls</h3>
        <IconButton onClick={onClose} aria-label="Close">
          <FiX />
        </IconButton>
      </SettingsHeader>
      <SettingsContent>
        <SettingGroup>
          <SettingLabel>Your Details</SettingLabel>
          <UserDetails>
            <DetailRow>
              <DetailLabel>Name:</DetailLabel>
              <DetailValue>{user.name}</DetailValue>
            </DetailRow>
            {user.sipUri && (
              <DetailRow>
                <DetailLabel>SIP URI:</DetailLabel>
                <DetailValue>{user.sipUri}</DetailValue>
              </DetailRow>
            )}
            {user.employeeId && (
              <DetailRow>
                <DetailLabel>Employee ID:</DetailLabel>
                <DetailValue>{user.employeeId}</DetailValue>
              </DetailRow>
            )}
          </UserDetails>
        </SettingGroup>

        <SettingGroup>
          <SettingLabel>Your Groups</SettingLabel>
          {groupCalls.length === 0 ? (
            <SectionSubtext>No groups assigned.</SectionSubtext>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {groupCalls.map((group) => (
                <div
                  key={group.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <div
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => onLeaveGroup(group.id)}
                    style={{
                      background: '#f59e0b',
                      color: '#111827',
                      border: 'none',
                      padding: '6px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 700,
                    }}
                    title="Remove yourself from this group"
                  >
                    Leave
                  </button>
                </div>
              ))}
            </div>
          )}
        </SettingGroup>

        <SettingGroup>
          <SettingLabel>Presence Status</SettingLabel>
          <StatusSelect value={status} onChange={(e) => onStatusChange(e.target.value)}>
            <option value="available">Available</option>
            <option value="busy">Busy</option>
            <option value="away">Away</option>
            <option value="dnd">Do Not Disturb</option>
          </StatusSelect>
          <SectionSubtext>
            Audio devices, notifications, and intercom mode are in full Settings.
          </SectionSubtext>
        </SettingGroup>

        <SettingGroup>
          <SettingLabel>Call Forward</SettingLabel>
          {callForward.forwardToUser ? (
            <ForwardUserDisplay>
              <ForwardUserInfo>
                <strong>{callForward.forwardToUser.name}</strong>
                <span>Ext: {callForward.forwardToUser.extension}</span>
              </ForwardUserInfo>
              <ChangeButton type="button" onClick={onShowForwardSearch}>
                Change
              </ChangeButton>
            </ForwardUserDisplay>
          ) : (
            <SelectButton type="button" onClick={onShowForwardSearch}>
              <FiSearch />
              Select Person to Forward To
            </SelectButton>
          )}
        </SettingGroup>
      </SettingsContent>
      <SettingsFooter>
        <SettingsFooterButton
          type="button"
          $variant="secondary"
          onClick={onOpenFullSettings}
        >
          <FiExternalLink />
          All Settings
        </SettingsFooterButton>
        <SettingsFooterButton type="button" $variant="primary" onClick={onClose}>
          Close
        </SettingsFooterButton>
      </SettingsFooter>
    </SettingsPanel>
  );
}
