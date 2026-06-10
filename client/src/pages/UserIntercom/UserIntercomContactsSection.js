import React from 'react';
import { FiPhoneCall, FiPlus, FiVideo, FiPhoneOff } from 'react-icons/fi';
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
  ContactActions,
  CallActionButton,
  EmptyState,
} from './UserIntercom.styles';

export default function UserIntercomContactsSection({
  gridConfig,
  directContacts,
  contactsLoading,
  onlineUsers,
  isInCall,
  instantCall,
  showEditPanel,
  deleteMode,
  selectedEditColor,
  colorMap,
  buttonColor,
  onOpenContactModal,
  onStartDirectCall,
  onDisconnectCall,
  onDeleteDirectContact,
  onSetItemColor,
}) {
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>
          <FiPhoneCall size={18} />
          <span>Direct Contacts</span>
        </SectionTitle>
        <AddContactButton onClick={onOpenContactModal}>
          <FiPlus size={16} />
          <span>Add</span>
        </AddContactButton>
      </SectionHeader>
      {contactsLoading && <SectionSubtext>Loading contacts...</SectionSubtext>}
      <ContactList
        $columns={gridConfig.contactColumns}
        $gap={gridConfig.contactGap}
        $mobileColumns={gridConfig.contactMobileColumns}
      >
        {directContacts.length === 0 && !contactsLoading ? (
          <EmptyState>
            <p>No contacts saved yet. Add someone from the directory or enter a URI.</p>
          </EmptyState>
        ) : null}
        {directContacts.map((contact) => {
          const contactId = String(contact.contactUserId || contact.id || '');
          const isOnline = !!(contactId && onlineUsers[contactId]);
          const inParticipants =
            Array.isArray(instantCall?.participants) && contactId
              ? instantCall.participants.map(String).includes(contactId)
              : false;
          const inDirect =
            instantCall?.type === 'direct' && contactId
              ? String(instantCall?.contact?.id || '') === contactId
              : false;
          const isBusy = !!(instantCall && (inParticipants || inDirect));
          const isInCallWithThisContact = isBusy;

          return (
            <ContactItem
              key={contact.id}
              disabled={isInCall && !instantCall?.isGroupCall && !isInCallWithThisContact}
              $bgColor={colorMap[`contact:${contact.id}`] || buttonColor}
              onClick={(e) => {
                if (showEditPanel) {
                  e.stopPropagation();
                  if (deleteMode) {
                    onDeleteDirectContact(contact.id);
                    return;
                  }
                  if (selectedEditColor) {
                    onSetItemColor('contact', contact.id, selectedEditColor);
                  }
                  return;
                }
                if (isInCallWithThisContact) {
                  onDisconnectCall();
                  return;
                }
                onStartDirectCall(contact, false);
              }}
            >
              <ContactInfo>
                <ContactName>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isBusy
                            ? '#ef4444'
                            : isOnline
                              ? '#10b981'
                              : 'rgba(255,255,255,0.35)',
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: '#ffffff',
                        }}
                      >
                        @{contact.username || contact.displayName}
                      </span>
                    </div>
                    <ContactActions>
                      {!isInCallWithThisContact && (
                        <>
                          <CallActionButton
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartDirectCall(contact, false);
                            }}
                            title="Voice Call"
                            $variant="voice"
                          >
                            <FiPhoneCall size={16} />
                          </CallActionButton>
                          <CallActionButton
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartDirectCall(contact, true);
                            }}
                            title="Video Call"
                            $variant="video"
                          >
                            <FiVideo size={16} />
                          </CallActionButton>
                        </>
                      )}
                      {isInCallWithThisContact && (
                        <CallActionButton
                          onClick={(e) => {
                            e.stopPropagation();
                            onDisconnectCall();
                          }}
                          title="End Call"
                          $variant="danger"
                        >
                          <FiPhoneOff size={16} />
                          <span>End</span>
                        </CallActionButton>
                      )}
                    </ContactActions>
                  </div>
                </ContactName>
              </ContactInfo>
            </ContactItem>
          );
        })}
      </ContactList>
    </Section>
  );
}
