import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { FiUserPlus, FiUserMinus, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../utils/api';

const AdminDirectContacts = () => {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [contactTab, setContactTab] = useState('manual');
  const [manualContact, setManualContact] = useState({
    displayName: '',
    uri: '',
    extension: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [directoryResults, setDirectoryResults] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await api.get('/api/auth/users');
        const userList = response.data?.users || [];
        setUsers(userList);
        if (userList.length > 0) {
          setSelectedUserId(userList[0].userId || userList[0].id);
        }
      } catch (error) {
        console.error('Failed to load users', error);
        toast.error(error.response?.data?.error || 'Failed to load users');
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    const loadContacts = async () => {
      try {
        setLoading(true);
        const response = await api.get('/api/direct-contacts', {
          params: { ownerId: selectedUserId },
        });
        setContacts(response.data?.contacts || []);
      } catch (error) {
        console.error('Failed to load contacts', error);
        toast.error(error.response?.data?.error || 'Failed to load contacts');
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, [selectedUserId]);

  const handleDeleteContact = async (contactId) => {
    try {
      await api.delete(`/api/direct-contacts/${contactId}`);
      toast.success('Contact removed');
      const response = await api.get('/api/direct-contacts', { params: { ownerId: selectedUserId } });
      setContacts(response.data?.contacts || []);
    } catch (error) {
      console.error('Failed to delete contact', error);
      toast.error(error.response?.data?.error || 'Failed to delete contact');
    }
  };

  const handleAddManualContact = async (event) => {
    event.preventDefault();
    if (!manualContact.displayName.trim() || !manualContact.uri.trim()) {
      toast.error('Name and URI are required');
      return;
    }
    try {
      setSaving(true);
      await api.post('/api/direct-contacts', {
        ownerId: selectedUserId,
        displayName: manualContact.displayName.trim(),
        uri: manualContact.uri.trim(),
        extension: manualContact.extension?.trim() || null,
      });
      toast.success('Contact added');
      setManualContact({ displayName: '', uri: '', extension: '' });
      setModalOpen(false);
      const response = await api.get('/api/direct-contacts', { params: { ownerId: selectedUserId } });
      setContacts(response.data?.contacts || []);
    } catch (error) {
      console.error('Failed to add contact', error);
      toast.error(error.response?.data?.error || 'Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDirectorySearch = async (query) => {
    setSearchTerm(query);
    if (!query || query.length < 2) {
      setDirectoryResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setDirectoryResults(
        users.map((user) => ({
          id: user.userId || user.id,
          name:
            user.displayName ||
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            user.username,
          extension: user.extension,
          email: user.email,
          sipUri: user.sipUri,
        }))
      );
    } catch (error) {
      console.error('Failed to search directory', error);
      toast.error(error.response?.data?.error || 'Failed to search directory');
    }
  };

  const handleAddDirectoryContact = async (user) => {
    try {
      setSaving(true);
      await api.post('/api/direct-contacts', {
        ownerId: selectedUserId,
        contactUserId: user.id,
        displayName: user.name,
        extension: user.extension || null,
        uri: user.sipUri || null,
        metadata: { email: user.email },
      });
      toast.success('Contact added');
      const response = await api.get('/api/direct-contacts', { params: { ownerId: selectedUserId } });
      setContacts(response.data?.contacts || []);
    } catch (error) {
      console.error('Failed to add contact', error);
      toast.error(error.response?.data?.error || 'Failed to add contact');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setContactTab('manual');
    setManualContact({ displayName: '', uri: '', extension: '' });
    setDirectoryResults([]);
    setSearchTerm('');
  };

  return (
    <Container>
      <Header>
        <h3>Direct Contacts</h3>
        <HeaderActions>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            {users.map((user) => (
              <option key={user.userId || user.id} value={user.userId || user.id}>
                {user.displayName || user.username}
              </option>
            ))}
          </select>
          <ActionButton onClick={() => setModalOpen(true)}>
            <FiUserPlus />
            Add Contact
          </ActionButton>
          <ActionButton onClick={() => selectedUserId && setSelectedUserId(selectedUserId)}>
            <FiRefreshCw />
            Refresh
          </ActionButton>
        </HeaderActions>
      </Header>

      {loading ? (
        <EmptyState>Loading contacts...</EmptyState>
      ) : contacts.length === 0 ? (
        <EmptyState>No contacts found for this user.</EmptyState>
      ) : (
        <ContactList>
          {contacts.map((contact) => (
            <ContactRow key={contact.id}>
              <div>
                <strong>{contact.displayName}</strong>
                <small>{contact.uri || (contact.extension ? `Ext: ${contact.extension}` : '')}</small>
              </div>
              <RemoveButton onClick={() => handleDeleteContact(contact.id)}>
                <FiUserMinus />
                Remove
              </RemoveButton>
            </ContactRow>
          ))}
        </ContactList>
      )}

      {modalOpen && (
        <ModalBackdrop onClick={handleCloseModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <h4>Assign Contact</h4>
              <CloseButton onClick={handleCloseModal}>×</CloseButton>
            </ModalHeader>
            <ModalTabs>
              <TabButton
                type="button"
                $active={contactTab === 'manual'}
                onClick={() => setContactTab('manual')}
              >
                Manual Entry
              </TabButton>
              <TabButton
                type="button"
                $active={contactTab === 'directory'}
                onClick={() => setContactTab('directory')}
              >
                Directory
              </TabButton>
            </ModalTabs>
            {contactTab === 'manual' ? (
              <Form onSubmit={handleAddManualContact}>
                <label>
                  Display Name
                  <input
                    type="text"
                    value={manualContact.displayName}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, displayName: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  SIP / URI
                  <input
                    type="text"
                    value={manualContact.uri}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, uri: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Extension (optional)
                  <input
                    type="text"
                    value={manualContact.extension}
                    onChange={(e) =>
                      setManualContact((prev) => ({ ...prev, extension: e.target.value }))
                    }
                  />
                </label>
                <ModalActions>
                  <SecondaryButton type="button" onClick={handleCloseModal}>
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton type="submit" disabled={saving}>
                    Save
                  </PrimaryButton>
                </ModalActions>
              </Form>
            ) : (
              <>
                <SearchInput
                  type="text"
                  placeholder="Search directory..."
                  value={searchTerm}
                  onChange={(e) => handleDirectorySearch(e.target.value)}
                />
                <DirectoryList>
                  {directoryResults.length === 0 ? (
                    <EmptyState>
                      {searchTerm.length < 2
                        ? 'Type to search directory'
                        : 'No users found'}
                    </EmptyState>
                  ) : (
                    directoryResults.map((user) => (
                      <DirectoryRow key={user.id}>
                        <div>
                          <strong>{user.name}</strong>
                          <small>
                            {user.extension ? `Ext: ${user.extension}` : user.email || 'Directory user'}
                          </small>
                        </div>
                        <PrimaryButton
                          type="button"
                          onClick={() => handleAddDirectoryContact(user)}
                          disabled={saving}
                        >
                          <FiUserPlus />
                          Add
                        </PrimaryButton>
                      </DirectoryRow>
                    ))
                  )}
                </DirectoryList>
              </>
            )}
          </Modal>
        </ModalBackdrop>
      )}
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;

  select {
    padding: 0.4rem 0.6rem;
    border-radius: 8px;
    border: 1px solid #d1d5db;
  }
`;

const ActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  background: #312e81;
  color: white;
  cursor: pointer;
`;

const ContactList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const ContactRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: white;

  strong {
    display: block;
    color: #111827;
  }

  small {
    color: #6b7280;
  }
`;

const RemoveButton = styled.button`
  border: none;
  background: #fee2e2;
  color: #b91c1c;
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
`;

const EmptyState = styled.div`
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  padding: 2rem;
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const CloseButton = styled.button`
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
`;

const ModalTabs = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const TabButton = styled.button`
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  font-weight: 600;
  background: ${({ $active }) => ($active ? '#312e81' : '#e0e7ff')};
  color: ${({ $active }) => ($active ? '#fff' : '#4338ca')};
  cursor: pointer;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: #374151;
  }

  input {
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 0.6rem 0.8rem;
    font-size: 0.95rem;
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
`;

const PrimaryButton = styled.button`
  border: none;
  background: #312e81;
  color: white;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
`;

const SecondaryButton = styled.button`
  border: none;
  background: #e5e7eb;
  color: #1f2937;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  cursor: pointer;
`;

const SearchInput = styled.input`
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 0.6rem 0.8rem;
  font-size: 0.95rem;
`;

const DirectoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const DirectoryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
`;

export default AdminDirectContacts;

