import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { fetchIntercomButtonLayout } from '../../utils/intercomButtonLayout';

export function useUserIntercomDirectContacts(userId) {
  const [directContacts, setDirectContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const loadDirectContacts = useCallback(async () => {
    if (!userId) return;
    try {
      setContactsLoading(true);
      const layout = await fetchIntercomButtonLayout(userId);

      const contacts = layout.contactSlots
        .filter((slot) => slot.contactUserId)
        .map((slot) => ({
          id: `slot-${slot.index}`,
          slotIndex: slot.index,
          contactUserId: slot.contactUserId,
          displayName: slot.label || slot.contactUserId,
          username: slot.contactUserId,
        }));

      setDirectContacts(contacts);
    } catch (error) {
      console.error('Failed to load direct contacts', error);
      toast.error(error.response?.data?.error || 'Failed to load direct contacts');
    } finally {
      setContactsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadDirectContacts();
  }, [loadDirectContacts]);

  const deleteDirectContact = useCallback(
    async (_contactId) => {
      toast.error('Direct contact buttons are configured by an administrator.');
    },
    []
  );

  return {
    directContacts,
    setDirectContacts,
    contactsLoading,
    setContactsLoading,
    loadDirectContacts,
    deleteDirectContact,
  };
}
