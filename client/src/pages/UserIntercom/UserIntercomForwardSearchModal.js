import React from 'react';
import { FiSearch } from 'react-icons/fi';
import {
  IconButton,
  StatusIndicator,
  Modal,
  ModalContent,
  ModalHeader,
  SearchBox,
  SearchInput,
  ResultsList,
  ResultItem,
  ContactAvatar,
  ResultInfo,
  ResultName,
  ResultDetails,
  EmptyState,
} from './UserIntercom.styles';

export default function UserIntercomForwardSearchModal({
  callForward,
  forwardSearchResults,
  onClose,
  onSearchQueryChange,
  onSelectUser,
}) {
  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Forward Calls To...</h3>
          <IconButton type="button" onClick={onClose}>
            ×
          </IconButton>
        </ModalHeader>
        <SearchBox>
          <FiSearch />
          <SearchInput
            type="text"
            placeholder="Search by name, extension, employee ID, or SIP URI..."
            value={callForward.searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            autoFocus
          />
        </SearchBox>
        <ResultsList>
          {forwardSearchResults.length > 0 ? (
            forwardSearchResults.map((contact) => (
              <ResultItem key={contact.id} onClick={() => onSelectUser(contact)}>
                <ContactAvatar>
                  <StatusIndicator status={contact.status} size="small" />
                  {contact.name.substring(0, 2).toUpperCase()}
                </ContactAvatar>
                <ResultInfo>
                  <ResultName>{contact.name}</ResultName>
                  <ResultDetails>Ext: {contact.extension}</ResultDetails>
                </ResultInfo>
              </ResultItem>
            ))
          ) : (
            <EmptyState>
              {callForward.searchQuery.length >= 2
                ? 'No users found'
                : 'Type to search for users...'}
            </EmptyState>
          )}
        </ResultsList>
      </ModalContent>
    </Modal>
  );
}
