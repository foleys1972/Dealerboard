import React from 'react';
import { FiSearch } from 'react-icons/fi';
import {
  IconButton,
  Modal,
  ModalContent,
  ModalHeader,
  ContactForm,
  FormField,
  ContactInput,
  DeviceSelect,
  SearchBox,
  SearchInput,
  ResultsList,
  ResultItem,
  ContactInfo,
  ContactName,
  ContactStatus,
  ContactModalActions,
  ContactModalButton,
  MonitorToggle,
  ToggleTrack,
  ToggleThumb,
} from './UserIntercom.styles';

export default function UserIntercomNewGroupModal({
  newGroupName,
  onNewGroupNameChange,
  newGroupAudioMode,
  onNewGroupAudioModeChange,
  newGroupPolicy,
  onNewGroupPolicyChange,
  newGroupSearch,
  newGroupResults,
  newGroupSelected,
  onSearchUsers,
  onToggleSelectUser,
  onClose,
  onCreateGroup,
}) {
  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Create Group</h3>
          <IconButton type="button" onClick={onClose}>
            ×
          </IconButton>
        </ModalHeader>
        <ContactForm onSubmit={onCreateGroup}>
          <FormField>
            <label>Group name</label>
            <ContactInput
              type="text"
              value={newGroupName}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              placeholder="Trading Desk A"
              required
            />
          </FormField>
          <FormField>
            <label>Audio mode</label>
            <DeviceSelect
              value={newGroupAudioMode}
              onChange={(e) => onNewGroupAudioModeChange(e.target.value)}
            >
              <option value="ptt">Push-to-Talk</option>
              <option value="open">Mic Open</option>
            </DeviceSelect>
          </FormField>
          <FormField>
            <label>First responder policy</label>
            <DeviceSelect
              value={newGroupPolicy}
              onChange={(e) => onNewGroupPolicyChange(e.target.value)}
            >
              <option value="group">Stay as group</option>
              <option value="firstResponder1to1">First answer → 1:1</option>
            </DeviceSelect>
          </FormField>
          <FormField>
            <label>Add participants</label>
            <SearchBox>
              <FiSearch />
              <SearchInput
                type="text"
                placeholder="Search directory..."
                value={newGroupSearch}
                onChange={(e) => onSearchUsers(e.target.value)}
                autoFocus
              />
            </SearchBox>
            <ResultsList>
              {newGroupResults.map((u) => {
                const selected = newGroupSelected.some((s) => s.id === u.id);
                return (
                  <ResultItem
                    key={u.id}
                    onClick={() => onToggleSelectUser(u)}
                    style={{ background: selected ? '#0f172a' : undefined }}
                  >
                    <ContactInfo>
                      <ContactName>{u.name}</ContactName>
                      <ContactStatus>{u.email || 'Directory'}</ContactStatus>
                    </ContactInfo>
                    <MonitorToggle $active={selected}>
                      <ToggleTrack $active={selected}>
                        <ToggleThumb $active={selected} />
                      </ToggleTrack>
                    </MonitorToggle>
                  </ResultItem>
                );
              })}
            </ResultsList>
          </FormField>
          <ContactModalActions>
            <ContactModalButton type="button" $variant="secondary" onClick={onClose}>
              Cancel
            </ContactModalButton>
            <ContactModalButton type="submit" $variant="primary">
              Create Group
            </ContactModalButton>
          </ContactModalActions>
        </ContactForm>
      </ModalContent>
    </Modal>
  );
}
