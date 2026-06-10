const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../authRoutes');
const { matrixService } = require('../../services/matrixService');
const { getOrchestratorService } = require('../../services/orchestratorService');
const { requireAdmin, handleServiceError } = require('./routeHelpers');
const { lookupAssignmentForRoom } = require('../../services/matrix/roomAssignmentService');
const { isAdminRole } = require('../../services/dealerboard/validators');
const { MatrixRouteError } = require('../../services/matrix/errors');

router.get('/orchestrator/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const orchestratorService = getOrchestratorService();
    res.json({ success: true, ...orchestratorService.getStatus() });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get orchestrator status');
  }
});

router.post('/orchestrator/rooms/create', authenticateToken, async (req, res) => {
  try {
    const { groupId, groupData, participantIds } = req.body;
    if (!groupId) throw new MatrixRouteError(400, 'Group ID is required');

    const orchestratorService = getOrchestratorService();
    if (!orchestratorService.isInitialized) {
      throw new MatrixRouteError(503, 'Orchestrator service not initialized');
    }

    const decision = await orchestratorService.coordinateRoomCreation(
      { groupId, ...groupData },
      participantIds || []
    );

    const roomId = await matrixService.createGroupRoom(groupId, groupData, {
      homeserverId: decision.homeserverId,
    });

    const assignment = await lookupAssignmentForRoom(roomId);

    res.json({
      success: true,
      roomId,
      decision,
      assignment,
      message: 'Room created successfully via orchestrator',
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to create room');
  }
});

router.get('/orchestrator/users/:userId/homeserver', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id || req.user.userId;

    if (userId !== currentUserId && !isAdminRole(req.user.role)) {
      throw new MatrixRouteError(403, 'Access denied');
    }

    const orchestratorService = getOrchestratorService();
    if (!orchestratorService.isInitialized) {
      throw new MatrixRouteError(503, 'Orchestrator service not initialized');
    }

    const homeserver = await orchestratorService.getUserHomeserver(userId);
    const userRegion = await orchestratorService.getUserRegion(userId);

    res.json({
      success: true,
      userId,
      region: userRegion,
      homeserver: {
        id: homeserver.id,
        serverName: homeserver.serverName,
        region: homeserver.region,
        baseUrl: homeserver.baseUrl,
        federationUrl: homeserver.federationUrl,
      },
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get user homeserver');
  }
});

router.get('/rooms/:roomId/participants', authenticateToken, async (req, res) => {
  try {
    const orchestratorService = getOrchestratorService();
    const participants = await orchestratorService.getRoomParticipants(req.params.roomId);
    res.json({
      success: true,
      roomId: req.params.roomId,
      participants,
      count: participants.length,
    });
  } catch (error) {
    handleServiceError(res, error, 'Failed to get room participants');
  }
});

module.exports = router;
