import React from 'react';
import { FiSearch, FiUserPlus } from 'react-icons/fi';
import {
  IconButton,
  Modal,
  ModalContent,
  ModalHeader,
  ContactTabs,
  ContactTab,
  ContactForm,
  FormField,
  ContactInput,
  ContactModalActions,
  ContactModalButton,
  DirectoryResult,
  DirectoryAddButton,
  SearchBox,
  SearchInput,
  ResultsList,
  ContactInfo,
  ContactName,
  ContactStatus,
  EmptyState,
} from './UserIntercom.styles';

export default function UserIntercomContactModal({
  contactsLoading,
  contactModalTab,
  onTabChange,
  manualContact,
  onManualContactChange,
  contactSearchTerm,
  directorySearchResults,
  onClose,
  onAddManualContact,
  onDirectorySearch,
  onAddDirectoryContact,
}) {
  return (
    <Modal onClick={onClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <h3>Manage Direct Contacts</h3>
          <IconButton type="button" onClick={onClose}>
            ×
          </IconButton>
        </ModalHeader>
        <ContactTabs>
          <ContactTab
            type="button"
            $active={contactModalTab === 'manual'}
            onClick={() => onTabChange('manual')}
          >
            Manual Entry
          </ContactTab>
          <ContactTab
            type="button"
            $active={contactModalTab === 'directory'}
            onClick={() => onTabChange('directory')}
          >
            Directory
          </ContactTab>
        </ContactTabs>

        {contactModalTab === 'manual' ? (
          <ContactForm onSubmit={onAddManualContact}>
            <FormField>
              <label>Name</label>
              <ContactInput
                type="text"
                value={manualContact.displayName}
                onChange={(e) =>
                  onManualContactChange((prev) => ({
                    ...prev,
                    displayName: e.target.value,
                  }))
                }
                placeholder="Bloomberg Sales"
                required
              />
            </FormField>
            <FormField>
              <label>SIP / URI</label>
              <ContactInput
                type="text"
                value={manualContact.uri}
                onChange={(e) =>
                  onManualContactChange((prev) => ({ ...prev, uri: e.target.value }))
                }
                placeholder="sip:desk01@example.com"
                required
              />
            </FormField>
            <FormField>
              <label>Extension (optional)</label>
              <ContactInput
                type="text"
                value={manualContact.extension}
                onChange={(e) =>
                  onManualContactChange((prev) => ({
                    ...prev,
                    extension: e.target.value,
                  }))
                }
                placeholder="1234"
              />
            </FormField>
            <ContactModalActions>
              <ContactModalButton type="button" $variant="secondary" onClick={onClose}>
                Cancel
              </ContactModalButton>
              <ContactModalButton type="submit" $variant="primary" disabled={contactsLoading}>
                Save Contact
              </ContactModalButton>
            </ContactModalActions>
          </ContactForm>
        ) : (
          <>
            <SearchBox>
              <FiSearch />
              <SearchInput
                type="text"
                placeholder="Search company directory..."
                value={contactSearchTerm}
                onChange={(e) => onDirectorySearch(e.target.value)}
                autoFocus
              />
            </SearchBox>
            <ResultsList>
              {directorySearchResults.length === 0 ? (
                <EmptyState>
                  {contactSearchTerm.length < 2
                    ? 'Type at least two characters to search.'
                    : 'No users found in the directory.'}
                </EmptyState>
              ) : (
                directorySearchResults.map((user) => (
                  <DirectoryResult key={user.id}>
                    <ContactInfo>
                      <ContactName>{user.name}</ContactName>
                      <ContactStatus>
                        {user.extension ? `Ext: ${user.extension}` : user.email || 'Directory'}
                      </ContactStatus>
                    </ContactInfo>
                    <DirectoryAddButton
                      type="button"
                      onClick={() => onAddDirectoryContact(user)}
                      disabled={contactsLoading}
                    >
                      <FiUserPlus />
                      Add
                    </DirectoryAddButton>
                  </DirectoryResult>
                ))
              )}
            </ResultsList>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
