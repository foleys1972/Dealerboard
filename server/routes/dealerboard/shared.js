const {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
  isAdminRole,
} = require('../../services/dealerboard/validators');
const { resolveUserDbId } = require('../../db/dealerboard/helpers');
const {
  getDealerboardConfigGroup,
  shouldPropagateDealerboardAssignment,
  syncDealerboardAssignmentsFromUser,
} = require('../../db/dealerboard/configGroups');

module.exports = {
  normalizeSbcDetails,
  validateSbcDetails,
  validatePrivateWirePayload,
  generateSudoLineReference,
  modeToSignallingType,
  isAdminRole,
  resolveUserDbId,
  getDealerboardConfigGroup,
  shouldPropagateDealerboardAssignment,
  syncDealerboardAssignmentsFromUser,
};
