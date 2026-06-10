import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';

export function useUserIntercomContactModal({ loadDirectContacts, setContactsLoading }) {
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactModalTab, setContactModalTab] = useState('manual');
  const [manualContact, setManualContact] = useState({
    displayName: '',
    uri: '',
    extension: '',
  });
  const [directorySearchResults, setDirectorySearchResults] = useState([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');

  const openContactModal = useCallback(() => setShowContactModal(true), []);

  const closeContactModal = useCallback(() => {
    setShowContactModal(false);
    setContactModalTab('manual');
    setManualContact({ displayName: '', uri: '', extension: '' });
    setDirectorySearchResults([]);
    setContactSearchTerm('');
  }, []);

  const handleAddManualContact = useCallback(
    async (event) => {
      event.preventDefault();
      if (!manualContact.displayName.trim() || !manualContact.uri.trim()) {
        toast.error('Name and URI are required');
        return;
      }
      try {
        setContactsLoading(true);
        await api.post('/api/direct-contacts', {
          displayName: manualContact.displayName.trim(),
          uri: manualContact.uri.trim(),
          extension: manualContact.extension?.trim() || null,
        });
        toast.success('Contact added');
        closeContactModal();
        loadDirectContacts();
      } catch (error) {
        console.error('Failed to add contact', error);
        toast.error(error.response?.data?.error || 'Failed to add contact');
      } finally {
        setContactsLoading(false);
      }
    },
    [manualContact, closeContactModal, loadDirectContacts, setContactsLoading]
  );

  const handleDirectorySearch = useCallback(async (query) => {
    setContactSearchTerm(query);
    if (!query || query.length < 2) {
      setDirectorySearchResults([]);
      return;
    }
    try {
      const response = await api.get('/api/auth/users/search', {
        params: { q: query, limit: 10 },
      });
      const users = response.data?.users || [];
      setDirectorySearchResults(
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
  }, []);

  const handleAddDirectoryContact = useCallback(
    async (user) => {
      try {
        setContactsLoading(true);
        await api.post('/api/direct-contacts', {
          contactUserId: user.id,
          displayName: user.name,
          extension: user.extension || null,
          uri: user.sipUri || null,
          metadata: { email: user.email },
        });
        toast.success('Contact added');
        loadDirectContacts();
      } catch (error) {
        console.error('Failed to add directory contact', error);
        toast.error(error.response?.data?.error || 'Failed to add contact');
      } finally {
        setContactsLoading(false);
      }
    },
    [loadDirectContacts, setContactsLoading]
  );

  return {
    showContactModal,
    openContactModal,
    closeContactModal,
    contactModalTab,
    setContactModalTab,
    manualContact,
    setManualContact,
    directorySearchResults,
    contactSearchTerm,
    handleAddManualContact,
    handleDirectorySearch,
    handleAddDirectoryContact,
  };
}
