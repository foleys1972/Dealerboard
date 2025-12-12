const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const {
  createDirectContact,
  findDirectContacts,
  getDirectContactById,
  deleteDirectContact,
} = require('../services/databaseService');
const { authenticateToken } = require('./authRoutes');

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const ownerId =
      req.user.role === 'admin' && req.query.ownerId ? req.query.ownerId : req.user.id;

    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    const contacts = await findDirectContacts(ownerId);
    res.json({
      success: true,
      ownerId,
      contacts,
      count: contacts.length,
    });
  } catch (error) {
    logger.error('Failed to fetch direct contacts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch direct contacts' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      ownerId: requestedOwnerId,
      contactUserId,
      displayName,
      uri,
      extension,
      metadata = {},
    } = req.body;

    const targetOwnerId =
      req.user.role === 'admin' && requestedOwnerId ? requestedOwnerId : req.user.id;

    if (!targetOwnerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    if (!contactUserId && !uri) {
      return res
        .status(400)
        .json({ error: 'Either contactUserId or uri is required to add a contact' });
    }

    const normalizedDisplayName =
      displayName?.trim() ||
      metadata?.displayName ||
      metadata?.name ||
      'Direct Contact';

    const contactRecord = await createDirectContact({
      id: `dc_${Date.now()}_${uuidv4().slice(0, 8)}`,
      ownerId: targetOwnerId,
      contactUserId: contactUserId || null,
      displayName: normalizedDisplayName,
      uri: uri?.trim() || null,
      extension: extension?.toString().trim() || null,
      metadata,
      createdBy: req.user.id,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      contact: contactRecord,
      message: 'Direct contact added',
    });
  } catch (error) {
    logger.error('Failed to add direct contact:', error);
    res.status(500).json({ error: error.message || 'Failed to add direct contact' });
  }
});

router.delete('/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const contact = await getDirectContactById(contactId);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this contact' });
    }

    await deleteDirectContact(contactId);
    res.json({ success: true, message: 'Direct contact removed' });
  } catch (error) {
    logger.error('Failed to delete direct contact:', error);
    res.status(500).json({ error: error.message || 'Failed to delete direct contact' });
  }
});

module.exports = router;

